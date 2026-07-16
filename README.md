# Scottish Tartan Finder

Unofficial static web catalogue + local indexer concept for helping people look up Scottish tartans.

The project is intended to become an **Astro + GitHub Pages** website backed by generated static data from a respectful local index of publicly accessible records from the Scottish Register of Tartans.

> Status: planning scaffold. The PRD and design brief are committed first so design/build agents can work from a shared source of truth.

## Core idea

- Discover public tartan records from official listing/search pages.
- Store a local, attributed catalogue.
- Generate a static, human-friendly website for searching and browsing tartans.
- Keep the Scottish Register of Tartans as the authoritative source of record.
- Avoid brute-force enumeration, private data, or aggressive crawling.

## Key docs

- [`docs/PRD.md`](docs/PRD.md) — source product requirements document extracted from the provided DOCX.
- [`docs/design-agent-prompt.md`](docs/design-agent-prompt.md) — minimal web design prompt/requirements for a design agent.
- [`docs/source-investigation-notes.md`](docs/source-investigation-notes.md) — early live-site observations to verify before crawler implementation.

## Proposed V1 product shape

Static public website:

- Home/search landing page
- Search results
- Browse A–Z
- Browse by category
- Tartan detail page
- About/source attribution page

Local/generated data:

- `data/tartans-index.json` for client-side search/listing
- `content/tartans/*.md` or generated JSON for detail pages
- No live public database required for V1

## Suggested stack

- Astro
- TypeScript
- Static data files generated from a local crawler
- Pagefind or Fuse.js for static search
- GitHub Pages for hosting

## Important disclaimer

This project is unofficial. The Scottish Register of Tartans remains the authoritative source. Public hosting, redistribution, and any commercial use should be reviewed against the Register's terms, copyright, and database-rights position before launch.
