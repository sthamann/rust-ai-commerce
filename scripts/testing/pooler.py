"""Owned real PgBouncer fixture: one backend, transaction pooling, never a forced privileged user."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.parse import urlsplit, urlunsplit

class Pooler:
    def __init__(self, runtime_url):
        executable=os.environ.get('TEST_PGBOUNCER') or shutil.which('pgbouncer')
        if not executable:raise RuntimeError('Transaction-pool verification requires PgBouncer 1.21+ (TEST_PGBOUNCER)')
        self.directory=tempfile.TemporaryDirectory(prefix='vendune-pooler-')
        folder=Path(self.directory.name)
        uri=urlsplit(runtime_url)
        # Generated fixture identities are closed-alphabet; do not accept arbitrary user-supplied INI values.
        assert all(c.isalnum() or c in '_-' for c in uri.username)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
        auth=folder/'users.txt'
        auth.write_text(f'"{uri.username}" "{uri.password}"\n');auth.chmod(0o600)
        config=folder/'pooler.ini'
        config.write_text(f'''[databases]
{uri.path[1:]} = host={uri.hostname} port={uri.port} dbname={uri.path[1:]}
[pgbouncer]
listen_addr = 127.0.0.1
listen_port = {port}
auth_type = plain
auth_file = {auth}
pool_mode = transaction
ignore_startup_parameters = extra_float_digits
default_pool_size = 1
max_client_conn = 40
max_prepared_statements = 100
server_reset_query_always = 0
log_connections = 0
log_disconnections = 0
unix_socket_dir = {folder}
''')
        self.log=(folder/'pooler.log').open('w')
        self.process=subprocess.Popen([executable,str(config)],stdout=self.log,stderr=self.log)
        self.url=urlunsplit(uri._replace(netloc=f'{uri.username}:{uri.password}@127.0.0.1:{port}'))
        try:
            for _ in range(100):
                if self.process.poll() is not None:raise RuntimeError('PgBouncer fixture failed: '+(folder/'pooler.log').read_text())
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.1):return
                except OSError:time.sleep(.05)
            raise RuntimeError('PgBouncer fixture not ready')
        except BaseException:self.close();raise
    def close(self):
        if self.process.poll() is None:
            self.process.terminate();self.process.wait(timeout=10)
        self.log.close();self.directory.cleanup()
