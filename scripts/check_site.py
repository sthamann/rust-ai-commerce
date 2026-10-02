#!/usr/bin/env python3
"""Check the generated documentation's links and discovery metadata."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '.site'


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.h1 = [], set(), 0
        self.metas, self.canonical = {}, None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            assert attrs['id'] not in self.ids, 'Duplicate id'
            self.ids.add(attrs['id'])
        self.h1 += tag == 'h1'
        for attr in ('href', 'src', 'poster'):
            if attr in attrs:
                self.links.append(attrs[attr])
        if tag == 'meta':
            self.metas[attrs.get('name', attrs.get('property'))] = attrs.get('content')
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs['href']


def check():
    pages = {}
    titles, canonicals = set(), set()
    for file in SITE.glob('*.html'):
        source = file.read_text()
        page = Page()
        page.feed(source)
        pages[file.name] = page
        assert page.h1 == 1, (file, 'Expected one h1')
        assert '<html lang="en">' in source, file
        title = re.search(r'<title>(.*?)</title>', source).group(1)
        assert title and title not in titles, file
        titles.add(title)
        assert page.metas.get('description'), file
        assert page.metas.get('robots') == 'index,follow', file
        assert page.metas.get('og:image') and page.metas.get('twitter:card'), file
        assert page.canonical and page.canonical not in canonicals, file
        canonicals.add(page.canonical)
        schema = re.search(r'<script type="application/ld\+json">(.*?)</script>', source, re.S)
        assert json.loads(schema.group(1))['url'] == page.canonical, file
        assert '{{' not in source, file
    links = 0
    for name, page in pages.items():
        for link in page.links:
            url = urlsplit(link)
            if url.scheme or url.netloc:
                continue
            target = SITE / unquote(url.path or name)
            assert target.is_file(), (name, link, 'Missing local target')
            if url.fragment and target.suffix == '.html':
                assert url.fragment in pages[target.name].ids, (name, link, 'Missing anchor')
            links += 1
    sitemap = ElementTree.parse(SITE / 'sitemap.xml')
    sitemap_urls = {x.text for x in sitemap.findall('.//{*}loc')}
    assert sitemap_urls == canonicals, 'Sitemap and canonical URLs differ'
    assert (SITE / 'llms.txt').is_file()
    print(f'PASS: {len(pages)} pages, {links} local links/assets, unique titles, metadata, JSON-LD and sitemap')


if __name__ == '__main__':
    check()
