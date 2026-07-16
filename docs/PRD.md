Product Requirements Document (PRD)

Scottish Tartan Registry Indexer & API

Version: 1.0
Status: Ready for Implementation
Primary Data Source: Scottish Register of Tartans
Source Website: Scottish Register of Tartans (tartanregister.gov.uk)

1. Overview

Build an application that discovers, indexes, retrieves, and stores publicly accessible tartan information from the Scottish Register of Tartans.

The system should solve the primary problem that individual tartan detail records require an internal ref identifier:

/tartanDetails?ref={REF_ID}

The system must therefore first discover valid tartan records through publicly available search, browse, or result pages rather than relying on brute-force enumeration of numeric IDs.

After discovering a tartan reference ID, the system should retrieve its detail page, extract structured metadata, determine its image URL, and store the information in a local database.

The resulting database will provide a clean API for:

Searching tartans by name.

Looking up tartans by reference ID.

Browsing tartans.

Retrieving tartan metadata.

Retrieving tartan images.

Synchronising new tartans from the Register.

Supporting future visual tartan identification.

Supporting future vector/image similarity search.

Supporting future SVG or programmatic tartan reconstruction if threadcount information becomes available.

The application should treat the Scottish Register of Tartans as the authoritative source of record and maintain source attribution.

2. Problem Statement

The Scottish Register of Tartans provides individual tartan records using URLs similar to:

/tartanDetails?ref=14598

The challenge is that an application cannot retrieve a tartan unless it already knows the corresponding ref value.

Sequentially testing:

ref=1

ref=2

ref=3

…

is undesirable because:

IDs may not be continuous.

Records may have been removed or unavailable.

It generates unnecessary traffic.

It is inefficient.

It may put excessive load on the source website.

The application therefore needs a discovery mechanism that extracts valid reference IDs from publicly accessible search and browsing pages.

The system must maintain its own local index after discovery.

3. Goals

3.1 Primary Goals

Build a service capable of:

Discovering valid tartan reference IDs.

Extracting tartan names during discovery.

Fetching individual tartan detail pages.

Parsing tartan metadata into a structured format.

Constructing or extracting the corresponding tartan image URL.

Storing tartan records locally.

Avoiding duplicate records.

Updating previously indexed records.

Detecting newly registered tartans.

Exposing indexed data through a REST API.

Supporting scheduled incremental synchronisation.

Respecting reasonable crawling and rate limits.

4. Non-Goals for V1

The following are explicitly outside the initial implementation:

Bypassing authentication.

Automatically obtaining restricted threadcount data.

Scraping private/account-only information.

Reconstructing exact tartans from threadcounts.

AI-based image recognition.

Vector similarity search.

Mobile application.

Public user accounts.

Commercial licensing of source data.

High-frequency real-time crawling.

The architecture should allow visual tartan matching to be added later without redesigning the core data model.

5. Source Website

Base domain:

tartanregister.gov.uk

Primary known record pattern:

/tartanDetails?ref={REF_ID}

Example:

/tartanDetails?ref=14598

Known/generated image pattern:

/imageCreation.aspx?height={HEIGHT}&ref={REF_ID}&width={WIDTH}

Example:

/imageCreation.aspx?height=750&ref=14598&width=750

The implementation agent MUST inspect the live website before finalising selectors and discovery strategies.

Do not assume URL patterns or HTML selectors in this document are permanently correct.

6. Discovery Strategy

The crawler must discover valid tartan references through public listing/search/browse pages.

Preferred discovery order:

Official A-Z browse pages.

Official paginated result/listing pages.

Official search result pages.

Other publicly linked tartan indexes discovered on the website.

Brute-force enumeration of all possible numeric ref values should NOT be the primary discovery strategy.

The crawler should inspect links matching the conceptual pattern:

*tartanDetails?ref=*

Example HTML:

<a href="/tartanDetails?ref=14598">Tartan Name</a>

From this link, extract:

ref

tartan name

source URL

discovery URL

Example discovered record:

{
  "ref": 14598,
  "name": "Loch Lomond Whisky",
  "detailUrl": "/tartanDetails?ref=14598"
}

The discovery system must deduplicate records by ref.

7. Discovery Architecture

Implement discovery as a separate stage from detail crawling.

Pipeline:

Discovery Source

→ Fetch Listing Page

→ Parse Tartan Links

→ Extract Reference IDs

→ Deduplicate

→ Store Discovered Records

→ Queue Detail Crawling

This separation is important.

Discovery should not require every detail page to be fetched immediately.

A discovered tartan should initially be stored with a status such as:

DISCOVERED

After successful detail extraction:

INDEXED

If extraction fails:

FAILED

If a previously valid record becomes unavailable:

UNAVAILABLE

8. Discovery Completeness

