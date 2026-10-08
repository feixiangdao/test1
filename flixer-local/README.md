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
