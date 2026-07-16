import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/detail/parser.js";
import { parseAzListing } from "../src/discovery/az.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf-8");
}

test("parse() extracts a fully-populated tartan detail page (ref=14598)", () => {
  const html = readFixture("detail-14598.html");
  const result = parse(14598, html);

  assert.equal(result.ref, 14598);
  assert.equal(result.name, "Loch Lomond Whisky");
  assert.equal(result.designer, "Kinloch Anderson Ltd");
  assert.equal(result.tartanDate, "17/12/2024");
  assert.equal(result.registrationDate, "23 December 2024");
  assert.equal(result.category, "Corporate");
  assert.match(result.restrictions, /Exclusively designed by Kinloch Anderson/);
  // <br> tags in the source must not glue words together.
  assert.doesNotMatch(result.restrictions, /use\.May/);
  assert.match(result.registrationNotes, /Loch Lomond Whisky/);
  assert.equal(result.detailUrl, "https://www.tartanregister.gov.uk/tartanDetails?ref=14598");
  assert.equal(
    result.imageUrl,
    "https://www.tartanregister.gov.uk/imageCreation.aspx?height=750&ref=14598&width=750",
  );
});

test("parse() tolerates missing fields (ref=9 has no Restrictions value)", () => {
  const html = readFixture("detail-9.html");
  const result = parse(9, html);

  assert.equal(result.ref, 9);
  assert.equal(result.name, "Abbotsford Check");
  assert.equal(result.designer, "Buchan, Alistair");
  assert.equal(result.category, "Fashion");
  // Restrictions label is present on the page but its value cell is empty.
  assert.equal(result.restrictions, "");
  assert.match(result.registrationNotes, /Sir Walter Scott/);
  assert.equal(result.imageUrl, "https://www.tartanregister.gov.uk/imageCreation.aspx?height=750&ref=9&width=750");
});

test("parse() always trusts the ref argument, not page content", () => {
  const html = readFixture("detail-14598.html");
  const result = parse(99999, html);
  assert.equal(result.ref, 99999);
  assert.equal(result.detailUrl, "https://www.tartanregister.gov.uk/tartanDetails?ref=99999");
});

test("parseAzListing() extracts every tartanDetails ref/name pair and dedupes", () => {
  const html = readFixture("az-A.html");
  const discoveryUrl = "https://www.tartanregister.gov.uk/az?searchString=A";
  const results = parseAzListing(html, discoveryUrl);

  assert.ok(results.length > 100, `expected many discovered tartans, got ${results.length}`);

  const refs = results.map((r) => r.ref);
  assert.equal(refs.length, new Set(refs).size, "refs must be deduplicated");

  const first = results.find((r) => r.ref === 10053);
  assert.ok(first, "expected ref 10053 to be discovered");
  assert.equal(first?.name, "A J Gallacher");
  assert.equal(first?.detailUrl, "https://www.tartanregister.gov.uk/tartanDetails?ref=10053");
  assert.equal(first?.discoveryUrl, discoveryUrl);
});

test("parseAzListing() returns [] for HTML with no tartan links", () => {
  const results = parseAzListing("<html><body>no results</body></html>", "https://example.invalid/az?searchString=Z");
  assert.deepEqual(results, []);
});
