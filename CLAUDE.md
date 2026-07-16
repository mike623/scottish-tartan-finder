# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape

npm-workspaces monorepo:

- `apps/web/` — the Astro static site (the public catalogue).
- `packages/scraper/` — TypeScript crawler that indexes the Scottish Register of Tartans.
- `data/tartans-index.json` — the dataset. **The one contract between the two workspaces:** the scraper writes it, the web app reads it at build time. Shape is documented in `docs/data-schema.md`.

## Commands

Run from the repo root (scripts delegate into workspaces):

```bash
npm install          # installs all workspaces (hoisted to root node_modules)
npm run dev          # astro dev server → localhost:4321/scottish-tartan-finder
npm run build        # builds apps/web (astro check + build) → apps/web/dist
npm run preview      # serve the built site at the base path
npm test             # runs each workspace's tests (--if-present)

npm run crawl:smoke      # scraper: one A–Z letter + ref 14598, writes data/tartans-index.json
npm run crawl:discover   # scraper: discovery only
npm run crawl:details    # scraper: detail fetch/parse
npm test -w packages/scraper   # scraper unit tests (node:test, offline fixtures)
```

`npm run build` is the gate — `astro check` (TypeScript) runs before the build. No linter. Node 24 in CI.

## Deploy

Push to `main` → `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → uploads `apps/web/dist` to GitHub Pages. **CI does not crawl** — it builds from the committed `data/tartans-index.json`. `apps/web/astro.config.mjs` pins `base: '/scottish-tartan-finder'`, so the site is served under that path.

## Web architecture (`apps/web`)

Real per-URL static routes (converted from an earlier single-page prototype). Pages in `src/pages/` render server-side from `data/tartans-index.json`:

- `/`, `/browse`, `/categories`, `/about` — static.
- `/search` — server-renders all cards, then a client `is:inline` island filters/sorts by toggling `.tf-card.is-hidden` (CSS `display:none`); reads `?q=`/`?cat=` on load and mirrors state back to the URL via `history.replaceState`.
- `/tartan/[ref]` — `getStaticPaths()` over every `INDEXED` record. One static page per tartan.

Key conventions:
- **Internal links must be base-path aware.** Use the helper in `src/lib/base.ts` — do **not** concatenate `import.meta.env.BASE_URL` directly. In this Astro version `BASE_URL` is the raw `base` string (no trailing slash), so naive `` `${base}search` `` produces `/scottish-tartan-finderabout`. `base.ts` normalizes it.
- Data access goes through `src/lib/tartans.ts`, which filters to `status === 'INDEXED'`.
- Shared chrome is `src/layouts/Layout.astro` (header/footer, active-nav via an `active` prop, mobile burger menu). Cards are `src/components/TartanCard.astro`.
- Client scripts stay `is:inline` — otherwise Astro bundles and TypeScript-checks the plain JS and `astro check` fails on implicit `any`.
- Styling is deliberately inline (mirrors the original Claude Design prototype `Scottish Tartan Finder.dc.html`, imported via the `DesignSync` MCP tool). `src/styles/global.css` holds only the reset, palette/fonts, and the `.tf-card` / `.tf-chip` / `.is-hidden` helper classes. Keep the heritage look; disclaimers must stay visible in footer, detail, and about.

## Scraper architecture (`packages/scraper`)

Fetch and parse are separate so the parser is unit-testable against saved HTML (`fixtures/`), with no network in tests. Per `docs/PRD.md` §25/§27:

- `src/http/client.ts` — rate-limited fetch: UA `TartanIndexer/1.0`, **concurrency 1, 2000ms delay**, retry+backoff, respects 429/5xx.
- `src/discovery/az.ts` — parses `tartanDetails?ref=` links off A–Z pages (no brute-force ID enumeration).
- `src/detail/parser.ts` — `parse(ref, html)`, label/value DOM extraction, **no network**.
- `src/index-build.ts` / `src/cli.ts` — orchestrate discover → dedupe → fetch → parse → write `data/tartans-index.json`.

**Crawl safety when touching this code:** the target is a live `.gov.uk` site with Crown copyright (reuse permitted with attribution; no scraping prohibition — see `docs/source-investigation.md`). Keep requests small and polite, never remove the rate limiting, keep attribution. `.aspx` URLs 301-redirect to canonical extension-less paths; robots.txt is 404. The POC dataset is intentionally a small sample, not the full ~518+ registry.

## Docs

- `docs/PRD.md` — full product spec for the indexer/scraper (source of truth).
- `docs/data-schema.md` — the `TartanRecord` shape (the web↔scraper contract).
- `docs/source-investigation.md` — live findings: selectors, redirects, robots, terms.
- `docs/superpowers/specs/` — approved design specs for larger changes.
