#!/usr/bin/env node
/**
 * CLI entry point: `discover | details | smoke`.
 *
 *   discover [letters...]  Run A-Z discovery for the given letters (default "A")
 *                          and print the deduped results as JSON.
 *   details [refs...]      Fetch + parse the given ref(s) (default 14598, the
 *                          PRD's known example) and print the parsed result(s).
 *   smoke                  End-to-end POC run: discover letter "A", fetch a
 *                          small sample of its details plus ref 14598, parse,
 *                          and write data/tartans-index.json. This is the
 *                          "polite live smoke" referenced in the design doc —
 *                          it makes a small, rate-limited number of live
 *                          requests (see docs/source-investigation.md).
 */
import { HttpClient } from "./http/client.js";
import { AzDiscoveryProvider } from "./discovery/az.js";
import { fetchDetail } from "./detail/fetch.js";
import { parse } from "./detail/parser.js";
import { buildIndex } from "./index-build.js";

const RATE_LIMIT_DELAY_MS = 2000;

async function runDiscover(args: string[]): Promise<void> {
  const letters = args.length > 0 ? args : ["A"];
  const client = new HttpClient({ delayMs: RATE_LIMIT_DELAY_MS });
  const provider = new AzDiscoveryProvider(client, letters);

  const results = [];
  for await (const tartan of provider.discover()) {
    results.push(tartan);
  }

  console.log(JSON.stringify(results, null, 2));
  console.error(`[discover] ${results.length} unique tartan(s) discovered for letters: ${letters.join(", ")}`);
}

async function runDetails(args: string[]): Promise<void> {
  const refs = args.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const targets = refs.length > 0 ? refs : [14598];
  const client = new HttpClient({ delayMs: RATE_LIMIT_DELAY_MS });

  const results = [];
  for (const ref of targets) {
    const { status, html } = await fetchDetail(client, ref);
    if (status !== 200) {
      console.error(`[details] ref=${ref} returned HTTP ${status}; skipping`);
      continue;
    }
    results.push(parse(ref, html));
  }

  console.log(JSON.stringify(results, null, 2));
}

async function runSmoke(): Promise<void> {
  const client = new HttpClient({ delayMs: RATE_LIMIT_DELAY_MS });
  const records = await buildIndex({
    letters: ["A"],
    maxDetails: 6,
    extraRefs: [14598],
    client,
  });
  console.error(`[smoke] wrote ${records.length} record(s) to data/tartans-index.json`);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case "discover":
      await runDiscover(rest);
      break;
    case "details":
      await runDetails(rest);
      break;
    case "smoke":
      await runSmoke();
      break;
    default:
      console.error("Usage: tsx src/cli.ts <discover|details|smoke> [args]");
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
