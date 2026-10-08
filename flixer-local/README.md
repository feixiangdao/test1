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

## Hermes parsing milestone (2026-10-08)

- The prototype wasm2js + wasm-bindgen bundle is about 1.29 MB and loads in browser-free Node.js.
- With compatible `Window`, body, screen, Canvas and monotonic time shims, `get_img_key()` produced a 64-character key in CI.
- A **1,290,595-byte, non-ESM ordinary JavaScript preview** derived from the bundle was successfully parsed by `hermes-parser` as a script; the run did not report syntax errors.
- CI: https://github.com/feixiangdao/test1/actions/runs/37773023096
- This is only a parser-level syntax test; it does **not** establish execution inside Nuvio Hermes, source decrypt success, or video playback. The generated preview is a research output, not a published working Provider.

The final target remains a one-file, locally executing Flixer Nuvio provider. No Playwright, Vercel, remote resolver, or background host may be required at playback time.

## 2026-10-08: real Hermes VM verification

- The Flixer WASM-to-JS research core compiled successfully with `hermes-compiler@250829098.0.19` to about **482,563 bytes of Hermes bytecode**, and ran in the legacy `hermes-engine-cli@0.12.0` test VM.
- A direct **Hermes execution** of the standalone `get_img_key()` returned a 64-character string (PASS). This is stronger evidence than the earlier Hermes parser-only check.
- In the same Hermes runtime, `process_img_data` was invoked with deliberately invalid synthetic input and returned an object to the caller. No actual Flixer ciphertext was successfully decoded in the test.
- A separate browser-to-local interop experiment could not capture a legitimate browser-origin ciphertext/key pair in that CI session; the test correctly FAILED instead of claiming sources were available.
- Test run links:
  - Runtime: https://github.com/feixiangdao/test1/actions/runs/37775121594
  - Decoder entry-point: https://github.com/feixiangdao/test1/actions/runs/37775372301
  - Interop no-sample: https://github.com/feixiangdao/test1/actions/runs/37774297982

All generated upstream-derived bundles remain ephemeral in the testing runner, **not committed or published**. The final Local Provider still requires an independently verified way to obtain and decode authorized media responses and Nuvio in-app execution. This manifest stays disabled.

## October 8: verified browser-to-pure-JS decryption and local HLS qualities

- A normal **headed Chromium** session loaded Flixer movie TMDB 9502 and returned encrypted server discovery data with HTTP 200. The browser request was sampled temporarily; no response bodies or secrets were published.
- A completely separate **Node JS-only module**, translated from Flixer's upstream WebAssembly for research, decoded that real response into **6 server entries** without loading native WebAssembly.
- After fixing response deduplication, the same method decrypted an **Alpha-specific encrypted response** and found **one actual HTTP media URL**. No media URL is included in the GitHub logs or committed files.
- CI evidence: https://github.com/feixiangdao/test1/actions/runs/37775562433 and https://github.com/feixiangdao/test1/actions/runs/37776204018
- An original local `hls.js` helper parses HLS master manifests and exposes resolution-labelled variants. Its independent unit tests passed: https://github.com/feixiangdao/test1/actions/runs/37776407842

**Outstanding for installable local plugin:** reproduce the browser's legitimate signed HTTP request path from Nuvio's Hermes environment; integrate a permitted, distributable local decryption implementation; verify media URL headers and HLS playback on-device. The generated research bundle has not been committed or distributed. The lab manifest stays disabled, and no existing provider has been changed.
