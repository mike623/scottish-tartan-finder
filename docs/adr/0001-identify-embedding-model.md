# ADR 0001 — Embedding model for `/identify` photo search

- Status: **Model locked; feature NOT greenlit** — synthetic eval passed but a
  real-photo touchpoint failed (see "Real-photo reality check"). Needs a proper
  real eval set + rework before any build.
- Date: 2026-07-17
- Context: PRD §31 Phase 2 · design spec `docs/superpowers/specs/2026-07-16-image-search-design.md`

## Context

`/identify` matches a user's photo of an unknown tartan against the 10,822
registered swatches, **fully client-side** (transformers.js, no backend, photo
never uploaded). The core unknown from the spec: *do off-the-shelf image
embeddings discriminate tartans well enough?* A spike measured three
transformers.js-compatible models on 123 official swatch renders.

Two evals:

1. **Crop self-retrieval** — center-crop a render, retrieve its parent. Easy;
   crops are near-duplicates of the swatch.
2. **Photo-sim** — degrade a render to look like a phone photo (tilt ±8°,
   uneven-light shadow, colour cast, defocus, reframe crop, JPEG q38), retrieve
   its parent. Labels stay perfect (query *is* ref N degraded), so it needs no
   hand-collected photos. This is the eval that predicts production.

Results (recall@5):

| model | crop (easy) | photo-sim (realistic) | Δ |
|---|---|---|---|
| CLIP ViT-B/32 (512-d) | 86% | 46% | −40 |
| **SigLIP-B/16 (768-d)** | 70% | **66%** | **−4** |
| DINOv2-small (384-d) | 48% | (worst on both) | — |

The easy eval favoured CLIP; the realistic eval **flipped the ranking**. CLIP
overfits clean swatches and collapses under photo distortion. SigLIP is robust
to real-photo conditions — the property that matters. This overturns the spec's
prior lean toward DINOv2 for texture.

## Decision

**Lock SigLIP-B/16 (`Xenova/siglip-base-patch16-224`) as the embedding model**
for the `/identify` pipeline. Robustness to photo distortion outweighs raw
clean-swatch accuracy. Its costs — 768-d vectors (~8.3 MB int8 index vs ~5.5 MB
for CLIP) and slower embedding — are immaterial client-side (one query embed;
index lazy-loaded only on `/identify`).

CLIP and DINOv2 are retired for this use case.

## Consequences

- Reference index ships 768-d int8 vectors (~8.3 MB), lazy-loaded on `/identify`.
- The client bundles the SigLIP ONNX weights (cached after first use).
- **Not yet a full greenlight.** 66% recall@5 is on n=123 *synthetic* photos.
  Recall will drop at the full 10,822 index, and the one *real* photo tested
  missed for every model. Embeddings alone give a rough shortlist, not an ID —
  matching the spec's framing.

## Next stage (gates the full build)

1. **Structural re-rank** — ✅ passed on **synthetic** photo-sim, ❌ failed on
   real photos (see reality check below). SigLIP top-20 shortlist
   re-scored by a palette descriptor (6 dominant colours in CIE-Lab, weighted
   min-cost ΔE matching), blend = `(1−w)·cosine − w·paletteΔE`. On the same
   photo-sim eval (n=123):

   | palette weight | recall@1 | recall@5 | MRR |
   |---|---|---|---|
   | 0.00 (SigLIP only) | 39.8% | 65.9% | 0.511 |
   | **0.30** | **69.1%** | **83.7%** | **0.751** |
   | 0.60 | 64.2% | 83.7% | 0.728 |

   Palette is geometry-robust (survives tilt/crop/reframe) — it recovers exactly
   what SigLIP drops under photo distortion. **recall@5 66% → 84%**, clearing the
   ~80% target. Stripe-profile correlation was **not needed** and is dropped
   unless real-photo results later demand it. **Pick w ≈ 0.30.**
2. **Scale check** — fetch ~400+ more renders, confirm recall holds as the index
   grows (123 is small; density hurts recall).

## Real-photo reality check (2026-07-17) — the synthetic result did NOT hold

Harvested Wikimedia Commons for real photos of known tartans. Auto-search is
junk-heavy (vector swatches, paintings, portraits, name-collisions, wrong
colourway variants); only 4 genuine fabric photos survived manual visual
verification. Run through the full pipeline (pool=136):

| real photo | condition | SigLIP rank | re-rank |
|---|---|---|---|
| Royal Stewart, cloth close-up | flat, front-on | **1** | 3 |
| Royal Stewart, jacket lining | angle + fold + label | **60**/136 | >20 |
| Graham, woven cloth | even light | 134/136 | >20 |
| Cameron, plaque strip | dim, partial | 32 | >20 |

- Only the flattest, near-swatch cloth reached top-5. A Royal Stewart jacket that
  is *unambiguously* ref 3958 — merely angled with a fold — ranked **60th**.
  Photo-sim predicted 84% recall@5; real photos delivered ~1 of 4.
- **The palette re-rank HURT on real photos** (Stewart cloth 1→3). It was tuned
  on synthetic distortions; real colour casts break the palette signal. The
  w≈0.30 blend is synthetic-overfit and must be retuned on real data.
- Synthetic photo-sim models colour/tilt/blur but not weave texture, real optics,
  or fabric drape — it is an over-optimistic proxy, not a substitute.

Caveats: n=4, rough manual crops, Graham/Cameron identity uncertain (possibly
variants → not clean misses). But the one clean hard case failing at rank 60 is
sufficient signal.

## Go / no-go — revised

**Lean no-go for a build right now.** SigLIP-B16 stays the locked embedding, but
the shortlist is not usable on real-world photos yet. Before reconsidering:
1. Build a **real labeled eval set** (~20–30 hand-collected/verified photos of
   known refs) — the genuine metric. Commons auto-harvest is insufficient.
2. **Auto fabric-region crop** (real photos include garment/background/angle that
   wreck the embedding) — likely the highest-leverage fix.
3. **Retune or replace the re-rank** on real data; palette-only is not robust.
4. Consider a stronger/fine-tuned encoder or the optional backend LLM re-rank
   (breaks pure-static; separate ADR) if 1–3 stall.

Only after real-photo recall@5 clears ~80% on the real set should the offline
pipeline + client `/identify` be built.

Real labeled photos remain the true prerequisite before shipping and are not yet
collected; photo-sim is a proxy, not a substitute.
