# Design Agent Prompt — Scottish Tartan Finder

## Your task

Design a clean, trustworthy, mobile-friendly public website for **Scottish Tartan Finder**: an unofficial static catalogue that helps people search, browse, and understand Scottish tartans using attributed public data from the Scottish Register of Tartans.

The design should feel heritage-aware and modern: respectful, warm, readable, and practical. Avoid kitschy tourist clichés. The product should look like a helpful public reference tool, not an ecommerce shop.

## Product goal

Help users quickly answer:

1. "Which tartan am I looking for?"
2. "What does it look like?"
3. "Is this the right tartan/category/source record?"
4. "Where can I verify it on the official Register?"

## Required pages / screens

### 1. Home / Search landing page

Must include:

- Product name: **Scottish Tartan Finder**
- Clear search input as the primary action
- Short description: "Search and browse an unofficial index of publicly listed Scottish tartans."
- Prominent source/disclaimer line: "Unofficial helper. Verify authoritative records at the Scottish Register of Tartans."
- Browse shortcuts:
  - A–Z browse
  - Categories
  - Recently added / newly discovered records, if available
- Example searches or popular categories

### 2. Search results page

Must include:

- Search box with current query
- Result count
- Sort/filter controls:
  - Category
  - A–Z/name
  - Registration/design date if available
- Result cards/list rows containing:
  - Tartan thumbnail
  - Tartan name
  - Reference ID
  - Category
  - Designer if available
  - Registration/design date if available
  - Link/button to detail page
- Empty state for no results
- Loading/searching state if client-side search is used

### 3. Browse A–Z page

Must include:

- Alphabet navigation A–Z
- Current letter heading
- Tartan list grouped/readable on mobile
- Each item links to a detail page

### 4. Category browse page

Must include categories such as:

- Clan/Family
- District
- Corporate
- Fashion
- Military
- Commemorative
- Name
- Other

Each category card should show:

- Category name
- Short explanation placeholder
- Count placeholder
- Link to browse category

### 5. Tartan detail page

This is the most important page.

Must include:

- Large tartan image/pattern preview
- Tartan name as H1
- Reference ID
- Category badge
- Source attribution block near the top or beside metadata
- Metadata table/list:
  - Designer
  - Tartan/design date
  - Registration date
  - Category
  - Restrictions
  - Registration notes
  - Last indexed/fetched date
- Official source link button:
  - "View official Register record"
- Image helper/action:
  - "Open tartan image"
- Clear disclaimer:
  - "This page is an unofficial index entry. The Scottish Register of Tartans is the authoritative source."
- Related/future placeholder:
  - Similar tartans / visual matching coming later

### 6. About / Attribution page

Must include:

- What this site is
- What this site is not
- Source attribution to Scottish Register of Tartans
- Unofficial disclaimer
- Data freshness explanation
- Respectful crawling statement
- Contact/project GitHub link placeholder

## Navigation requirements

Global navigation should include:

- Search
- Browse A–Z
- Categories
- About
- GitHub/project link

Mobile navigation must be simple and thumb-friendly.

## Required content elements

Every tartan detail page and major data view must make these visible:

- Tartan name
- Reference ID
- Category
- Image/pattern preview when available
- Source URL / official record link
- Unofficial attribution/disclaimer

## Visual style direction

Use:

- Clean reference-site layout
- Warm neutral background
- Deep heritage colours as accents: navy, forest green, burgundy, cream, muted gold
- Subtle tartan-inspired grid/stripe accents, but do not overpower readability
- Card-based result lists
- Large readable typography
- Accessible colour contrast

Avoid:

- Heavy novelty Scottish clichés
- Fake official-government appearance
- Ecommerce-first styling
- Overly busy tartan backgrounds behind text
- Hiding source/disclaimer information

## Accessibility requirements

- Mobile-first responsive layout
- Keyboard-friendly search and navigation
- Proper heading hierarchy
- Alt text for tartan images: e.g. "Tartan pattern for {name}"
- Do not rely on colour alone for category/status
- High contrast text
- Large enough tap targets

## Static-site constraints

This site is planned for Astro + GitHub Pages.

Design must work without:

- Server-side database
- Login/account system
- Live backend API
- User-generated content

Search should assume either:

- static JSON + client-side search, or
- Pagefind static search index

## Components to design

Minimum component set:

1. Header/nav
2. Search bar
3. Tartan result card
4. Tartan thumbnail image frame
5. Category badge
6. Filter/sort bar
7. A–Z letter navigation
8. Metadata table/list
9. Source attribution/disclaimer box
10. Empty state
11. Footer

## Deliverables wanted from design agent

Provide:

- Visual direction summary
- Page layout wireframes or component descriptions
- Colour palette
- Typography recommendation
- Component inventory
- Responsive behaviour notes
- Any copy improvements for key CTAs/disclaimers

## Sample data fields

Design around this model:

```json
{
  "ref": 14598,
  "name": "Loch Lomond Whisky",
  "category": "Corporate",
  "designer": "Kinloch Anderson Ltd",
  "tartanDate": "2024-12-17",
  "registrationDate": "2024-12-23",
  "restrictions": "...",
  "registrationNotes": "...",
  "imageUrl": "https://www.tartanregister.gov.uk/imageCreation.aspx?height=750&ref=14598&width=750",
  "sourceUrl": "https://www.tartanregister.gov.uk/tartanDetails.aspx?ref=14598",
  "lastIndexedAt": "2026-07-16"
}
```
