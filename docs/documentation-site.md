# Read and maintain the public documentation

The [documentation website](https://sthamann.github.io/vendune/docs/) publishes
every tracked Markdown file in this repository. Guides under `docs/` appear at
`docs/NAME.html`; repository and module notes appear under `docs/repository/`. Hidden source directories use a `dot-` prefix in public
paths (for example `.github/` becomes `dot-github/`), because [GitHub Pages artifact
upload](https://github.com/actions/upload-pages-artifact/blob/v3/action.yml)
excludes `.github` directories. The source link retains the original path.
The Docs link in the public navigation opens the full directory. Full-text search
includes guide bodies and module notes; browsing and reading work without JavaScript.

Markdown files are the source for these pages. Tables, code, heading links, images,
README layout and collapsible sections render inside the same site shell. Links
between guides open HTML pages. Code, configuration, raw evidence and source
directories link back to their actual GitHub targets. Each article has an on-page
contents list and its original source link. The short marketing introductions
remain in `site/pages/`; keep their summaries consistent with the full guides.

## Build and validate

From the repository root, use a virtual environment if your Python installation
requires one, then run:

```sh
python3 -m pip install -r site/requirements.txt
python3 scripts/build_site.py
python3 scripts/check_site.py
python3 scripts/testing/source_inventory.py
python3 scripts/api_catalogue.py --check
python3 scripts/structure.py
```

The structure check also needs `npm ci` in `frontend/`. The site renderer uses
the pinned Python-Markdown dependency; ordinary commerce does not need it.
Output is ignored `.site/`. Preview it with a local static web server.

The site check covers every source document, rendered page, local link, image,
heading target, unique title, discovery metadata, search inventory and sitemap.
Missing repository targets stop the build; missing rendered anchors fail the
check. Untracked, non-ignored Markdown is included for local previews before its
first commit; only committed files reach CI. Do not put private notes in the
public repository.

## Publication and current facts

The existing GitHub Pages workflow builds on every pull request and `main` push,
and publishes only `main` or an explicit manual run. There is no path filter:
new Markdown and code-derived module notes cannot silently miss a publication.
GitHub's required `verify` check still protects merges. No authentication or
production commerce setting changes are needed for documentation publication.

The October 6, 2026 review checked the repository's Markdown inventory, current
module ownership, source links and rendered anchors. It corrected PostgreSQL/Qdrant
versus legacy AGE/pgvector descriptions, enabled content languages, channel
settings/lifecycle, worker roles, personal credentials, payment scope, source
inventories and verification counts. Dated benchmarks, captures and test results
retain their original measurement scope; a documentation review does not rerun
every historical experiment or verify live provider accounts.

The 8 October review reconciled README, the full feature tour, app/Experience/channel
guides, the homepage and `llms.txt` with `706102f`. It corrected obsolete main-channel
pause restrictions, EUR-only wording, the API/formal inventories and manually installed
Storyfront claims. Three unretouched public demo captures complement the retained
6 October recordings. [Current release](current-release.md) and
[capture provenance](assets/showcase/README.md) distinguish deployed behavior,
isolated tests and remaining native/provider activation work.

For future changes, read the actual owning code/configuration and update its guide
in the same change. Regenerate `module-inventory.md` with
`python3 scripts/testing/source_inventory.py --write` when source modules change.
Review local module README lists too. Passing link/build checks does not prove
every prose claim; observed behavior, implementation scope and proposed work
must stay distinct. Use [the testing guide](testing.md) and
[formal scope](formal-verification.md) for exact evidence boundaries.
