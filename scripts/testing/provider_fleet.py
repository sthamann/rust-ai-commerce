"""Configure one encrypted synthetic provider for all test workers, then restore the isolated control-plane row."""
from contextlib import contextmanager
import json, os, subprocess, time, uuid
from .database import psql


@contextmanager
def shared_provider(call, endpoint):
    def sql(statement):
        return subprocess.check_output(psql(os.environ['DB_CONTAINER'], 'commerce',
            os.environ['TEST_DATABASE'], '-XqAt', '-v', 'ON_ERROR_STOP=1'),
            input=statement, text=True).strip()
    suffix=uuid.uuid4().hex[:12]
    owner=call('/api/auth/register',{'workspaceId':'provider-fleet-'+suffix,
        'workspaceName':'Synthetic fleet provider','name':'Fixture operator',
        'email':suffix+'@example.test','password':'Synthetic-provider-2026!'},headers={})
    h={'Authorization':'Bearer '+owner['token'],'x-tenant':owner['workspace']}
    sql(f"INSERT INTO platform_operators(user_id) VALUES('{owner['user']['id']}');")
    original=json.loads(sql("SELECT jsonb_build_object('data',data,'secrets',secrets)::text FROM platform_ai WHERE id=true;"))
    view=call('/api/platform/ai',headers=h)
    config=view['settings']
    config['providers']['openai']={'endpoint':endpoint,'enabled':True,'model':'fixture-extraction'}
    try:
        call('/api/platform/ai',{'revision':view['revision'],'settings':config,
            'keys':{'openai':'contract-openai'}},h,method='PUT')
        # The existing cross-replica configuration cache has a five-second ceiling.
        time.sleep(5.1)
        yield
    finally:
        data=json.dumps(original['data']).replace("'","''")
        secrets=json.dumps(original['secrets']).replace("'","''")
        sql(f"UPDATE platform_ai SET data='{data}'::jsonb,secrets='{secrets}'::jsonb,revision=revision+1 WHERE id=true; DELETE FROM platform_operators WHERE user_id='{owner['user']['id']}';")
        time.sleep(5.1)
