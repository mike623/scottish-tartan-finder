# Image-to-Tartan Search — Design (plan only)

Date: 2026-07-16
Status: Design for later decision — **not** scheduled for implementation.
Implements PRD §31 (Phase 2, Visual Tartan Identification), pure-static variant.

## Goal

"Upload a photo of an unknown tartan → get the closest registered tartans."
Runs **fully client-side** on the existing static GitHub Pages site — no backend,
no API keys, photo never leaves the device.

## Domain reality (why naive image search fails)

Tartans are geometric repeating **setts**: an ordered sequence of coloured
stripes with specific relative widths and mirror symmetry. This breaks the
obvious approaches:

- **Generic image embeddings** (CLIP / SigLIP / DINOv2) capture coarse
  appearance ("greenish plaid") — strong for *recall*, weak at the fine sett
  geometry that separates near-identical tartans (e.g. clan variants).
- **An LLM alone** can't scan 10,822 tartans, can't read exact threadcounts off
  a folded, badly-lit photo, and hallucinates. Threadcounts themselves are
  restricted (PRD non-goal), so we do **not** have sett data to match against.
- We DO have one clean signal per tartan: the **official swatch render**
  (`imageCreation.aspx?ref=…`) — frontal, uniform lighting. So we match the
  user photo against these renders, not against threadcount data we lack.

PRD §31 states this explicitly: image embeddings alone are not reliable final
identification. The design treats matching as a **shortlist**, not an ID.

## Architecture — a funnel, fully static

```
OFFLINE (build-time, one-off pipeline)
  official render (imageCreation.aspx) ──► center-tile ──► embed (ONNX model)
      └► also precompute a structural descriptor: dominant palette + stripe profile
  ⇒ ship as static assets:
     - reference-vectors.bin   (10,822 × D, int8-quantized + per-vector scale + L2 norm)
     - reference-descriptors.json (per ref: palette[], stripeProfileH[], stripeProfileV[])
     - reference-meta.json      (ref, name, category, image URL)

CLIENT (/identify page, lazy-loaded)
  user photo
   └► crop to a flat fabric region (drag box)  ── manual crop; auto-detect later
   └► white-balance (gray-world) + resize + tile
   └► embed with the SAME model (transformers.js + WebGPU, WASM fallback)
   └► cosine similarity vs shipped vectors  (brute force; 10.8k × D is <50ms in WASM)
   └► take top ~20
   └► STRUCTURAL RE-RANK against shipped descriptors:
        palette distance (min-cost colour matching in Lab)
        + stripe-profile correlation (shift-invariant NCC; tartans are phase-free)
        + symmetry check
   └► show top 5 with a confidence hint + "family" grouping
```

The photo is embedded and matched entirely in the browser. Nothing is uploaded.

## Component notes

### Embedding model (decide via spike)
Candidates, all supported by transformers.js and runnable in-browser:
- **DINOv2** (ViT-S/14, 384-d or ViT-B/14, 768-d) — self-supervised, strong on
  texture/structure. Leading candidate for repeating-pattern discrimination.
- **SigLIP** (768-d) — strong general image encoder, usually beats CLIP.
- **CLIP ViT-B/32** (512-d) — smallest/fastest, weakest on fine texture; baseline.

Tile strategy: embed a **single sett-repeat tile** (not the whole garment) and
average over a few tiles → scale/crop robustness. The right model + tile size is
the main thing the spike must settle.

### Reference index (static asset sizes)
- int8-quantized vectors: `10,822 × D` → ~4.1 MB (D=384) to ~8.3 MB (D=768).
- Descriptors JSON: a few hundred KB (small palettes + short 1-D profiles).
- Model weights: ~30–90 MB, downloaded once and cached by the browser.
- All lazy-loaded **only on `/identify`** — zero cost to the rest of the site.

### Structural re-rank (deterministic, client-side)
From the query tile and each candidate's shipped descriptor:
- **Palette**: k-means in Lab (~6 colours); compare by min-cost matching.
- **Stripe profile**: average rows → horizontal colour sequence, average cols →
  vertical; compare via normalized cross-correlation allowing any phase shift
  (setts are shift-invariant) + a symmetry test.
- Final rank = weighted blend of (embedding cosine, palette distance, stripe
  correlation). Weights tuned on the eval set.
Descriptors are precomputed offline and shipped, so the client never re-fetches
or decodes candidate images.

