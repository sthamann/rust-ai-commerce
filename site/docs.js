/* Full-text documentation search; the complete directory works without JavaScript. */
const input = document.getElementById('docs-search');
const count = document.getElementById('docs-count');
const directory = document.getElementById('docs-directory');
const results = document.getElementById('docs-results');
let index;
async function search() {
  const query = input.value.trim().toLocaleLowerCase();
  results.replaceChildren();
  directory.hidden = Boolean(query);
  if (!query) {
    count.textContent = Array.isArray(index) ? `${index.length} Markdown documents` : 'All documentation';
    return;
  }
  try {
    index ??= fetch('search.json').then(response => {
      if (!response.ok) throw new Error('Search unavailable');
      return response.json();
    });
    index = await index;
    if (query !== input.value.trim().toLocaleLowerCase()) return;
    const words = query.split(/\s+/);
    const matches = index.filter(row => words.every(word =>
      `${row.title} ${row.source} ${row.text}`.toLocaleLowerCase().includes(word)));
    count.textContent = `${matches.length} matching documents`;
    const list = document.createElement('ul');
    list.className = 'docs-list';
    for (const row of matches) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = row.url.replace(/^docs\//, '');
      link.textContent = row.title;
      const note = document.createElement('small');
      note.textContent = row.source;
      const excerpt = document.createElement('p');
      const position = row.text.toLocaleLowerCase().indexOf(words[0]);
      const start = Math.max(0, position - 70);
      excerpt.textContent = `${start ? '…' : ''}${row.text.slice(start, start + 240)}…`;
      item.append(link, note, excerpt);
      list.append(item);
    }
    results.append(list);
  } catch {
    index = undefined;
    directory.hidden = false;
    count.textContent = 'Search unavailable. Browse the documentation below.';
  }
}
input.addEventListener('input', search);
