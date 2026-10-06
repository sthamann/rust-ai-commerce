#!/usr/bin/env python3
"""Render every tracked Markdown document with repository-aware links and search."""
import html
import json
import os
import re
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import markdown

ROOT = Path(__file__).resolve().parents[1]
REPO = 'https://github.com/sthamann/vendune'
MEDIA = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4', '.webm', '.pdf'}


def sources():
    """Include tracked sources plus new documents before their first commit."""
    names = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    return sorted({Path(os.fsdecode(name)) for name in names.split(b'\0')
                   if name and name.lower().endswith(b'.md') and (ROOT / os.fsdecode(name)).is_file()})


def destination(source):
    return (Path('docs') / source.relative_to('docs') if source.parts[0] == 'docs'
            else Path('docs/repository') / source).with_suffix('.html')


def slug(value, separator):
    """Match GitHub heading punctuation/Unicode rules rather than ASCII transliteration."""
    return re.sub(r'\s', separator, re.sub(r'[^\w\-\s]', '', value.lower()))


class Document(HTMLParser):
    """Rewrite Markdown and embedded HTML links, keeping source links on GitHub."""
    def __init__(self, source, dest, known, copy_assets=True):
        super().__init__(convert_charrefs=False)
        self.source, self.dest, self.known = source, dest, known
        self.copy_assets = copy_assets
        self.output, self.text = [], []
        self.headings = 0

    def url(self, value):
        url = urlsplit(value)
        # Repository-local absolute GitHub links should also open the rendered guide.
        prefix = REPO + '/blob/main/'
        if value.startswith(prefix):
            url = urlsplit(value[len(prefix):])
            target = ROOT / unquote(url.path)
        elif url.scheme or url.netloc or not url.path:
            return value
        else:
            target = (ROOT / self.source.parent / unquote(url.path)).resolve()
        if not target.is_relative_to(ROOT):
            raise ValueError(f'{self.source}: link escapes repository: {value}')
        if not target.exists():
            raise ValueError(f'{self.source}: missing repository target: {value}')
        relative = target.relative_to(ROOT)
        if relative in self.known:
            mapped = destination(relative)
        elif target.is_file() and target.suffix.lower() in MEDIA:
            mapped = (Path('docs') / relative.relative_to('docs') if relative.parts[0] == 'docs'
                      else Path('docs/repository') / relative)
            if self.copy_assets:
                output = self.dest / mapped
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(target, output)
        else:
            return urlunsplit(('https', 'github.com', '/sthamann/vendune/' +
                              ('tree' if target.is_dir() else 'blob') + '/main/' +
                              quote(relative.as_posix(), safe='/'), url.query, url.fragment))
        path = os.path.relpath(mapped, destination(self.source).parent).replace(os.sep, '/')
        return urlunsplit(('', '', quote(path, safe='/'), url.query, url.fragment))

    def tag(self, tag, attrs, ending):
        if tag == 'h1':
            self.headings += 1
        values = []
        for name, value in attrs:
            if value is not None and name in ('href', 'src', 'poster'):
                value = self.url(value)
            values.append(name if value is None else f'{name}="{html.escape(value, quote=True)}"')
        self.output.append('<' + tag + (' ' + ' '.join(values) if values else '') + ending)

    def handle_starttag(self, tag, attrs):
        self.tag(tag, attrs, '>')

    def handle_startendtag(self, tag, attrs):
        self.tag(tag, attrs, ' />')

    def handle_endtag(self, tag):
        self.output.append('</' + tag + '>')

    def handle_data(self, data):
        self.output.append(data)
        self.text.append(data)

    def handle_entityref(self, name):
        self.output.append('&' + name + ';')
        self.text.append(html.unescape('&' + name + ';'))

    def handle_charref(self, name):
        self.output.append('&#' + name + ';')

    def handle_comment(self, data):
        self.output.append('<!--' + data + '-->')


