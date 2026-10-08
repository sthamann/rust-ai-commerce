"""Native document-event extraction, review boundary and shared AI quotas; local provider only."""
import json, os, subprocess, time, uuid
from .database import psql


def verify_extraction(call, captured, behavior, passed):
    suffix = uuid.uuid4().hex[:12]
    owner = call('/api/auth/register', {'workspaceId': 'extract-'+suffix,
        'workspaceName': 'Extraction fixture', 'name': 'Owner',
        'email': suffix+'@example.test', 'password': 'Synthetic-extraction-2026!'}, headers={})
    tenant = owner['workspace']
    h = {'Authorization': 'Bearer '+owner['token'], 'x-tenant': tenant}
    def sql(statement):
        return subprocess.check_output(psql(os.environ['DB_CONTAINER'], 'commerce',
            os.environ['TEST_DATABASE'], '-XqAt', '-v', 'ON_ERROR_STOP=1'),
            input=statement, text=True).strip()
    def attempts():
        return int(sql(f"SELECT coalesce((SELECT attempts FROM tenant_ai_usage WHERE tenant='{tenant}' AND day=(now() AT TIME ZONE 'UTC')::date),0)"))
    flow = {'name': {'en-GB': 'Extract newly imported sources'}, 'active': True,
        'event': 'knowledge.document.ingested', 'condition': {'type': 'alwaysValid'},
        'action': 'pipeline', 'instruction': {}, 'locale': 'de-DE',
        'inference': {'provider': 'openai', 'model': 'fixture-extraction'},
        'pipeline': {'entry': 'facts', 'nodes': [
            {'kind': 'action', 'id': 'facts', 'action': 'knowledge.extract', 'config': {}, 'next': None}]}}
    assert 'knowledge.extract' in call('/api/automation/catalog', headers=h)['actions']
    call('/api/automation/flows/extract_import', {'revision': 0, 'data': flow}, h, method='PUT')
    behavior['mode'] = 'extract'
    document = call('/api/knowledge/documents', {'title': 'Ceramic source',
        'content': 'Ceramic capacity 500 ml.', 'productId': 'mug', 'locale': 'en-GB'}, h)
    for _ in range(200):
        jobs = call('/api/automation', headers=h)['jobs']
        job = next((j for j in jobs if j['flow']=='extract_import' and j['state'] in ['completed','failed']), None)
        if job: break
        time.sleep(.1)
    assert job and job['state']=='completed', jobs
    claims = call('/api/intelligence/claims', {'productId': 'mug'}, h)['claims']
    assert len(claims)==1 and claims[0]['state']=='proposed'
    assert claims[0]['data']['sourceId']==document['id'] and claims[0]['data']['locale']=='en-GB'
    assert not call('/store-api/product/mug/facts', headers={'x-tenant':tenant})['claims']
    assert attempts()==1
    passed('Native source event -> existing durable Flow -> quoted unconfirmed claim; document language and shared daily quota retained')
    args={'sourceId':document['id'],'inference':{'provider':'openai','model':'fixture-extraction'}}
    behavior['mode']='bad-extract'
    call('/api/intelligence/extract', args, h, expected=400)
    assert len(call('/api/intelligence/claims', {'productId':'mug'}, h)['claims'])==1
    assert attempts()==2
    passed('Unsupported extraction quotes persist no partial claims; failed model attempts count')
    behavior['mode']='extract'
    result=call('/mcp', {'jsonrpc':'2.0','id':1,'method':'tools/call',
        'params':{'name':'knowledge.extract','arguments':args}}, h)['result']
    assert not result['isError'] and result['structuredContent']['approvalRequired']
    assert attempts()==3
    foreign={'Authorization':h['Authorization'],'x-tenant':'atelier'}
    before=len(captured)
    call('/api/intelligence/extract', args, foreign, expected=403)
    assert len(captured)==before
    sql(f"INSERT INTO tenant_resource_limits(tenant,daily_ai) VALUES('{tenant}',3) ON CONFLICT(tenant) DO UPDATE SET daily_ai=3;")
    call('/api/intelligence/extract', args, h, expected=429)
    denied_plan=call('/mcp', {'jsonrpc':'2.0','id':2,'method':'tools/call',
        'params':{'name':'merchant.plan','arguments':{'instruction':'Read this shop without spending over its budget'}}}, h)['result']
    assert denied_plan['isError'], denied_plan
    # The streamed entry point must share the same budget before calling a model.
    call('/api/agent/chat/stream', {'message':'Quota must reject before streaming','inference':args['inference']}, h, expected=429)
    assert len(captured)==before and attempts()==3
    passed('HTTP, MCP, streaming and background extraction share one native quota; foreign tenant and exhausted quota call no provider')
    # A new day's first attempt respects the configured one-attempt budget.
    sql(f"DELETE FROM tenant_ai_usage WHERE tenant='{tenant}'; UPDATE tenant_resource_limits SET daily_ai=1 WHERE tenant='{tenant}';")
    call('/api/intelligence/extract', args, h)
    before=len(captured)
    call('/api/intelligence/extract', args, h, expected=429)
    assert len(captured)==before and attempts()==1
    # Revoke catalog rights before a new event is consumed; frozen flows grant no authority.
    sql(f"UPDATE memberships SET role='viewer',permissions='[\"settings.write\",\"knowledge.read\"]'::jsonb WHERE tenant='{tenant}' AND user_id='{owner['user']['id']}';")
    call('/api/intelligence/extract', args, h, expected=403)
    assert len(captured)==before
    bootstrap={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN'],'x-tenant':tenant}
    call('/api/knowledge/documents', {'title':'Post-revocation source',
        'content':'Ceramic capacity 500 ml. New revision fixture.', 'productId':'mug'}, bootstrap)
    for _ in range(200):
        jobs=call('/api/automation', headers=bootstrap)['jobs']
        denied=next((j for j in jobs if j['flow']=='extract_import' and j['id']!=job['id'] and j['state']=='failed'),None)
        if denied:break
        time.sleep(.1)
    assert denied and len(captured)==before, jobs
    passed('First-attempt quota is bounded and a stored Flow cannot extract after its actor loses catalog rights')
    behavior['mode']='normal'
