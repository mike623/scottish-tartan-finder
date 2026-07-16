import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectToFetch, mergeRecords } from "../src/sync.js";
import { parseAzListing } from "../src/discovery/az.js";
import type { TartanRecord } from "../src/index-build.js";
import type { DiscoveredTartan } from "../src/discovery/az.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFile(path.join(__dirname, "..", "fixtures", name), "utf-8");

const disc = (ref: number): DiscoveredTartan => ({
  ref,
  name: `T${ref}`,
  detailUrl: `d/${ref}`,
  discoveryUrl: "src",
});
const rec = (ref: number, status: TartanRecord["status"] = "INDEXED"): TartanRecord => ({
  ref,
  name: `T${ref}`,
  category: "",
  designer: "",
  tartanDate: "",
  registrationDate: "",
  restrictions: "",
  registrationNotes: "",
  detailUrl: "",
  imageUrl: "",
  status,
  lastIndexedAt: "2026-07-16",
});

test("selectToFetch: only new or not-INDEXED refs, deduped, capped", () => {
  const existing = new Map<number, TartanRecord>([
    [1, rec(1, "INDEXED")],
    [2, rec(2, "FAILED")],
  ]);
  const discovered = [disc(1), disc(2), disc(3), disc(3), disc(4)];
  // 1 is INDEXED -> skip; 2 is FAILED -> refetch; 3 new (dedup); 4 new
  assert.deepEqual(selectToFetch(discovered, existing, 25), [2, 3, 4]);
});

test("selectToFetch: respects maxNew cap", () => {
  const discovered = [disc(10), disc(11), disc(12), disc(13)];
  assert.deepEqual(selectToFetch(discovered, new Map(), 2), [10, 11]);
});

test("mergeRecords: upserts by ref, keeps untouched, sorts by ref", () => {
  const existing = new Map<number, TartanRecord>([
    [5, rec(5)],
    [2, rec(2)],
  ]);
  const fetched = [rec(2, "UNAVAILABLE"), rec(9)];
  const merged = mergeRecords(existing, fetched);
  assert.deepEqual(merged.map((r) => r.ref), [2, 5, 9]); // sorted, 5 kept
  assert.equal(merged.find((r) => r.ref === 2)?.status, "UNAVAILABLE"); // upserted
});

test("mergeRecords: does not shrink the existing index", () => {
  const existing = new Map<number, TartanRecord>([[1, rec(1)], [2, rec(2)], [3, rec(3)]]);
  const merged = mergeRecords(existing, [rec(4)]);
  assert.equal(merged.length, 4); // all kept + 1 added, never fewer
});

test("whatsNew feed fixture parses the recent refs", async () => {
  const html = await fixture("whatsNew.html");
  const found = parseAzListing(html, "https://www.tartanregister.gov.uk/whatsNew");
  assert.ok(found.length >= 15, `expected many recent refs, got ${found.length}`);
  assert.ok(found.some((t) => t.ref === 15474), "expected known recent ref 15474");
});
