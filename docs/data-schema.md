# Data schema — `data/tartans-index.json`

The single contract between the scraper (`packages/scraper`, writer) and the web app
(`apps/web`, reader). A JSON array of `TartanRecord`. The scraper overwrites this file
with real scraped data using the **same schema**; the web app builds static routes from
whatever is present.

## TartanRecord

| Field | Type | Notes |
|---|---|---|
| `ref` | number | Register reference ID. **Unique.** Primary key; drives `/tartan/[ref]`. |
| `name` | string | Tartan name. |
| `category` | string | e.g. Clan/Family, District, Corporate, Fashion, Military, Commemorative. |
| `designer` | string | `""` if not recorded. |
| `tartanDate` | string | Free text as shown on the Register (`"1992"`, `"c. 1725"`). `""` if none. |
| `registrationDate` | string | Free text (`"11 Oct 2010"`). `""` if none. |
| `restrictions` | string | `""` if none. |
| `registrationNotes` | string | `""` if none. |
| `detailUrl` | string | Official Register detail URL. |
| `imageUrl` | string | `imageCreation.aspx` URL (default 750×750). |
| `status` | string | `DISCOVERED` \| `INDEXED` \| `FAILED` \| `UNAVAILABLE`. Web shows only records with data. |
| `lastIndexedAt` | string | ISO date (`YYYY-MM-DD`). |

## Rules

- Strings use `""`, not `null`, for missing values (simplifies templates).
- `ref` is a number — no leading zeros. Real Register refs look like `14598`.
- Array is the whole dataset; no wrapper object. Order is not significant (web sorts).