The system should attempt to determine whether the full public registry has been discovered.

Store crawl information including:

Discovery source.

Page URL.

Crawl timestamp.

Number of tartans found.

Number of new references discovered.

Number of existing references rediscovered.

HTTP status.

Crawl duration.

Error information.

The system should support multiple discovery strategies simultaneously.

Example:

A-Z crawler finds ref=14598.

Search crawler later finds ref=14598.

Only one tartan database record should exist.

Both discovery events may optionally be recorded.

9. Tartan Detail Extraction

For every discovered reference ID, fetch:

/tartanDetails?ref={REF_ID}

Extract all publicly available metadata.

Expected fields include, where available:

Reference ID.

Tartan name.

Designer.

Tartan date.

Registration date.

Category.

Restrictions.

Registration notes.

Source/detail URL.

Image URL.

The parser should tolerate:

Missing fields.

Empty values.

Additional fields.

Changed field ordering.

Whitespace changes.

Minor HTML layout changes.

Prefer DOM-based extraction based on labels and neighbouring values rather than large regular expressions over the entire page.

10. Raw Data Preservation

The system should preserve enough source information to allow reprocessing when the parser changes.

Recommended options:

Store raw HTML.

Store compressed raw HTML.

Store an object-storage path containing raw HTML.

For a small implementation, storing raw HTML directly is acceptable.

Recommended fields:

raw_html
source_hash
parser_version
fetched_at

Calculate a hash of the relevant page content.

Example:

SHA-256.

This allows the synchronisation process to determine whether the source content changed.

11. Data Model

Recommended primary table:

tartans

id
ref
name
designer
tartan_date
registration_date
category
restrictions
registration_notes
detail_url
image_url
status
source_hash
parser_version
first_discovered_at
last_discovered_at
last_fetched_at
created_at
updated_at

Constraints:

UNIQUE(ref)

Recommended index:

INDEX(name)
INDEX(category)
INDEX(registration_date)
INDEX(status)

If PostgreSQL is used, consider trigram indexing for fuzzy name search.

12. Discovery Record Model

Optional but recommended table:

tartan_discoveries

id
tartan_ref
source_type
source_url
discovered_at

Possible source_type values:

AZ
SEARCH
RESULTS
MANUAL
OTHER

This table allows debugging of how a tartan entered the local index.

13. Crawl Run Model

Create:

crawl_runs

Fields:

id
crawl_type
started_at
completed_at
status
pages_processed
records_discovered
new_records
updated_records
failed_records
error_message

Possible crawl types:

FULL_DISCOVERY
INCREMENTAL_DISCOVERY
DETAIL_REFRESH
MANUAL

14. Image Handling

V1 does not need to permanently download all images.

Store an image URL associated with the tartan.

Conceptual format:

/imageCreation.aspx?height=750&ref={REF_ID}&width=750

The application should expose a helper capable of generating image URLs with configurable dimensions.

Example API:

GET /api/tartans/14598/image?width=750&height=750

The application may either:

Redirect to the original image.

Proxy the image.

Return the source image URL.

For V1, returning the source URL is preferred.

Avoid unnecessary image proxy traffic.

15. REST API

Implement a REST API.

Get Tartan

GET /api/tartans/:ref

Example response:

{
  "ref": 14598,
  "name": "Loch Lomond Whisky",
  "designer": "Kinloch Anderson Ltd",
  "tartanDate": "2024-12-17",
  "registrationDate": "2024-12-23",
  "category": "Corporate",
  "restrictions": "...",
  "registrationNotes": "...",
  "imageUrl": "...",
  "sourceUrl": "...",
  "lastUpdated": "..."
}

Return 404 when the tartan is unknown.

Search Tartans

GET /api/tartans/search?q=macdonald

Support:

Case-insensitive search.

Partial name matching.

Optional fuzzy matching.

Return:

{
  "query": "macdonald",
  "results": [
    {
      "ref": 1234,
      "name": "MacDonald",
      "category": "Clan/Family",
      "imageUrl": "..."
    }
  ]
}

List Tartans

GET /api/tartans

Query parameters:

page
limit
category
sort
order

Example:

GET /api/tartans?page=1&limit=50&category=Clan%2FFamily

Get Tartan Image Information

GET /api/tartans/:ref/image

Optional parameters:

width
height

Example response:

{
  "ref": 14598,
  "width": 750,
  "height": 750,
  "url": "..."
}

16. Internal/Admin API

Provide protected internal endpoints or CLI commands.

Examples:

POST /internal/crawl/discovery

POST /internal/crawl/tartans/:ref

POST /internal/crawl/refresh

Alternatively:

npm run crawl:discover
npm run crawl:details
npm run crawl:refresh

CLI support is sufficient for V1.

17. Incremental Synchronisation

