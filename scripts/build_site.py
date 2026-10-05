#!/usr/bin/env python3
"""Build the public documentation site using Python's standard library only."""
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.site'
BASE = 'https://sthamann.github.io/vendune/'
REPO = 'https://github.com/sthamann/vendune'


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
    lower = json.loads((ROOT / 'docs/assets/benchmark-million.json').read_text())
    million = json.loads((ROOT / 'docs/assets/benchmark-million-500.json').read_text())
    assert million['catalogSizes']['large'] == 1000000
    assert million['arrivalRatePerSecond'] == 500
    assert not any(row['errors'] for row in million['summaries']), 'Do not promote failed million-product runs'
    rows = {row['scenario']: row for row in million['summaries']}
    fields.update(million_catalog_p95=f"{rows['catalog-page-50-in-1000000']['medianP95Ms']:.1f}",
                  million_cart_p95=f"{rows['cart-20-lines-in-1000000-catalog']['medianP95Ms']:.1f}",
                  million_checkout_p95=f"{rows['durable-checkout-in-1000000-catalog']['medianP95Ms']:.1f}",
                  million_requests=str(sum(row['requests'] for row in rows.values())),
                  million_orders=str(million['persistedUniqueOrdersIncludingWarmup']))
    labels = {'catalog-page-50-in-6':'6-product shop / catalog page',
              'catalog-page-50-in-1000000':'1M products / 50-product page',
              'product-detail-in-1000000':'1M products / product detail',
              'localized-search-in-1000000':'1M products / localized SKU search',
              'common-term-search-in-1000000':'1M products / common-term search',
              'cart-20-lines-in-1000000-catalog':'1M products / 20-line cart',
              'durable-checkout-in-1000000-catalog':'1M products / durable checkout'}
    def render_rows(rows):
        return ''.join(
        '<tr><th scope="row">' + labels[row['scenario']] + '</th>' +
        f"<td>{row['medianP50Ms']:.1f}</td><td><strong>{row['medianP95Ms']:.1f}</strong></td>" +
        f"<td>{row['medianP99Ms']:.1f}</td><td>{row['medianRequestsPerSecond']:.1f}</td>" +
        f"<td>{row['errors']} / {row['requests']}</td></tr>" for row in rows)
    fields['million_rows'] = render_rows(rows.values())
    assert not any(row['errors'] for row in lower['summaries'])
    fields['million_100_rows'] = render_rows(lower['summaries'])
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
            'image': BASE + 'assets/vendune-studio-en.jpg',
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
