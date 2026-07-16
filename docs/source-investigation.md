# Source Investigation — Scottish Register of Tartans

Live investigation performed 2026-07-16 against `www.tartanregister.gov.uk`,
per PRD §33. All requests below used the crawler's actual User-Agent
(`TartanIndexer/1.0 (Scottish Tartan Finder POC)`), were spaced ≥2s apart,
and were made either as one-off `curl` checks (investigation) or via the
scraper's own `HttpClient` (the live smoke run). Total live requests made
across the whole POC (investigation + smoke): **18**, all HTTP 200/301/404
with zero 429s or 5xxs — well under the "roughly under 20" budget.

## robots.txt

```
GET https://www.tartanregister.gov.uk/robots.txt -> HTTP 404
```

No `robots.txt` exists on the site (checked with both `www.` and bare host
in earlier notes; re-confirmed here with `www.`). There is no machine-
readable crawl policy to parse or obey beyond general politeness.

## URL patterns (important: `.aspx` redirects)

Every classic ASP.NET `*.aspx` URL mentioned in `docs/PRD.md` and
`docs/source-investigation-notes.md` is now a **301 redirect** to a
canonical extension-less path. The scraper targets the canonical form
directly to avoid burning an extra request per page:

| Legacy / PRD-assumed URL | Live result | Canonical URL used by scraper |
|---|---|---|
| `az.aspx?searchString=A` | 301 → `/az?searchString=A` | `https://www.tartanregister.gov.uk/az?searchString=A` |
| `tartanDetails.aspx?ref=14598` | 301 → `/tartanDetails?ref=14598` | `https://www.tartanregister.gov.uk/tartanDetails?ref=14598` |
| `copyright.aspx` | 301 → `/copyright` | (reference only, not crawled by the scraper) |
| `termsOfUse.aspx` | 301 → `/termsOfUse` | (reference only, not crawled by the scraper) |

The image endpoint (`imageCreation.aspx?ref=…&width=…&height=…`) is
generated **relative to the detail page** as `imageCreation.aspx?ref=X&width=750&height=750`
and was *not* independently fetched (no need — the URL pattern is directly
visible in the detail page's `<img id="imgTartan" src="…">`, confirming
PRD §5's assumed pattern). The scraper normalises the parameter order to
`height, ref, width` to match `docs/data-schema.md`'s example.

## A–Z discovery page (`/az?searchString=A`)

- Single unpaginated HTML page — **no pagination observed** even for
  letter "A", which returned 518 results in one document. No "next page"
  link, page-number links, or `pageNumber`/pagination markup were found
  anywhere in the response.
- Tartan links appear in a `<table>` with rows of the shape:

  ```html
  <tr>
    <td><a href="tartanDetails.aspx?ref=10053">A J Gallacher</a></td>
    <td>Name</td>
    <td>20/07/2009</td>
  </tr>
  ```

  (Name / Category / Design Date columns; links still use the legacy
  `.aspx` href even though the live site itself redirects it.)
- **Selector used:** `a[href*="tartanDetails.aspx?ref="], a[href*="tartanDetails?ref="]`,
  ref extracted via `/ref=(\d+)/` on the `href`, name via the link's text.
  Results are deduped by `ref` inside `parseAzListing()`
  (`packages/scraper/src/discovery/az.ts`).
- Results appear name-sorted, not ref-sorted (e.g. `A J Gallacher`,
  `A Man's a Man St Petersburg`, `A Man's a Man Ukraine`, `A Thread in
  Time`, … before `Abbotsford Check` — ASCII space sorts before letters).

## Detail page (`/tartanDetails?ref=14598` and `/tartanDetails?ref=9`)

Confirmed by fetching two real pages: `ref=14598` ("Loch Lomond Whisky",
fully populated — matches the PRD §15 example verbatim) and `ref=9`
("Abbotsford Check", an older record with an **empty Restrictions
value**, useful for tolerance testing).

Structure: a nested `<table id="Table1">` of label/value row pairs:

```html
<tr>
  <td class="bold" align="right">Designer:</td>
  <td><span id="lblDesigner"> Kinloch Anderson Ltd</span></td>
</tr>
```

**Selector strategy used** (`packages/scraper/src/detail/parser.ts`):
iterate every `<tr>` on the page, take the first `<td>` as a label
candidate and the second `<td>` as its value; match the label's trimmed,
lower-cased text against a fixed map (`"designer:"`, `"tartan date:"`,
`"registration date:"`, `"category:"`, `"restrictions:"`,
`"registration notes:"`). This is deliberately **not** based on the
ASP.NET control ids (`#lblDesigner`, etc.) — matching on label text is
more resilient to a template/generator change and tolerates row
reordering and missing/extra rows (PRD §9), which is required since:

- `ref=9`'s page has **no "Reference:" row at all** (it instead shows
  legacy `STA ref:` / `STWR ref:` rows) — confirming the parser must
  *not* trust the page's own "Reference:" field and should always use
  the `ref` passed in by the caller. `parse(ref, html)` does this.
  `<br>` tags inside multi-line values (e.g. Restrictions) are replaced
  with a space before text extraction so lines don't run together.
