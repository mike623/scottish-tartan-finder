# Monorepo + Scraper POC + Static Routes — Design

Date: 2026-07-16
Status: Approved, in implementation

## Goal

Three coordinated changes to Scottish Tartan Finder:

1. Restructure the repo as an npm-workspaces monorepo.
2. Build a proof-of-concept scraper for the Scottish Register of Tartans (per `docs/PRD.md`).
3. Convert the single-page web app into real per-URL static Astro routes.

The scraper produces a JSON dataset; the web app consumes it at build time to
generate static pages. GitHub Actions builds and deploys the site to Pages.

## Decisions (locked)

- **Tooling:** npm workspaces (no new toolchain; CI already runs `npm ci`).
- **Scraper live access:** polite live smoke — a handful of rate-limited requests
  (one A–Z letter + detail `ref=14598`), saved as fixtures. No bulk crawl.
- **Routes:** full static Astro routes with `getStaticPaths`. Best SEO; matches PRD.
- **Storage:** JSON files. Scraper writes `data/tartans-index.json`; web imports it.
  SQLite/Postgres deferred to production per PRD.

## Layout

```
package.json              # root: workspaces ["apps/*","packages/*"], delegating scripts
apps/web/                 # Astro site (moved from root)
  astro.config.mjs        # base: '/scottish-tartan-finder' (unchanged)
  tsconfig.json
  package.json            # astro, @astrojs/check, typescript
  src/
packages/scraper/         # TS crawler POC
  package.json            # cheerio; dev: tsx, typescript, @types/node
  src/
  fixtures/
  test/
data/tartans-index.json   # canonical generated dataset (the contract)
docs/data-schema.md       # TartanRecord shape
.github/workflows/deploy.yml
```

## The contract: `data/tartans-index.json`

Array of `TartanRecord`. Seeded in Phase A with the 11-item sample in final shape;
the scraper overwrites it with real scraped data using the **same schema**. The web
app builds against whatever is present. Schema documented in `docs/data-schema.md`:

```jsonc
{
  "ref": 4200,                       // number, unique
  "name": "Isle of Skye",
  "category": "District",
  "designer": "Rosemary Nicolson Samios", // "" if not recorded
  "tartanDate": "1992",              // free text as shown on Register; "" if none
  "registrationDate": "11 Oct 2010", // free text; "" if none
  "restrictions": "",                // "" if none
  "registrationNotes": "…",          // "" if none
  "detailUrl": "https://www.tartanregister.gov.uk/tartanDetails?ref=4200",
  "imageUrl": "https://www.tartanregister.gov.uk/imageCreation.aspx?height=750&ref=4200&width=750",
  "status": "INDEXED",               // DISCOVERED | INDEXED | FAILED | UNAVAILABLE
  "lastIndexedAt": "2026-07-16"      // ISO date
}
```

## Scraper POC (`packages/scraper`, per PRD §25)

- `src/http/client.ts` — descriptive UA `TartanIndexer/1.0`, timeout, retry with
  exponential backoff, **concurrency 1 / delay 2000ms**, respects 429 and 5xx.
- `src/discovery/az.ts` — `AzDiscoveryProvider`: fetch `az.aspx?searchString=<L>`,
  Cheerio-parse `a[href*="tartanDetails?ref="]` → `{ref, name, detailUrl, discoveryUrl}`.
  No brute-force numeric enumeration.
- `src/detail/parser.ts` — `parse(ref, html): ParsedTartan`. Label/value DOM extraction
  (find label cell, read neighbouring value). **No network logic** — unit-testable.
- `src/detail/fetch.ts` — fetch one detail page via the http client.
- `src/index-build.ts` — orchestrate: discover (1–2 letters for POC) → dedupe by ref →
  fetch details rate-limited → parse → write `data/tartans-index.json`.
- `src/cli.ts` — commands: `discover`, `details`, `smoke` (one letter + ref 14598).
- `fixtures/` — saved `az-A.html`, `detail-14598.html` from the live smoke.
- `test/parser.test.ts` — `node:test`, parses fixtures offline. No live calls in tests.

Live smoke is run once by the implementing agent to capture fixtures and produce a
real (small) dataset. Attribution to the Register preserved. `docs/source-investigation.md`
updated with observed selectors and crawl-safety notes.

## Per-URL routes (`apps/web`)

Convert the single-page state machine into static pages:

- `src/layouts/Layout.astro` — head (fonts, meta), sticky header with active-nav
  highlighting, footer. Header/footer markup lifted verbatim from current `index.astro`.
- `src/components/TartanCard.astro` — the result card (extracted, reused).
- Routes (all import `data/tartans-index.json`):
  - `/` — hero, recently-added, how-it-works.
  - `/search` — client-side filter/sort island over the dataset (the only interactive page).
  - `/browse` — A–Z groups, static.
  - `/categories` — category cards linking to `/browse` or filtered search.
  - `/tartan/[ref]` — `getStaticPaths` over every ref; fully static detail page with
    metadata table, disclaimer, "more in category", and a client-only image lightbox.
  - `/about` — static.
- **Internal links use `import.meta.env.BASE_URL`** — base path now matters with real routes.
- Design preserved: same inline styles, palette, fonts. `src/styles/global.css` reused.

## GitHub Actions

`deploy.yml`: `npm ci` at root (installs all workspaces) → build `-w apps/web` →
upload `apps/web/dist`. **No live crawl in CI** (PRD §28); Pages builds from the
committed `data/tartans-index.json`. Node 24 retained.

## Execution — worktrees + subagents

- **Phase A (main thread, base branch):** restructure to monorepo, move web, update
  GHA, seed `data/tartans-index.json` + `docs/data-schema.md`, verify `npm run build`.
  Commit. This is the contract both agents branch from.
- **Phase B (parallel, each in its own git worktree):**
  - Agent 1 → scraper POC in `packages/scraper` (isolated new dir; runs live smoke;
    overwrites `data/tartans-index.json` with real data, same schema).
  - Agent 2 → per-URL routes in `apps/web` (consumes the seeded dataset).
  - Different subtrees, one shared contract → no merge conflict beyond the data file,
    which Agent 1 owns and Agent 2 only reads.
- **Phase C (main thread):** merge both worktrees, full build, browser-verify routes,
  update `CLAUDE.md`, open PR.

## Risks

- `/tartan/[ref]` completeness is bounded by scraped data — the POC yields a small
  catalogue, not the full ~518+ registry. Expand later via full discovery.
- Live Register HTML may differ from PRD/notes assumptions — the implementing agent
  must inspect real HTML before finalizing selectors (PRD §33) and record findings.
