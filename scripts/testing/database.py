"""Use the same PostgreSQL fixtures through Docker or an explicitly selected native psql executable."""
import os
from urllib.parse import urlsplit

def psql(container,user,database,*options):
    native=os.environ.get('TEST_PSQL')
    if native:
        url=urlsplit(os.environ['DATABASE_URL'])
        return [native,'-h',url.hostname or '127.0.0.1','-p',str(url.port or 5432),'-U',user,'-d',database,*options]
    return ['docker','exec','-i',container,'psql','-U',user,'-d',database,*options]