- Tartan name is read from `#lblHeader` ("Tartan Details - *Name*"),
  falling back to `#lblYouAreIn` if the header doesn't match the expected
  pattern.
- `restrictions` on `ref=9` is genuinely empty (label present, value cell
  empty) — the parser correctly yields `""`.

Two field-format surprises vs. the PRD's example (`docs/PRD.md` §15
`tartanDate: "2024-12-17"`): the live `Tartan date:` field is raw
`DD/MM/YYYY` text (`"17/12/2024"`), and `Registration date:` is a
free-text phrase (`"23 December 2024"`, or for older records literally
`"This tartan was recorded prior to the launch of The Scottish Register
of Tartans."`). `docs/data-schema.md` already anticipates this ("free
text as shown on the Register") so no reformatting is applied — the
scraper stores exactly what's rendered.

## Copyright / terms review (PRD §20)

- **Copyright page** (`/copyright`): registration text and images are
  **Crown copyright**. Text may be reused "free of charge in any format
  and for any purpose" with attribution to the Scottish Register of
  Tartans. Images may be reused free of charge "for fair dealing
  purposes" with attribution; other uses require contacting National
  Records of Scotland. This matches the "database rights rest with the
  Crown" note in `docs/source-investigation-notes.md`.
- **Terms of Use page** (`/termsOfUse`): contains only a general
  liability disclaimer for linked sites. **No explicit crawling,
  scraping, automated-access, or robots restriction was found** anywhere
  on the page.
- Given no `robots.txt` and no explicit anti-crawling terms, the POC
  proceeds under the crawl-safety settings below, treats the Register as
  authoritative, and preserves source attribution in every stored
  record (`detailUrl`, and the Register name/URL should stay visible in
  any UI built on `data/tartans-index.json`).

## Crawl-safety settings chosen (implemented in `src/http/client.ts`)

- User-Agent: `TartanIndexer/1.0 (Scottish Tartan Finder POC)`.
- Concurrency: **1** (all requests serialized through one queue).
- Delay: **2000ms** minimum between the start of consecutive requests.
- Retry: exponential backoff (`delayMs * 2^attempt`), **max 3 attempts**.
- Explicitly retries on HTTP 429 and 5xx; other statuses (200, 301
  followed automatically, 404) are returned as-is for the caller to
  handle (e.g. discovery/detail code treats non-200 as "skip"/"mark
  unavailable" rather than throwing).
- Structured per-request logging to stderr: timestamp, url, status,
  duration, attempt, result — stdout stays reserved for JSON output.
- No brute-force numeric `ref` enumeration anywhere in the codebase;
  every `ref` used comes from a discovery page (`/az?searchString=<L>`)
  or is the PRD's known example (`14598`).

## Live request ledger

| Phase | Requests | Notes |
|---|---|---|
| Investigation (manual, this doc) | 10 | robots.txt(1), az .aspx redirect + canonical(2), detail .aspx redirect + canonical(2), copyright .aspx redirect + canonical(2), termsOfUse .aspx redirect + canonical(2), detail ref=9 fixture(1) |
| Live smoke (`npm run crawl:smoke`, via `HttpClient`) | 8 | 1× `/az?searchString=A` + 7× `/tartanDetails?ref=…` (6 discovered from letter A + ref 14598) |
| **Total** | **18** | All 200/301/404, zero errors, zero retries needed |

Saved fixtures (`packages/scraper/fixtures/`, used by
`test/parser.test.ts`, no network in tests):

- `az-A.html` — full `/az?searchString=A` response (518 results, no
  pagination).
- `detail-14598.html` — fully-populated detail page.
- `detail-9.html` — detail page with an empty `Restrictions` value and a
  missing "Reference:" row (tolerance fixture).

## Result

`data/tartans-index.json` was overwritten with 7 real, live-scraped
records (letter "A" sample + ref 14598), matching `docs/data-schema.md`
exactly. No brute-force enumeration was used; the full ~518+ letter-"A"
registry (and the rest of the alphabet) is discoverable by widening
`letters`/`maxDetails` in `packages/scraper/src/index-build.ts` in a
future, larger run — not attempted here to keep this POC's live footprint
small.
