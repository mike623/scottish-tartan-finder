import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpClient, MAX_SAFE_CONCURRENCY } from "../src/http/client.js";

/** Swap global.fetch for a fake that records concurrency + start times. */
function withFakeFetch(responseDelayMs: number) {
  const original = globalThis.fetch;
  const starts: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  globalThis.fetch = (async () => {
    starts.push(Date.now());
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, responseDelayMs));
    inFlight -= 1;
    return new Response("<html></html>", { status: 200 });
  }) as typeof fetch;
  return {
    stats: () => ({ starts, maxInFlight }),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("concurrency caps in-flight requests but keeps starts spaced by delayMs", async () => {
  const fake = withFakeFetch(80); // each response takes 80ms
  try {
    const delayMs = 40;
    const client = new HttpClient({ delayMs, concurrency: 2, log: () => {} });
    const t0 = Date.now();
    await Promise.all([1, 2, 3, 4].map((n) => client.get(`https://x/${n}`)));
    const { starts, maxInFlight } = fake.stats();

    assert.equal(starts.length, 4);
    assert.ok(maxInFlight <= 2, `max in-flight ${maxInFlight} exceeded concurrency 2`);
    // 4 requests, starts spaced >= delayMs => last start is >= 3*delayMs after first.
    const spread = (starts[3] ?? 0) - (starts[0] ?? 0);
    assert.ok(spread >= delayMs * 3 * 0.8, `starts not spaced: spread=${spread}ms`);
    assert.ok(Date.now() - t0 >= delayMs * 3 * 0.8);
  } finally {
    fake.restore();
  }
});

test("concurrency is clamped to MAX_SAFE_CONCURRENCY", async () => {
  const fake = withFakeFetch(0);
  const errs: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => errs.push(a.join(" "));
  try {
    const client = new HttpClient({ delayMs: 0, concurrency: 30, log: () => {} });
    await client.get("https://x/1"); // exercises it
    assert.ok(errs.some((e) => e.includes("clamped")), "expected clamp warning");
    assert.ok(MAX_SAFE_CONCURRENCY < 30);
  } finally {
    console.error = origErr;
    fake.restore();
  }
});
