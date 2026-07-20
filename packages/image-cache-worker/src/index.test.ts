// Pure param-validation checks — no network, no worker runtime.
// Run: node --test (via tsx) — see package.json "test".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpstream } from './index.ts';

const build = (q: string) => buildUpstream(new URLSearchParams(q));

test('valid ref + allow-listed square size → canonical gov.uk URL', () => {
  const r = build('height=360&ref=8&width=360');
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.url, 'https://www.tartanregister.gov.uk/imageCreation?height=360&ref=8&width=360');
});

test('param order does not matter (canonical key)', () => {
  const a = build('width=750&ref=14598&height=750');
  const b = build('ref=14598&height=750&width=750');
  assert.equal(a.ok && a.url, b.ok && b.url);
});

test('all three allow-listed sizes accepted', () => {
  for (const s of [360, 750, 900]) assert.equal(build(`ref=1&width=${s}&height=${s}`).ok, true);
});

test('non-numeric ref → 400', () => {
  assert.deepEqual(build('ref=abc&width=360&height=360'), { ok: false, status: 400 });
  assert.deepEqual(build('ref=8;drop&width=360&height=360'), { ok: false, status: 400 });
  assert.deepEqual(build('width=360&height=360'), { ok: false, status: 400 });
});

test('non-allow-listed size → 400', () => {
  assert.deepEqual(build('ref=8&width=999&height=999'), { ok: false, status: 400 });
  assert.deepEqual(build('ref=8&width=100000&height=100000'), { ok: false, status: 400 });
});

test('mismatched width/height → 400', () => {
  assert.deepEqual(build('ref=8&width=360&height=750'), { ok: false, status: 400 });
});
