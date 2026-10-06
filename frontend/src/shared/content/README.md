# shared/content

Structured rich-content rendering without injecting arbitrary HTML.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`RichDescription.tsx`](RichDescription.tsx): Safe rich blocks with native image/video rendering; no HTML interpretation or script execution.
- [`rich-document.tsx`](rich-document.tsx): Safe structured editor rendering. Only known nodes/marks produce elements; URLs are never executable.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
