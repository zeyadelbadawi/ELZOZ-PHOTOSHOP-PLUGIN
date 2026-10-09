# Photoshop compatibility

**Nothing below is "supported" until it passes the checklist in `docs/PLAN.md` §7 on that version.**
Sources: Adobe's Photoshop UXP reference (min-version tables and changelog, `github.com/AdobeDocs/uxp-photoshop`), checked 2026-10-09.

## Photoshop ↔ UXP versions (from Adobe's changelog)

| Photoshop | UXP | Notes |
|---|---|---|
| 22.0–22.5 | 4.x–5.x | DOM v1; Manifest v4 only |
| 23.0 | 5.x | `Document.duplicate`, `suspendHistory`, layer `translate/scale/rotate` |
| 23.3 | 6.0 | **Manifest v5** (new permission model) |
| 24.0 / 24.1 | 6.4 / 6.5 | `crypto.getRandomValues` (UXP 6.2+) |
| 24.2 | (6.x) | `Layer.textItem` (DOM text), Imaging API (beta) |
| 24.4 / 24.5 | 7.0 / 7.1 | Spectrum Web Components (not used by Elzoz) |
| 25.0–25.10 | 7.2–7.4 | `executeAsModal` `timeOut` option (25.10) |
| 26.0–26.9 | 8.0–8.4 | Reported WebAssembly crash in 26.0 (not used by Elzoz) |
| 26.10–27.4 | 9.0–9.2 | Latest documented |

## Feature matrix

| Feature | API used | Needs | 23.3–24.1 | 24.2+ | Status |
|---|---|---|---|---|---|
| Load plugin | Manifest v5, `entrypoints.setup` | 23.3 | ✓ | ✓ | Unverified |
| Read layer tree | `Document.layers`, `Layer.kind/id/name/bounds` | 22.5/23.0 | ✓ | ✓ | Unverified |
| Non-destructive working copy | `duplicate`, `suspendHistory`, `activeHistoryState`, `closeWithoutSaving` | 23.0 | ✓ | ✓ | Unverified |
| Text replacement | DOM `textItem.contents` (24.2+) / batchPlay `set textLayer textKey` | — | fallback | DOM | Unverified; fallback is the higher risk |
| Smart Object image | batchPlay `select` + `placedLayerReplaceContents` (session token) | 22.x | ✓? | ✓? | Unverified: most uncertain API |
| Pixel-layer image | batchPlay `placeEvent` + fit | 22.x | ✓? | ✓? | Unverified |
| Fit / fill | `Layer.scale`, `translate`, `boundsNoEffects` | 23.0 | ✓ | ✓ | Unverified |
| Export JPG/PNG/PSD | `Document.saveAs.*(entry, opts, true)` | 22.5 | ✓ | ✓ | Unverified |
| Video frames | `opacity`, `translate`, `scale`, `saveAs.jpg` | 23.0 | ✓ | ✓ | Unverified |
| Video resize to format | `Document.resizeImage` | 23.0 | ✓ | ✓ | Unverified |
| MOV writing + validation | `File.write(append)`, `File.read` | UXP | ✓ | ✓ | Muxer verified with ffmpeg; UXP I/O unverified |
| Sign-in token storage | `secureStorage` | UXP | ✓ | ✓ | Unverified |
| Secure idempotency keys | `crypto.randomUUID/getRandomValues` | UXP 6.2 | 24.0+ | ✓ | Unverified; sign-in blocked without it |
| RTL layout | `dir="rtl"` | — | ? | ? | `direction` is not in UXP's documented CSS |

✓? = the API exists, but behavior varies. Community reports show `-25920` unless the layer is selected first, which Elzoz does.

## Recommendation

- **Manifest minimum: 23.3** (oldest version that loads Manifest v5).
- **Practical minimum for paid use: 24.0** (secure random numbers needed for billing idempotency).
- **Recommended: 24.2+** (documented DOM text API).
- **Test matrix:** 23.5 (oldest, text fallback), 24.7, 25.12, latest 26.x, latest 27.x. Record each result in this file.

## How version differences are handled

`src/ps/compat.js` detects capabilities once (`app.version`, `uxp.versions`, and runtime probes such as `photoshop.imaging`, `crypto.getRandomValues`). Adapters branch on capabilities only where behavior differs (text). The UI shows the requirement next to anything unavailable (Template step notices). There are no per-version copies of the engine.

## Results log

| Photoshop | OS | Date | Tester | Checklist result |
|---|---|---|---|---|
| — | — | — | — | Not yet tested |
