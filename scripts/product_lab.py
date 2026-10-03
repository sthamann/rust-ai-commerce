#!/usr/bin/env python3
"""Local full-app example lifecycle; private keys and independent code/data, no automatic installation."""
import json
import os
import pathlib
import secrets
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUN = ROOT / '.run'
STATE = RUN / 'product-lab-env.json'
PID = RUN / 'product-lab-demo.pid'
SERVER = ROOT / 'extensions/apps/product-lab/server.py'


def configuration():
    RUN.mkdir(exist_ok=True)
    if not STATE.exists():
        previous = RUN / 'product-lab-demo.json'
        token = json.loads(previous.read_text())['token'] if previous.exists() else secrets.token_hex(32)
        values = {'APP_TOKEN':token, 'APP_DB':str(RUN / 'product-lab-demo.sqlite'), 'APP_PORT':'8798', 'APP_BIND':'127.0.0.1'}
        fd = os.open(STATE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            json.dump(values, f)
    values = json.loads(STATE.read_text())
    path = RUN / 'connector-services.json'
    services = json.loads(path.read_text()) if path.exists() else {}
    origin = 'http://127.0.0.1:' + values['APP_PORT']
    services['product_lab'] = {'url':origin, 'uiUrl':origin, 'token':values['APP_TOKEN']}
    path.write_text(json.dumps(services)); path.chmod(0o600)
    return values


def owned():
    if not PID.exists():
        return None
    pid = int(PID.read_text())
    command = subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
    return pid if str(SERVER) in command else None


def start():
    values = configuration()
    if owned():
        print('Product Lab is already running')
        return
    with (RUN / 'product-lab-demo.log').open('a') as log:
        proc = subprocess.Popen([sys.executable,str(SERVER)],cwd=ROOT,env={**os.environ,**values},stdout=log,stderr=log,start_new_session=True)
    PID.write_text(str(proc.pid))
    for _ in range(20):
        if proc.poll() is not None:
            raise RuntimeError('Product Lab startup failed; inspect .run/product-lab-demo.log')
        try:
            with urllib.request.urlopen('http://127.0.0.1:'+values['APP_PORT']+'/v1/index.html',timeout=1):
                print('Product Lab ready on loopback port '+values['APP_PORT'])
                return
        except OSError:
            time.sleep(.1)
    raise RuntimeError('Product Lab did not become ready')


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv)>1 else 'status'
    if mode == 'start':
        start()
    elif mode == 'init':
        configuration(); print('Private Product Lab configuration prepared')
    elif mode == 'stop':
        pid = owned()
        if pid: os.kill(pid,signal.SIGTERM)
        print('Owned Product Lab service stopped')
    elif mode == 'status':
        print('Product Lab running' if owned() else 'Product Lab stopped')
    else:
        raise SystemExit('Usage: product_lab.py init|start|stop|status')