After the initial full crawl, the application must support incremental updates.

The incremental process should:

Revisit high-value discovery/listing pages.

Extract current reference IDs.

Compare IDs against the local database.

Insert newly discovered references.

Queue new records for detail extraction.

Optionally revisit recently registered tartans.

Detect changes using content hashes.

Do not recrawl every tartan every day unless required.

Suggested schedule:

Discovery:

Once per day.

Recently discovered records:

Refresh periodically during their first several days.

Historical records:

Refresh infrequently.

The exact schedule should be configurable.

18. Rate Limiting

The crawler must behave conservatively.

Requirements:

Configurable concurrency.

Configurable delay between requests.

Retry with exponential backoff.

Maximum retry count.

Respect HTTP 429.

Respect HTTP 5xx.

Stop or significantly slow crawling when repeated errors occur.

Suggested defaults:

Concurrency: 1-2
Delay: 1000-3000 ms
Max retries: 3

Do not aggressively parallelise requests.

19. HTTP Client Requirements

Use a descriptive User-Agent.

Example:

TartanIndexer/1.0

If appropriate, include project/contact information.

Support:

Request timeout.

Retry.

Redirects.

Compression.

Rate limiting.

Log response status codes.

20. robots.txt and Terms

Before implementing production crawling:

Inspect robots.txt.

Review the website’s usage/copyright terms.

Identify any explicit crawling restrictions.

Do not bypass technical access controls.

Do not access authenticated-only data without explicit authorisation.

The application should make crawler behaviour configurable in case restrictions change.

21. Error Handling

The crawler must handle:

404.

403.

429.

500.

Connection timeout.

DNS failure.

Invalid HTML.

Missing expected elements.

Unexpected page structure.

A single failed tartan must not terminate the entire crawl.

Store failure information.

Example:

ref
error_type
error_message
attempt_count
last_attempt_at

Failed records should be retryable.

22. Parser Versioning

Store a parser version with every parsed record.

Example:

parser_version = "1.0.0"

If HTML structure changes, deploy:

parser_version = "1.1.0"

The system should then be capable of reprocessing stored raw HTML without downloading every page again.

23. Logging

Use structured logging.

Every crawl request should log:

timestamp
crawl_run_id
url
ref
http_status
duration_ms
attempt
result

Do not log unnecessary page content.

24. Metrics

Track at minimum:

tartans_total
tartans_discovered
tartans_indexed
tartans_failed
crawl_requests_total
crawl_errors_total
crawl_duration
new_tartans_discovered

25. Technology Recommendation

Preferred stack:

Node.js 20+
TypeScript
Fastify or NestJS
Cheerio
PostgreSQL
Kysely / Prisma / Knex
Pino

For a lightweight local implementation:

Node.js
TypeScript
Fastify
Cheerio
SQLite

The crawler should be independent from the HTTP API.

Suggested project structure:

src/
  api/
    routes/
    controllers/

  crawler/
    discovery/
      az.ts
      search.ts
      results.ts

    detail/
      fetch.ts
      parser.ts

    http/
      client.ts
      rate-limiter.ts

  services/
    tartan.service.ts
    crawl.service.ts

  repositories/
    tartan.repository.ts
    crawl.repository.ts

  db/
    migrations/

  models/

  cli/

  config/

26. Crawler Interface

Define a generic discovery interface.

interface DiscoveryProvider {
  discover(): AsyncIterable<DiscoveredTartan>;
}

Example:

interface DiscoveredTartan {
  ref: number;
  name: string;
  detailUrl: string;
  discoveryUrl: string;
}

Implement providers such as:

AzDiscoveryProvider
SearchDiscoveryProvider
ResultsDiscoveryProvider

This allows discovery strategies to change independently.

27. Detail Parser Interface

interface TartanDetailParser {
  parse(
    ref: number,
    html: string
  ): ParsedTartan;
}

The parser must contain no network logic.

Fetching and parsing must remain separate.

This allows parser unit testing with stored HTML fixtures.

28. Testing Requirements

Unit Tests

Test:

Reference extraction.

Duplicate reference handling.

Detail parsing.

Missing fields.

Image URL generation.

Date parsing.

Search.

Content hashing.

Use saved HTML fixtures.

Do not make live network calls in unit tests.

Integration Tests

Test:

Discovery → Database
Detail Fetch → Parser → Database
API → Database

Mock the source website.

Optional Live Smoke Test

Provide a manually executed test:

npm run test:live

This may fetch one known public tartan.

Do not run live crawling tests automatically in CI.

29. Initial Crawl Process

The initial bootstrap should work as follows:

START

↓
Create crawl run

↓
Run all configured discovery providers

↓
Extract ref IDs

↓
Deduplicate

↓
Upsert discovered tartans

↓
Identify records requiring detail extraction

