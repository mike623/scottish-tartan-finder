/**
 * Orchestrates the full POC pipeline:
 *
 *   discover (1-2 A-Z letters) -> dedupe by ref -> fetch details
 *   (rate limited via HttpClient) -> parse -> write data/tartans-index.json
 *
 * Output matches docs/data-schema.md exactly (the contract shared with
 * apps/web). This is intentionally a small, polite POC — see PRD §6-9 and
 * docs/source-investigation.md for why brute-force ref enumeration is not
 * used and why the letter/detail counts here are kept small.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpClient } from "./http/client.js";
import { AzDiscoveryProvider, REGISTER_BASE_URL, type DiscoveredTartan } from "./discovery/az.js";
import { fetchDetail } from "./detail/fetch.js";
import { parse } from "./detail/parser.js";

export type TartanStatus = "DISCOVERED" | "INDEXED" | "FAILED" | "UNAVAILABLE";

/** Matches docs/data-schema.md TartanRecord exactly. */
export interface TartanRecord {
  ref: number;
  name: string;
  category: string;
  designer: string;
  tartanDate: string;
  registrationDate: string;
  restrictions: string;
  registrationNotes: string;
  detailUrl: string;
  imageUrl: string;
  status: TartanStatus;
  lastIndexedAt: string;
  /** SHA-256 of the detail HTML at index time; lets incremental sync detect changes. Optional (older records / smoke output may omit it). */
  sourceHash?: string;
}

export interface BuildIndexOptions {
  /** A-Z letters to run discovery over. POC default: just "A". */
  letters?: string[];
  /** Cap on how many discovered refs get a detail fetch (politeness/POC size). */
  maxDetails?: number;
  /** Refs to always fetch in addition to discovery results (e.g. the PRD's known example). */
  extraRefs?: number[];
  client?: HttpClient;
  outFile?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** packages/scraper/src -> repo root -> data/tartans-index.json */
const DEFAULT_OUT_FILE = path.resolve(__dirname, "../../../data/tartans-index.json");

export async function buildIndex(options: BuildIndexOptions = {}): Promise<TartanRecord[]> {
  const {
    letters = ["A"],
    maxDetails = 6,
    extraRefs = [],
    client = new HttpClient(),
    outFile = DEFAULT_OUT_FILE,
  } = options;

  const provider = new AzDiscoveryProvider(client, letters);
  const discovered: DiscoveredTartan[] = [];
  const seenRefs = new Set<number>();

  for await (const tartan of provider.discover()) {
    if (seenRefs.has(tartan.ref)) continue;
    seenRefs.add(tartan.ref);
    discovered.push(tartan);
    if (discovered.length >= maxDetails) break;
  }

  const refsToFetch: number[] = discovered.map((d) => d.ref);
  for (const ref of extraRefs) {
    if (!seenRefs.has(ref)) {
      seenRefs.add(ref);
      refsToFetch.push(ref);
    }
  }

  const records: TartanRecord[] = [];
  const today = isoDate(new Date());

  for (const ref of refsToFetch) {
    try {
      const { status, html } = await fetchDetail(client, ref);
      if (status !== 200) {
        console.error(`[index-build] ref=${ref} returned HTTP ${status}; marking UNAVAILABLE`);
        records.push(placeholderRecord(ref, today, "UNAVAILABLE"));
        continue;
      }
      const parsed = parse(ref, html);
      records.push({
        ref,
        name: parsed.name,
        category: parsed.category,
        designer: parsed.designer,
        tartanDate: parsed.tartanDate,
        registrationDate: parsed.registrationDate,
        restrictions: parsed.restrictions,
        registrationNotes: parsed.registrationNotes,
        detailUrl: parsed.detailUrl,
        imageUrl: parsed.imageUrl,
        status: "INDEXED",
        lastIndexedAt: today,
      });
    } catch (err) {
      console.error(`[index-build] failed to fetch/parse ref=${ref}:`, (err as Error).message);
      records.push(placeholderRecord(ref, today, "FAILED"));
    }
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, `${JSON.stringify(records, null, 2)}\n`, "utf-8");
  return records;
}

function placeholderRecord(ref: number, today: string, status: TartanStatus): TartanRecord {
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
    status,
    lastIndexedAt: today,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
