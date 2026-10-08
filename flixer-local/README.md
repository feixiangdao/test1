# Flixer Local — pure on-device Nuvio development

**Status: experimental; NOT a finished playable provider. The manifest remains disabled.**

This branch exists to ensure the final Flixer plugin is a **true Nuvio Local Provider**.
It has **no Vercel API, no Node/Playwright runtime dependency, no Cloudflare Worker and no remote resolver**.

## What currently works

- Nuvio-compatible synchronous module API: `module.exports = {getStreams, onSettings}`
- Promise-only requests that do not require Node.js or browser libraries.
- Direct TMDB-to-Flixer route matching:
  - Movie `https://flixer.su/watch/movie/{tmdbId}`
  - TV `https://flixer.su/watch/tv/{tmdbId}/{season}/{episode}`
- Safe direct HLS/MP4/DASH URL detection from HTML *when present*; no fabricated or placeholder playback URLs.
- Dedicated deterministic tests using mocked HTTP responses, and a disabled lab manifest.

## Why this is not yet playable

Flixer's site currently resolves most media sources by contacting a protected image-source endpoint, processing the result through `img_data_bg.wasm` and using browser-specific fingerprints. A normal Nuvio local JavaScript engine isn't a full browser, and the HTML itself does not expose a direct HLS link in the tested examples.

A successful browser-based extraction is **not** evidence that an ordinary Nuvio JS provider can perform the same operation.

## Current investigation

A separate research branch `flixer-provider-lab-20261008` verifies source behavior with Playwright. It is **not** part of the local provider. The audit measured a 132,377-byte WebAssembly binary, with imports involving navigator, canvas, localStorage, screen, and other browser objects. A headless browser attempt produced WASM key error E20.

The local-only branch will only be enabled when an on-device source resolver has been independently validated, without a server endpoint.

## Verification

`node flixer-local/local-tests.cjs`

Tests cover movie/TV routing, safe direct HLS parsing, malformed IDs and the crucial non-fabrication guarantee for encrypted pages.

## Deployment policy

Do not install this disabled manifest expecting playable Flixer streams. The published code is a tested scaffold, not a completed decryptor. No existing provider is modified.

## Local WASM conversion investigation (2026-10-08)

- Flixer browser WASM measured **132,377 bytes**, with WebAssembly imports for browser fingerprint inputs (`navigator`, Canvas, localStorage, window, screen, time, etc.).
- An automated Chromium initialization attempt failed with `E20` during key generation; other real-browser sessions had successfully resolved HLS. This suggests environment-sensitive logic but does not isolate the precise E20 cause.
- Binaryen `wasm2js` **version 108** was tested without flags and with `--all-features`. Both failed validation of some `i64.trunc_sat_f64_u` instructions; therefore a direct WASM-to-pure-JavaScript translation is **not demonstrated**. This does not establish that a newer Binaryen or a manual port is impossible.
- Until a decoder works inside Nuvio itself, the manifest must remain disabled and no claimed video playback success should be inferred from the direct-link unit tests.

## Update: standalone JS conversion and wasm-bindgen linkage

Research in branch `flixer-provider-lab-20261008` has since advanced beyond the Binaryen 108 limitation:

- **Binaryen 132** with selective feature flags and the nontrapping-fptoint/bulk-memory lowering passes successfully translated the 132,377-byte WASM into ~1,270,309 bytes of standalone JS.
- The translated code exposed low-level `get_img_key` and `process_img_data` and passed Node syntax checking.
- Combining it with the site's public wasm-bindgen JS glue yielded a **~1,290,267-byte module** that imports successfully **without a native WASM file**.
- Invoking `get_img_key` outside a real browser still failed with **E18** under a minimal DOM/screen/localStorage compatibility shim. A real headless browser has also intermittently returned **E20**.
- The lab now traces calls to the wasm-bindgen imports to determine which browser-context input remains required.

This is not an end-to-end decryption success, so this Local manifest stays disabled. No hosted resolver is incorporated.

## Pure-JS key generation milestone (2026-10-08)

- After translating the upstream WASM and linking it to the upstream wasm-bindgen glue, the standalone JavaScript module loads successfully in Node without invoking native WebAssembly.
- Additional on-device-style compatibility shims for `Window`, `document.body`, screen, and monotonic timing allow **`get_img_key()` to return a 64-character string** in a browser-free CI test.
- This does **not** prove that the real Flixer API accepts the key or that `process_img_data` can decode protected live responses. The web application performs additional source-request verification.
- Next prerequisite for a finished Local Provider: a verified, authorized media-response sample or stable public API contract, plus Hermes runtime playback tests.
- CI evidence: https://github.com/feixiangdao/test1/actions/runs/37772723652 .

**Keep manifest disabled** until actual media extraction is verified on Nuvio. Do not replace the currently working provider set.