### LLM's role (out of scope for pure-static)
An LLM judge over the top-K would improve precision, but a pure-static site
can't hold an API key. It is therefore **replaced by the structural re-rank**.
If wanted later, the *only* piece that needs a backend is a tiny serverless
proxy (e.g. a Cloudflare Worker) that takes the photo + top-K candidate refs and
returns a re-ranking — a clean bolt-on that doesn't change the rest.

## Accuracy expectations

- Output is "the 5 closest registered tartans," **not** a guaranteed exact ID.
- Colour variants (Modern / Ancient / Weathered / Muted) are recolourings of the
  same sett — expect them to cluster. Treat as a **family** match (a feature).
- Folds, pleats, lighting, partial crops degrade results; preprocessing mitigates
  but does not solve. The UI must communicate uncertainty.
- **Success metric:** top-5 hit rate on a labelled photo set. This requires
  building a small eval set (photos of known tartans) — a prerequisite, not an
  afterthought.

## Open risk (must resolve before any build)

The core unknown: **do off-the-shelf embeddings discriminate 10,822 tartans well
enough?** Unknown until measured. A spike (embed ~500–1000 tartans with 2–3
models, test top-5 on ~30 real photos) answers it cheaply before committing to
the full 10.8k pipeline + `/identify` UI. If the spike fails, options are:
tile-level matching only, threadcount data (needs Register permission), or
shelving the feature.

## Phased plan (when picked up)

1. **Spike** — offline-embed 500–1000 renders with DINOv2 vs SigLIP vs CLIP;
   build a ~30-photo eval set; measure top-5 hit rate; pick model + tile size.
   Go/no-go gate.
2. **Offline pipeline** (`packages/embed` or extend the scraper) — politely fetch
   all 10,822 renders (reuse the crawler's rate limiting), embed, quantize, emit
   `reference-vectors.bin` + descriptors + meta into `apps/web/public/`.
3. **Client `/identify`** — transformers.js embed (WebGPU/WASM), crop UI, KNN,
   structural re-rank, results with confidence + family grouping.
4. **Polish** — auto fabric-region detection, tuned re-rank weights, fallbacks
   for no-WebGPU / no-match.
5. **Optional** — LLM re-rank via a minimal Worker proxy (separate decision;
   breaks pure-static).

## UI / design elements needed (new)

The current design (`Scottish Tartan Finder.dc.html`) has home / search / browse /
categories / detail / about — **no photo-match page**. This feature needs a new
route `/identify` plus nav entry ("Match a photo" / "Identify"), and several
states the existing system doesn't cover:

- **Upload / capture** — drop zone + file picker + `capture="environment"` for
  mobile camera. Privacy line: "Your photo stays on your device."
- **Crop step** — draggable box over the photo to select a flat fabric region
  (the single most important input-quality lever).
- **Analyzing state** — model download progress (first use, ~tens of MB) +
  "matching…" spinner. Needs honest progress because first load is slow.
- **Results** — ranked candidate cards (reuse `TartanCard`) with a **confidence
  hint** (e.g. strong / possible / weak) and **family grouping** (colour variants
  of one sett shown together). Each links to `/tartan/[ref]`.
- **Empty / low-confidence state** — "No strong match — here are the nearest,"
  plus tips (flatten fabric, better light, crop tighter).
- **Unsupported fallback** — no-WebGPU / very old browser message.

These reuse the existing heritage styling (Cormorant / Libre Franklin / IBM Plex
Mono, cream + tartan-accent palette, card grid), so it fits the current look. The
genuinely new pieces are the upload/crop interaction and the confidence/family
result treatment.

**Recommendation:** design `/identify` as one screen in the same Claude Design
project as the original prototype (so it's stylistically consistent), covering
the six states above; I implement from it the same way as the other pages. If you
prefer, I can build it directly in the existing component style without a new
design — but for a feature with this many novel states, a design pass first is
worth it.

## Data-model tie-in

Additive to `docs/data-schema.md` — no breaking change. A future `tartan_images`
concept (PRD §31) can carry `imageUrl`, `imageHash`, `embedding`, `embeddingModel`
when the pipeline lands. Nothing to change now.

## Decisions still open (for when this is picked up)

- Embedding model + tile size (spike settles).
- Crop UX: manual drag-box first; auto fabric detection later.
- Eval-set source (photos of known tartans — hand-collected).
- Whether to ever add the optional LLM re-rank proxy (revisits pure-static).
