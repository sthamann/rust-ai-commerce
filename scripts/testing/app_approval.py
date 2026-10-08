"""Use the Rust manifest serializer for operator pins; never invent a second canonical digest."""
import json
import subprocess
import tempfile
from .runtime import ROOT


def digest(manifest):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as source:
        json.dump(manifest, source)
        source.flush()
        return subprocess.check_output([str(ROOT/'target/debug/vendune'), '--app-digest', source.name], text=True).strip()


def pin(config, app, manifest):
    pins = config[app].setdefault('approvedDigests', [])
    value = digest(manifest)
    if value not in pins: pins.append(value)
    return config


def consent(body):
    """Fixtures explicitly approve the complete Rust-canonical package; this is not a server bypass."""
    manifest = body.get('manifest')
    if manifest is None:
        folders = {'google_analytics':'google-analytics','shopware_payments':'shopware-payments'}
        manifest = json.loads((ROOT/'extensions/apps'/folders.get(body['builtIn'],body['builtIn'])/'manifest.json').read_text())
    try: value=digest(manifest)
    except subprocess.CalledProcessError: return body
    return {**body,'approve':True,'digest':value,'permissions':sorted(set(manifest['permissions']))}