def render(source, dest, known):
    converter = markdown.Markdown(extensions=['extra', 'sane_lists', 'toc'],
                                  extension_configs={'toc': {'slugify': slug, 'toc_depth': '2-3'}})
    document = Document(source, dest, known)
    original = (ROOT / source).read_text()
    # GitHub permits Markdown in README layout containers and collapsible sections.
    if source == Path('README.md'):
        original = original.replace('<div align="center">', '<div align="center" markdown="1">')
        original = original.replace('<details>', '<details markdown="1">')
    document.feed(converter.convert(original))
    text = re.sub(r'\s+', ' ', ' '.join(document.text)).strip()
    heading = re.search(r'<h1[^>]*>(.*?)</h1>', ''.join(document.output), re.S)
    title = html.unescape(re.sub('<[^>]+>', '', heading[1])) if heading else source.as_posix()
    content = ''.join(document.output)
    if not document.headings:
        content = '<h1>' + html.escape(title) + '</h1>' + content
    return title, content, converter.toc if converter.toc_tokens else '', text


def build_documents(dest, write_page):
    known = set(sources())
    records = []
    for source in sorted(known):
        title, body, toc, text = render(source, dest, known)
        path = destination(source)
        prefix = os.path.relpath('.', path.parent).replace(os.sep, '/') + '/'
        content = ('<div class="docs-layout"><aside class="docs-sidebar">'
                   f'<a href="{prefix}docs/index.html">← All documentation</a>'
                   '<p>On this page</p>' + toc + '</aside><article class="article docs-article">'
                   '<div class="docs-source"><span>' + html.escape(source.as_posix()) + '</span>'
                   f'<a href="{REPO}/blob/main/{quote(source.as_posix(), safe="/")}">View on GitHub ↗</a>'
                   '</div>' + body + '</article></div>')
        description = text[len(title):].strip()[:180] or title
        write_page(path, title + ' | ' + source.as_posix() + ' | Vendune', description, content)
        records.append({'source': source.as_posix(), 'url': path.as_posix(),
                        'title': title, 'description': description, 'text': text})
    groups = [('Guides', [r for r in records if r['source'].startswith('docs/')]),
              ('Repository and module notes', [r for r in records if not r['source'].startswith('docs/')])]
    content = ('<article class="article docs-index"><p class="eyebrow">Vendune documentation</p>'
               '<h1>Guides and developer reference</h1><p class="lead">Read the Markdown guides '
               'as web pages. Every page is built from its repository source on publication.</p>'
               '<div class="docs-start"><a href="quickstart.html">Get started</a>'
               '<a href="playground.html">Try the playground</a><a href="architecture.html">Architecture</a>'
               '<a href="security.html">Security &amp; scope</a></div>'
               '<label for="docs-search">Search all documentation</label>'
               '<input id="docs-search" type="search" placeholder="Products, checkout, apps…" '
               'autocomplete="off" aria-describedby="docs-count" />'
               f'<p id="docs-count" role="status">{len(records)} Markdown documents</p>'
               '<div id="docs-results"></div><div id="docs-directory">')
    for title, rows in groups:
        content += '<section><h2>' + title + '</h2><ul class="docs-list">'
        for record in rows:
            url = os.path.relpath(record['url'], 'docs').replace(os.sep, '/')
            content += ('<li><a href="' + html.escape(url) + '">' + html.escape(record['title']) +
                        '</a><small>' + html.escape(record['source']) + '</small></li>')
        content += '</ul></section>'
    content += '</div></article><script src="../docs.js" defer></script>'
    write_page(Path('docs/index.html'), 'Documentation | Vendune',
               'Search and read all Vendune guides, source ownership notes and developer contracts.', content)
    (dest / 'docs/search.json').write_text(json.dumps(records, ensure_ascii=False))
    (dest / 'docs/manifest.json').write_text(json.dumps(
        [{'source': r['source'], 'url': r['url']} for r in records], indent=2) + '\n')
    shutil.copyfile(ROOT / 'site/docs.js', dest / 'docs.js')
    return len(records)
