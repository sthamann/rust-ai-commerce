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


def build():
    pages = json.loads((ROOT / 'site/pages.json').read_text())
    template = (ROOT / 'site/template.html').read_text()
    if DEST.exists():
        shutil.rmtree(DEST)
    (DEST / 'assets').mkdir(parents=True)
    shutil.copyfile(ROOT / 'site/style.css', DEST / 'style.css')
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
            'image': BASE + 'assets/commerce-studio-en.jpg',
            'schema': json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c'),
            'content': (ROOT / 'site/pages' / page['file']).read_text(),
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
