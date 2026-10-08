# Flixer Local Lab

**Experimental branch only. Not yet deployed.**
This is an independent Flixer-to-Nuvio integration prototype, not merged into any existing provider.

## Verified on 2026-10-08

- Movies: `/watch/movie/{tmdbId}`. Kung Fu Panda (`9502`) and Constantine (`561`) load their HLS master playlists in a real Chromium session.
- TV: `/watch/tv/{tmdbId}/{season}/{episode}`. Game of Thrones S1E1 (`1399/1/1`) resolves an HLS master playlist.
- The three HLS URL requests on each item consist of a master playlist and variants, **not** three independent server choices.
- Kung Fu Panda and Constantine contain 1920-wide video variants; Game of Thrones S1E1 has up to 1280x720.
- Flixer resolves sources with browser fingerprint headers, a WASM module and encrypted responses. Its API is not a plain JSON stream API.

## Architecture

`providers/flixer-local.js` is a Nuvio plugin adapter. Its `getStreams` calls a separate HTTPS browser-based resolver and returns HLS links. The adapter cannot work without a configured resolver endpoint. The manifest is **disabled by default**.

`resolver.mjs` is an isolated proof-of-concept Node HTTP server using Playwright Chromium. It exposes `/health`, `/resolve/movie/{id}`, and `/resolve/tv/{id}/{season}/{episode}`. It currently accepts one auto-selected Alpha HLS master playlist, not all server alternatives. It has a small cache and a limit of two concurrent runs. Set `RESOLVER_TOKEN` and add HTTPS/authentication before external deployment.

`probe.mjs` and `analyze.mjs` run in GitHub Actions; no local installations are required for the tests. The workflow verifies the browser and Nuvio adapter syntax, the local resolver HTTP response, and sampled playlist metadata.

## Outstanding

1. An always-accessible HTTPS resolver must be deployed; GitHub Actions is a temporary testing runner, not a public HTTP hosting service.
2. Vercel team write permissions for the connected account returned 403; **no deployment was attempted successfully**.
3. Verify Nuvio player playback, HLS headers, episode coverage, other servers and CDN URL expiry.
4. The third-party site or its APIs may change without notice.

This lab is deliberately separate from already-working Provider URLs. Do not install the experimental manifest as a finished Flixer provider.