↓
Fetch detail pages with rate limiting

↓
Parse metadata

↓
Store metadata

↓
Calculate source hash

↓
Mark INDEXED

↓
Complete crawl run

The process must be resumable.

If the crawler stops after 5,000 records, restarting should continue without starting the entire process again.

30. Acceptance Criteria

V1 is complete when:

The application can discover tartan ref IDs without sequential brute-force enumeration.

The application can extract a tartan reference from a public listing/search link.

The application stores each ref only once.

The application can retrieve and parse a tartan detail page.

The application stores publicly accessible tartan metadata.

The application can generate or expose the tartan image URL.

GET /api/tartans/:ref returns a stored tartan.

GET /api/tartans/search?q= searches tartans by name.

Crawling is rate limited.

Failed requests are retried safely.

Crawls can resume after interruption.

The crawler records its crawl status.

Parser logic has unit tests.

Discovery logic has unit tests.

The application can run an incremental discovery process to identify newly registered tartans.

31. Phase 2 — Visual Tartan Identification

The architecture should prepare for a future feature where a user uploads a photograph of an unknown tartan.

Example:

User Photo
    ↓
Image Preprocessing
    ↓
Pattern / Colour Analysis
    ↓
Image Embedding
    ↓
Vector Search
    ↓
Candidate Tartans
    ↓
Pattern Verification
    ↓
Top Matches

Example output:

{
  "matches": [
    {
      "ref": 1234,
      "name": "MacDonald",
      "confidence": 0.91
    },
    {
      "ref": 5678,
      "name": "MacDonald Modern",
      "confidence": 0.84
    }
  ]
}

The existing tartan database becomes the canonical candidate catalogue.

Possible future table:

tartan_images

id
tartan_ref
image_url
local_path
image_hash
embedding
embedding_model
created_at

Potential technology:

PostgreSQL + pgvector
OpenSearch vector search
CLIP/SigLIP/DINOv2 embeddings

Image embeddings alone should not be assumed to provide reliable final identification.

Future matching should consider:

Dominant colours.

Stripe positions.

Horizontal repetition.

Vertical repetition.

Sett geometry.

Relative stripe widths.

Pattern symmetry.

The final ranking may combine visual embeddings with explicit tartan-pattern analysis.

32. Phase 3 — Tartan Pattern Reconstruction

If legitimate threadcount information becomes available, support structured pattern storage.

Potential model:

{
  "ref": 14598,
  "threadcount": [
    {
      "colour": "B",
      "count": 24
    },
    {
      "colour": "R",
      "count": 4
    }
  ]
}

This could enable:

Exact SVG generation.

Repeatable seamless patterns.

Arbitrary-resolution rendering.

More accurate pattern comparison.

Threadcount-based matching.

This phase must not attempt to bypass restricted access to threadcount information.

33. Important Implementation Instruction for Coding Agent

Before writing the production crawler, perform a source-site investigation.

The agent must:

Fetch the live public search page.

Fetch the live A-Z page.

Fetch at least one listing/results page.

Fetch tartan detail ref=14598.

Inspect actual HTML structures.

Identify stable selectors.

Determine pagination behaviour.

Confirm how reference IDs appear in links.

Confirm the image-generation endpoint.

Check robots.txt.

Check relevant site usage terms.

Document findings in:

docs/source-investigation.md

Do not build the production scraper based solely on assumed selectors from this PRD.

The source investigation should determine the final implementation.

34. Deliverables

The coding agent should produce:

README.md
docs/source-investigation.md
docs/architecture.md

src/
tests/

.env.example
docker-compose.yml
Dockerfile
package.json
tsconfig.json

The README must explain:

Installation.

Database setup.

Running migrations.

Running discovery.

Running detail crawling.

Running incremental synchronisation.

Starting the API.

Searching tartans.

Running tests.

Provide commands similar to:

npm install

npm run db:migrate

npm run crawl:discover

npm run crawl:details

npm run crawl:sync

npm run dev

npm test

35. Final Expected Outcome

After running the initial indexing process, the application should maintain a searchable local catalogue:

Scottish Register
       │
       ▼
Discovery Crawler
       │
       ▼
Reference ID Index
       │
       ▼
Detail Crawler
       │
       ├── Metadata
       │
       └── Image URL
       │
       ▼
PostgreSQL
       │
       ▼
Tartan REST API
       │
       ├── Search by name
       ├── Lookup by ref
       ├── Browse category
       └── Retrieve image
       │
       ▼
Future Visual Matcher
       │
       ▼
"Upload photo → Find closest registered tartans"

The key design principle is:

Discover reference IDs through the Register’s public indexes first, maintain a local catalogue, and use individual ref values only after discovery. Never depend on brute-force sequential ID scanning as the primary indexing mechanism.