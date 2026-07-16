# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # astro dev server (localhost:4321/scottish-tartan-finder)
npm run build    # astro check (typecheck) + astro build → dist/
npm run preview  # serve the built dist/ at the base path
```

No test suite or linter configured. `npm run build` is the gate — it runs `astro check` (TypeScript) before building. Node 24 in CI.

## Deploy

Push to `main` → `.github/workflows/*.yml` builds and publishes `dist/` to GitHub Pages. `astro.config.mjs` pins `site` + `base: '/scottish-tartan-finder'`, so the app is served under that path.

## Architecture

**The entire app is one page.** `src/pages/index.astro` renders a static shell (fonts, `#app` container) plus a single `<script is:inline>` that is a self-contained client-side state machine — six views (home, results/search, browse A–Z, categories, detail, about) switched by `state.page`, not by routes. There is no router and no per-tartan URL; navigation is `set({page:...})` re-rendering `#app.innerHTML`, with a delegated click handler on `[data-act]` attributes.

Consequences:
- The `base` path only matters for the built asset/font URLs, **not** internal navigation (it's all in-memory state), so links between views work regardless of base.
- The script **must** stay `is:inline`. Without it, Astro bundles and TypeScript-checks the plain-JS body and `astro check` fails with implicit-`any` errors.
- Search focus is preserved across full re-renders by saving/restoring `#q` caret in `render()`.

**Design provenance.** The UI was ported from a Claude Design prototype (`Scottish Tartan Finder.dc.html`) in a Claude Design project. That `.dc.html` is a React-like `DCLogic` component; `index.astro` is a faithful vanilla-JS transcription of it (same inline styles, same view logic). To re-sync with an updated design, read the project file via the `DesignSync` MCP tool and re-transcribe. Inline styles are intentional — they mirror the design source; global CSS in `src/styles/global.css` holds only the base reset, palette/fonts, and card hover classes.

**Data.** `TARTANS` is an 11-item sample embedded directly in `index.astro` (marked with a `// ponytail:` comment as the swap point). `data/tartans-index.sample.json` shows the intended generated-data shape (`ref`, `name`, `category`, `designer`, `tartanDate`, `registrationDate`, `imageUrl`, `sourceUrl`, `lastIndexedAt`). There is no live backend; V1 is meant to run client-side search over a static JSON dataset.

## Project status & intent

This is an early scaffold. `docs/PRD.md` and `docs/design-agent-prompt.md` are the source of truth for product scope. Note a deliberate divergence: the PRD envisions **multiple static pages** (for SEO) with Pagefind/Fuse.js search; the current implementation is a **single-page client SPA**. Splitting into real Astro routes is a separate, larger change — confirm before doing it.

`docs/source-investigation-notes.md` covers the Scottish Register of Tartans as the authoritative data source. This project is **unofficial**; attribution/disclaimer copy appears in the footer, detail, and about views and must stay visible in any UI change.
