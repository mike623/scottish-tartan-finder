/**
 * Incremental sync — the "run regularly" path (PRD §17).
 *
 * Delta, not full re-scrape:
 *   1. Discover refs cheaply. Default mode "whatsNew" = one request to the
 *      recent-registrations feed. Mode "az" re-lists A-Z letters (for a fuller
 *      backfill), still one small request per letter.
 *   2. Diff discovered refs against the local data/tartans-index.json.
 *   3. Detail-fetch ONLY refs that are new (or not yet INDEXED). Capped by
 *      `maxNew` so a backfill spreads across scheduled runs instead of one
 *      aggressive burst.
 *   4. Upsert by ref into the existing index and write it back.
 *
 * The "detail workers" are just concurrent detail fetches; HttpClient bounds
 * how many run at once and spaces request starts (see http/client.ts). Against
 * this single .gov.uk host, keep concurrency low.
 */
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpClient } from "./http/client.js";
import { AzDiscoveryProvider, REGISTER_BASE_URL, type DiscoveredTartan } from "./discovery/az.js";
import { discoverWhatsNew } from "./discovery/whatsNew.js";
import { fetchDetail } from "./detail/fetch.js";
import { parse } from "./detail/parser.js";
import type { TartanRecord, TartanStatus } from "./index-build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.resolve(__dirname, "../../../data/tartans-index.json");
const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type SyncMode = "whatsNew" | "az";

export interface SyncOptions {
  mode?: SyncMode;
  /** For mode "az": letters to re-list. Default A-Z. */
  letters?: string[];
  /** Cap on detail fetches this run (spread backfills across runs). Default 25. */
  maxNew?: number;
  /** Parallel detail workers. Clamped by HttpClient.MAX_SAFE_CONCURRENCY. Default 2. */
  concurrency?: number;
  delayMs?: number;
  client?: HttpClient;
  dataFile?: string;
  /** Injectable clock for tests. */
  now?: () => Date;
}

export interface SyncSummary {
  mode: SyncMode;
  /** Unique refs seen on the discovery source this run. */
  discovered: number;
  /** Discovered refs already INDEXED locally (skipped). */
  alreadyIndexed: number;
  /** Detail pages actually fetched this run. */
  fetched: number;
  /** Eligible refs left for a future run because of the maxNew cap. */
  deferred: number;
  added: number;
  updated: number;
  failed: number;
  total: number;
}

/** Pure: pick discovered refs that need a detail fetch (new, or not yet INDEXED). Capped. */
export function selectToFetch(
  discovered: DiscoveredTartan[],
  existing: Map<number, TartanRecord>,
  maxNew: number,
): number[] {
  const refs: number[] = [];
  const seen = new Set<number>();
  for (const d of discovered) {
    if (seen.has(d.ref)) continue;
    seen.add(d.ref);
    const have = existing.get(d.ref);
    if (!have || have.status !== "INDEXED") refs.push(d.ref);
    if (refs.length >= maxNew) break;
  }
  return refs;
}

/** Pure: upsert fetched records into the existing set, return a ref-sorted array. */
export function mergeRecords(
  existing: Map<number, TartanRecord>,
  fetched: TartanRecord[],
): TartanRecord[] {
  const merged = new Map(existing);
  for (const rec of fetched) merged.set(rec.ref, rec);
  return [...merged.values()].sort((a, b) => a.ref - b.ref);
}

async function readExisting(dataFile: string): Promise<TartanRecord[]> {
  try {
    return JSON.parse(await readFile(dataFile, "utf-8")) as TartanRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function discover(client: HttpClient, mode: SyncMode, letters: string[]): Promise<DiscoveredTartan[]> {
  if (mode === "whatsNew") return discoverWhatsNew(client);
  const provider = new AzDiscoveryProvider(client, letters);
  const out: DiscoveredTartan[] = [];
  for await (const t of provider.discover()) out.push(t);
  return out;
}

function toRecord(ref: number, html: string, isoToday: string): TartanRecord {
  const p = parse(ref, html);
  return {
    ref,
    name: p.name,
    category: p.category,
    designer: p.designer,
    tartanDate: p.tartanDate,
    registrationDate: p.registrationDate,
    restrictions: p.restrictions,
    registrationNotes: p.registrationNotes,
    detailUrl: p.detailUrl,
    imageUrl: p.imageUrl,
    status: "INDEXED",
    lastIndexedAt: isoToday,
    sourceHash: createHash("sha256").update(html).digest("hex"),
  };
}

export async function syncIndex(options: SyncOptions = {}): Promise<SyncSummary> {
  const {
    mode = "whatsNew",
    letters = ALL_LETTERS,
    maxNew = 25,
    concurrency = 2,
    delayMs = 2000,
    client = new HttpClient({ delayMs, concurrency }),
    dataFile = DEFAULT_DATA_FILE,
    now = () => new Date(),
  } = options;

  const isoToday = now().toISOString().slice(0, 10);
  const existingArr = await readExisting(dataFile);
  const existing = new Map<number, TartanRecord>(existingArr.map((r) => [r.ref, r]));

  const discovered = await discover(client, mode, letters);
  const eligible = selectToFetch(discovered, existing, Number.MAX_SAFE_INTEGER);
  const toFetch = eligible.slice(0, maxNew);
  const uniqueDiscovered = new Set(discovered.map((d) => d.ref)).size;

  // Concurrent detail fetches — HttpClient bounds parallelism and spacing.
  const fetched: TartanRecord[] = [];
  let failed = 0;
  const results = await Promise.allSettled(
    toFetch.map(async (ref) => {
      const { status, html } = await fetchDetail(client, ref);
      if (status !== 200) {
        const placeholder: TartanRecord = {
          ...(existing.get(ref) ?? blankRecord(ref)),
          status: (status === 404 ? "UNAVAILABLE" : "FAILED") as TartanStatus,
          lastIndexedAt: isoToday,
        };
        throw Object.assign(new Error(`HTTP ${status}`), { placeholder });
      }
      return toRecord(ref, html, isoToday);
    }),
  );
  for (const r of results) {
    if (r.status === "fulfilled") fetched.push(r.value);
    else {
      failed += 1;
      const placeholder = (r.reason as { placeholder?: TartanRecord }).placeholder;
      if (placeholder) fetched.push(placeholder);
    }
  }

  const merged = mergeRecords(existing, fetched);
  await mkdir(path.dirname(dataFile), { recursive: true });
  // Atomic write: a kill mid-write must not corrupt the index. Write a temp
  // file, then rename over the target (rename is atomic on the same fs).
  const tmp = `${dataFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  await rename(tmp, dataFile);

  const added = fetched.filter((r) => !existing.has(r.ref)).length;
  const updated = fetched.length - added;
  return {
    mode,
    discovered: uniqueDiscovered,
    alreadyIndexed: uniqueDiscovered - eligible.length,
    fetched: fetched.length,
    deferred: eligible.length - toFetch.length,
    added,
    updated,
    failed,
    total: merged.length,
  };
}

function blankRecord(ref: number): TartanRecord {
  return {
    ref,
    name: "",
    category: "",
    designer: "",
    tartanDate: "",
    registrationDate: "",
    restrictions: "",
    registrationNotes: "",
    detailUrl: `${REGISTER_BASE_URL}/tartanDetails?ref=${ref}`,
    imageUrl: `${REGISTER_BASE_URL}/imageCreation.aspx?height=750&ref=${ref}&width=750`,
    status: "FAILED",
    lastIndexedAt: "",
  };
}
