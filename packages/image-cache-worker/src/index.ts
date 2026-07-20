// Edge cache/proxy for Scottish Register of Tartans swatch images.
//
// Visitors request `/imageCreation?height=&ref=&width=` against this worker instead
// of hammering tartanregister.gov.uk directly. The worker serves from Cloudflare's
// edge cache and only touches the (non-CDN, .gov.uk) origin on a miss — collapsing
// origin load and removing the block risk of per-visitor hotlinking.
//
// Crown copyright imagery, reuse permitted with attribution (see docs/source-investigation.md).
// Attribution lives in the site footer; this worker only proxies bytes.

const ORIGIN = 'https://www.tartanregister.gov.uk';
const ALLOWED_SIZES = new Set([360, 750, 900]);
const MAX_AGE = 2592000; // 30d — images are near-static ("cache once, long-lived").

export type BuildResult =
  | { ok: true; url: string }
  | { ok: false; status: number };

// Pure: validate + normalize query params into a canonical upstream URL.
// Rejects anything but a digit `ref` and an allow-listed square size, so the worker
// can't be used as an open proxy and the cache can't be blown up with arbitrary sizes.
// Canonical param order means `?width=360&ref=8` and `?ref=8&width=360` share a cache key.
export function buildUpstream(params: URLSearchParams): BuildResult {
  const ref = params.get('ref') ?? '';
  const width = params.get('width') ?? '';
  const height = params.get('height') ?? '';

  if (!/^\d+$/.test(ref)) return { ok: false, status: 400 };
  if (width !== height) return { ok: false, status: 400 };

  const size = Number(width);
  if (!ALLOWED_SIZES.has(size)) return { ok: false, status: 400 };

  return { ok: true, url: `${ORIGIN}/imageCreation?height=${size}&ref=${ref}&width=${size}` };
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/imageCreation') return new Response('Not found', { status: 404 });

    const built = buildUpstream(url.searchParams);
    if (!built.ok) return new Response('Bad request', { status: built.status });

    const cache = caches.default;
    const cacheKey = new Request(built.url, { method: 'GET' });

    const hit = await cache.match(cacheKey);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set('x-cache', 'HIT');
      return new Response(hit.body, { status: hit.status, headers: h });
    }

    // ponytail: no request coalescing — concurrent misses for the same ref may
    // double-fetch origin. Fine at this volume; add a lock only if stampedes appear.
    const upstream = await fetch(built.url, {
      headers: { 'user-agent': 'TartanIndexer/1.0 (+edge cache)' },
      cf: { cacheEverything: true, cacheTtl: MAX_AGE },
    });

    if (!upstream.ok) {
      // Don't poison the cache with a transient gov.uk error — pass it through, no cache.put.
      return new Response(upstream.body, { status: upstream.status, headers: { 'cache-control': 'no-store' } });
    }

    // Whitelist headers: the origin sends Set-Cookie (ARRAffinity) — Cache API refuses to
    // store a response carrying Set-Cookie, so copying it through would silently break
    // caching. We only need the content type; everything else we set ourselves.
    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', `public, max-age=${MAX_AGE}, immutable`);
    headers.set('access-control-allow-origin', '*');
    headers.set('x-cache', 'MISS');
    const response = new Response(upstream.body, { status: 200, headers });

    // ponytail: caches.default is LRU-evictable; on eviction we re-fetch once. Upgrade to
    // R2/KV for permanent storage only if eviction churn shows up in gov.uk logs.
    // ponytail: no referrer allowlist. ref+size validation already bounds this to gov.uk
    // tartan swatches (harmless to cache). Add a Referer check if the worker gets abused.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
