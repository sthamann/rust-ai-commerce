#!/usr/bin/env python3
"""Check the generated documentation's links and discovery metadata."""
import json
import hashlib
import re
from html.parser import HTMLParser
from pathlib import Path
from site_markdown import sources, destination
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '.site'


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.h1 = [], set(), 0
        self.metas, self.canonical = {}, None
        self.elements = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
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
    for asset in SITE.rglob('*'):
        assert not {'.git', '.github'}.intersection(asset.relative_to(SITE).parts), (
            asset, 'GitHub Pages artifact upload excludes this directory')
    pages = {}
    titles, canonicals = set(), set()
    for file in SITE.rglob('*.html'):
        source = file.read_text()
        page = Page()
        page.feed(source)
        pages[file.relative_to(SITE).as_posix()] = page
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
    links = 0
    for name, page in pages.items():
        for link in page.links:
            url = urlsplit(link)
            if url.scheme or url.netloc:
                continue
            target = ((SITE / name).parent / unquote(url.path)).resolve() if url.path else SITE / name
            assert target.is_relative_to(SITE), (name, link, 'Link escapes site')
            assert target.is_file(), (name, link, 'Missing local target')
            if url.fragment and target.suffix == '.html':
                assert unquote(url.fragment) in pages[target.relative_to(SITE).as_posix()].ids, (name, link, 'Missing anchor')
            links += 1
    sitemap = ElementTree.parse(SITE / 'sitemap.xml')
    sitemap_urls = {x.text for x in sitemap.findall('.//{*}loc')}
    assert sitemap_urls == canonicals, 'Sitemap and canonical URLs differ'
    assert (SITE / 'llms.txt').is_file()
    manifest = json.loads((SITE / 'docs/manifest.json').read_text())
    expected = {source.as_posix(): destination(source).as_posix() for source in sources()}
    assert {row['source']: row['url'] for row in manifest} == expected, 'Markdown publication inventory drift'
    assert all(url in pages for url in expected.values()), 'Missing rendered Markdown'
    search = json.loads((SITE / 'docs/search.json').read_text())
    assert {row['source']: row['url'] for row in search} == expected, 'Search inventory drift'
    assert all(row['text'] for row in search), 'Empty searchable document'
    architecture = (SITE / 'docs/production-architecture.html').read_text()
    for name in ['system', 'checkout', 'security', 'intelligence']:
        diagram = SITE / f'docs/assets/architecture/{name}.svg'
        assert diagram.is_file(), ('Missing rendered architecture diagram', name)
        xml = ElementTree.parse(diagram).getroot()
        assert xml.find('{*}title') is not None and xml.find('{*}desc') is not None
        assert f'assets/architecture/{name}.svg' in architecture
    assert 'DATABASE_RUNTIME_URL' in architecture and 'DB_RLS_REQUIRED' in architecture

    showcase = json.loads((ROOT / 'docs/assets/showcase/manifest.json').read_text())
    elements = pages['index.html'].elements
    tabs = [a for tag, a in elements if a.get('role') == 'tab']
    panels = [a for tag, a in elements if a.get('role') == 'tabpanel']
    videos = [a for tag, a in elements if tag == 'video']
    tracks = [a for tag, a in elements if tag == 'track']
    assert len(tabs) == len(panels) == len(videos) == len(tracks) == 6
    assert {a['aria-controls'] for a in tabs} == {a['id'] for a in panels}
    assert {a['aria-labelledby'] for a in panels} == {a['id'] for a in tabs}
    assert all('autoplay' not in a and 'controls' in a and a.get('preload') == 'none' for a in videos)
    for key, row in showcase['clips'].items():
        file = SITE / f'docs/assets/showcase/{key}.mp4'
        assert hashlib.sha256(file.read_bytes()).hexdigest() == row['sha256'], key
        assert file.stat().st_size == row['bytes'] and row['source'], key
        caption = SITE / f'docs/assets/showcase/{key}.vtt'
        source = caption.read_text()
        assert source.startswith('WEBVTT\n') and '-->' in source, key
        times = re.findall(r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})', source)
        seconds = [int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000 for h,m,s,ms in times]
        assert all(a <= b for a,b in zip(seconds, seconds[1:])), key
        assert seconds[-1] <= row['durationSeconds'] + .001, key
    for name, row in showcase['screenshots'].items():
        assert hashlib.sha256((SITE / 'docs/assets/showcase' / name).read_bytes()).hexdigest() == row['sha256'], name

    print(f'PASS: {len(pages)} pages, all {len(expected)} Markdown sources, {links} local links/assets, '
          'unique titles, metadata, JSON-LD, full-text search and sitemap')


if __name__ == '__main__':
    check()
