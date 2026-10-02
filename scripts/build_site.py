#!/usr/bin/env python3
"""Build the public documentation site using Python's standard library only."""
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.site'
BASE = 'https://sthamann.github.io/rust-ai-commerce/'
REPO = 'https://github.com/sthamann/rust-ai-commerce'


def evidence_fields():
    before = json.loads((ROOT / 'docs/assets/benchmark-before.json').read_text())
    after = json.loads((ROOT / 'docs/assets/benchmark-after.json').read_text())
    demos = json.loads((ROOT / 'docs/assets/demos.json').read_text())
    old = {row['key']: row for row in before['summaries']}
    new = {row['key']: row for row in after['summaries']}
    assert old.keys() == new.keys(), 'Benchmark workloads must match'
    assert all(old[k]['requests'] == new[k]['requests'] for k in new), 'Request counts must match'
    assert not any(row['errors'] for row in after['summaries']), 'Do not promote failed benchmark runs'
    fields = {key + '_duration': str(round(value['durationSeconds'])) + ' sec'
              for key, value in demos['clips'].items()}
    catalog = new['catalog-1000/c16']
    fields.update(catalog_rps=f"{catalog['medianRequestsPerSecond']:,.0f}",
                  catalog_p95=f"{catalog['medianP95Ms']:.1f}",
                  cart_p95=f"{new['cart-20-lines-in-1000-catalog/c16']['medianP95Ms']:.1f}",
                  checkout_p95=f"{new['durable-checkout-in-1000-catalog/c16']['medianP95Ms']:.1f}",
                  measured_requests=str(sum(row['requests'] for row in new.values())),
                  persisted_orders=str(after['persistedUniqueOrdersIncludingWarmup']),
                  benchmark_date=html.escape(after['recordedAt'][:10]))
    labels = {'catalog-6': '6-product catalog', 'catalog-1000': '1,000-product catalog',
              'cart-20-lines-in-1000-catalog': '20-line cart / 1,000 products',
              'durable-checkout-in-1000-catalog': 'Durable checkout / 1,000 products'}
    fields['benchmark_rows'] = ''.join(
        '<tr><th scope="row">' + labels[row['scenario']] + '</th><td>' + str(row['concurrency']) +
        f"</td><td>{old[key]['medianP95Ms']:.1f} → <strong>{row['medianP95Ms']:.1f}</strong></td>" +
        f"<td>{old[key]['medianRequestsPerSecond']:.1f} → <strong>{row['medianRequestsPerSecond']:.1f}</strong></td>" +
        f"<td>{row['errors']} / {row['requests']}</td></tr>"
        for key, row in new.items())
    return fields


def build():
    evidence = evidence_fields()
    pages = json.loads((ROOT / 'site/pages.json').read_text())
    template = (ROOT / 'site/template.html').read_text()
    if DEST.exists():
        shutil.rmtree(DEST)
    (DEST / 'assets').mkdir(parents=True)
    shutil.copyfile(ROOT / 'site/style.css', DEST / 'style.css')
    shutil.copyfile(ROOT / 'site/favicon.svg', DEST / 'favicon.svg')
    for asset in (ROOT / 'docs/assets').iterdir():
        if asset.is_file():
            shutil.copyfile(asset, DEST / 'assets' / asset.name)
    urls = []
    for page in pages:
        url = BASE + ('' if page['file'] == 'index.html' else page['file'])
        schema = {
            '@context': 'https://schema.org',
            '@type': 'SoftwareSourceCode' if page['file'] == 'index.html' else 'TechArticle',
            'name': page['title'], 'description': page['description'], 'url': url,
        }
        if page['file'] == 'index.html':
            schema.update(codeRepository=REPO, programmingLanguage=['Rust', 'TypeScript'],
                          license=REPO + '/blob/main/LICENSE')
        else:
            schema.update(headline=page['title'], author={'@type': 'Person', 'name': 'Stefan Hamann'})
        fields = {
            'title': html.escape(page['title']),
            'description': html.escape(page['description'], quote=True),
            'canonical': url,
            'image': BASE + 'assets/hero-workspace.webp',
            'schema': json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c'),
            'content': (ROOT / 'site/pages' / page['file']).read_text(),
            **evidence,
        }
        document = template
        for key, value in fields.items():
            document = document.replace('{{' + key + '}}', value)
        if '{{' in document:
            raise ValueError('Unresolved template placeholder: ' + page['file'])
        (DEST / page['file']).write_text(document)
        urls.append(url)
    (DEST / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        ''.join('<url><loc>' + html.escape(url) + '</loc></url>\n' for url in urls) + '</urlset>\n')
    shutil.copyfile(ROOT / 'site/llms.txt', DEST / 'llms.txt')
    (DEST / '.nojekyll').touch()
    print(f'Built {len(pages)} pages in {DEST}')


if __name__ == '__main__':
    build()
