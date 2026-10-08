"""Build self-contained vanilla example UIs from the shared SDK; no remote imports at runtime.

This is extension/example tooling, not a first-party production service. Framework
apps supply their own bundle. The exact returned bytes are what the operator pins.
"""
from pathlib import Path
import re


def bundle(html: str, module: str | None = None) -> bytes:
    sdk = Path(__file__).with_name('browser.js').read_text().replace('export function ', 'function ')
    if module is not None:
        marker = '<script type="module" src="./app.js"></script>'
        if marker not in html:
            raise ValueError('Expected the example app.js entry')
        html = html.replace(marker, '<script type="module">' + module + '</script>')
    pattern = r'import\s*\{\s*connectCommerce\s*\}\s*from\s*[\'"][^\'"]*sdk\.js[\'"];'
    html, count = re.subn(pattern, lambda _: sdk, html)
    if count != 1:
        raise ValueError('Expected one shared browser SDK import')
    return html.encode('utf-8')
