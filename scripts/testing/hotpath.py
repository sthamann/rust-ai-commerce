"""Real HTTP wire bytes and SQL tracing checks for the existing read-performance suite."""
import gzip
import hashlib
import json
import statistics
import urllib.request
from .runtime import ROOT


def wire(base, path, headers, body=None):
    request = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', **headers})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read(), response.headers, response.status


def statements(log, offset):
    return sum('sqlx::query' in line and 'channel_metrics' not in line
               for line in log.read_bytes()[offset:].decode().splitlines())


def verify(server, tenant, merchant):
    base, log = server[2], server[3]
    asset = next(ROOT.joinpath('frontend/dist/assets').glob('index-*.js'))
    path = '/assets/' + asset.name
    offset = log.stat().st_size
    raw, headers, _ = wire(base, path, {'x-tenant': 'unknown-shop', 'Authorization': 'Bearer expired', 'Accept-Encoding': 'identity'})
    assert raw == asset.read_bytes() and statements(log, offset) == 0
    assert headers['Cache-Control'] == 'public, max-age=31536000, immutable'
    assert 'accept-encoding' in headers['Vary'].lower()
    for encoding, suffix in [('gzip', 'gz'), ('br', 'br')]:
        data, headers, _ = wire(base, path, {'Accept-Encoding': encoding})
        assert headers['Content-Encoding'] == encoding and data == asset.with_name(asset.name+'.'+suffix).read_bytes()
        assert 'javascript' in headers['Content-Type']
        assert 'accept-encoding' in headers['Vary'].lower()
    data, headers, code = wire(base, path, {'Range': 'bytes=0-15', 'Accept-Encoding': 'identity'})
    assert code == 206 and data == raw[:16] and headers.get('Content-Encoding') is None
    data, headers, _ = wire(base, path, {'Accept-Encoding': 'br;q=0,gzip;q=0,identity'})
    assert data == raw and headers.get('Content-Encoding') is None
    data, headers, _ = wire(base, '/store-api/product', {'x-tenant': tenant, 'Accept-Encoding': 'gzip'}, {})
    assert headers['Content-Encoding'] == 'gzip' and len(json.loads(gzip.decompress(data))['elements']) == 6
    assert headers['Cache-Control'] == 'no-store' and 'accept-encoding' in headers['Vary'].lower()
    data, headers, _ = wire(base, '/api/auth/session', {'x-tenant': tenant, **merchant, 'Accept-Encoding': 'gzip,br'})
    assert headers.get('Content-Encoding') is None and json.loads(data)['user']
    data, headers, _ = wire(base, '/', {'Host': tenant+'.vendune.ai', 'Accept-Encoding': 'gzip,br'})
    assert headers.get('Content-Encoding') is None and b'id="root"' in data
    offset = log.stat().st_size
    wire(base, '/store-api/product', {'x-tenant': tenant, 'Host': tenant+'.vendune.ai'}, {})
    lines = log.read_bytes()[offset:].decode()
    assert 'WITH mount AS' in lines and 'SELECT tenant,channel FROM hosted_frontends WHERE alias' not in lines
    assert 'SELECT data,revision FROM sales_channels WHERE tenant' not in lines
    assert 'SELECT live_tenant FROM shop_environments WHERE tenant' not in lines
    print('PASS native assets use zero SQL even with expired credentials; precompressed MIME/ranges, gzip JSON and secret-safe exclusions')


def compare(server, tenant, merchant):
    """Count-only delivery measurements; no log overhead is mixed into latency rounds."""
    asset = next(ROOT.joinpath('frontend/dist/assets').glob('index-*.js'))
    scenarios = [
        ('asset', '/assets/'+asset.name, None, {}),
        ('host-catalog', '/store-api/product', {}, {'Host':tenant+'.vendune.ai'}),
        ('dashboard', '/api/merchant/overview', None, merchant),
    ]
    reports = {}
    for name, path, body, headers in scenarios:
        h = {'x-tenant':tenant, 'Accept-Encoding':'gzip', **headers}
        wire(server[2], path, h, body)
        samples = []
        for _ in range(7):
            offset = server[3].stat().st_size
            payload, response_headers, _ = wire(server[2], path, h, body)
            samples.append(statements(server[3], offset))
        decoded = gzip.decompress(payload) if response_headers.get('Content-Encoding') == 'gzip' else payload
        if name == 'dashboard':
            value = json.loads(decoded)
            # HTTP counters are expected to change while the requests are measured.
            value.pop('channels')
            decoded = json.dumps(value, sort_keys=True).encode()
        elif name == 'host-catalog':
            decoded = json.dumps(json.loads(decoded), sort_keys=True).encode()
        reports[name] = {'wireBytes':len(payload), 'encoding':response_headers.get('Content-Encoding'),
            'sqlStatements':statistics.median(samples), 'sqlStatementSamples':samples, 'responseSha256':hashlib.sha256(decoded).hexdigest()}
    return reports
