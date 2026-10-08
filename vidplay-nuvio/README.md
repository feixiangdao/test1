# CURRENT: VidPlay V1 v0.1.8 — works without either binary fetch API (2026-10-08)

**Phone evidence:** v0.1.7 returned \`播放器阶段[WASM 解密媒体地址]: WASM: native bridge has no binary bodyBase64\`; the earlier v0.1.6 returned \`fetch.arrayBuffer unavailable\`. Thus the installed official Nuvio runtime does not expose either method to this local provider. No APK change or new server is allowed.

**Fix:** The V1 Provider first attempts legitimate WASM binary reading as previously. When \`arrayBuffer()\` is missing and \`__native_fetch\` does not expose \`bodyBase64\`, it uses a small, validated public-WASM-derived **ChaCha key candidate** embedded in the Provider to decode the stream URLs returned by the *normal upstream server-signed media API*. It **does not** bypass or manufacture a one-time API token, reuse a browser cookie, change the manifest URL, or add V2/V3. Only actual URL candidates that subsequently pass the existing HLS manifest checks are returned. If upstream rotates the decoding key, wrong-key plaintext is discarded and the plugin returns the clearly marked nonplayable Status diagnostic rather than fabricated media.

**Evidence:**
- [Four WASM samples and cross-decryption](https://github.com/feixiangdao/test1/actions/runs/37795748928): both movies have identical current WASM and produce the same recovered key across four separately signed encrypted responses. WASM binary was observed to change between earlier runs, so cached key lifetime is **not guaranteed**.
- [Real Nuvio no-binary phone simulation](https://github.com/feixiangdao/test1/actions/runs/37796285766): deliberately disables \`fetch.arrayBuffer\` and makes \`__native_fetch\` return empty \`bodyBase64\` for actual remote WASM data. V1 returns **3 HLS rows for Kung Fu Panda (2008): 272p, 544p, 816p**, and **3 for Life (2017): 266p, 534p, 800p**. Both execute the new fallback, obtain current signed API data, and verify the HLS master response. Native Android playback still requires user confirmation.
- [Mocked regression tests](https://github.com/feixiangdao/test1/actions/runs/37796313389): pass valid-metadata/signed-media checks; invalid offline parameters produce a diagnostic, not fake streams.

**Stable install URL:** \`https://raw.githubusercontent.com/feixiangdao/test1/main/vidplay-nuvio/manifest.json\` remains unchanged; \`scraper.id = vidplay-direct-lab\`, manifest version **0.1.8**. Refresh the existing Nuvio plugin; do **not** add a different URL. Test *Kung Fu Panda* first, then attempt >30 seconds continuous playback. If only Status appears, capture the new diagnostic; the external decoding key may have rotated or another device-specific networking limit may remain.

---

# CURRENT: VidPlay V1 v0.1.7 — Legacy Nuvio WASM binary compatibility (2026-10-08)

**Device screenshot after v0.1.6:** V1 status was \`播放器阶段[WASM 解密媒体地址]: WASM: Nuvio fetch.arrayBuffer unavailable\`. This confirms the browser-linked public player and authorized media API were reached on the user's phone; the runtime lacked a binary response method.

**Fix in the Provider only (no APK modification, no proxy):** On a WASM binary response where \`response.arrayBuffer\` is absent, call Nuvio's existing asynchronous native \`__native_fetch(url,"GET",headersJson,"none","",true)\` bridge. The official NuvioMobile [FetchBridge.kt](https://github.com/NuvioMedia/NuvioMobile/blob/main/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/network/FetchBridge.kt) sends a JSON response with \`bodyBase64\` containing the original raw response bytes. Decode using our existing pure-JavaScript Base64 routine; validate WebAssembly magic bytes before passing the result to the existing ChaCha stream URL decoder. The fallback is enabled only for the expected \`data.vidsrc.sh\` or \`data.vidsrcme.ru\` WASM hosts; ordinary \`fetch.arrayBuffer()\` remains preferred when available. Inline WASM base64 (if upstream supplies it) is also accepted. Do not use \`response.text()\` for WASM; UTF-8 conversion corrupts bytes. If neither binary method exists in the actual installed Nuvio version, leave a specific nonplayable Status diagnostic.

**Live regression with deliberately missing \`response.arrayBuffer()\`:** https://github.com/feixiangdao/test1/actions/runs/37794512921 — native \`bodyBase64\` fallback successfully retrieved and decoded a genuine ~7.5KB WASM; *Life (2017)* → **266p, 534p, 800p** HLS; *Kung Fu Panda (2008)* → **272p, 544p, 816p** HLS. Both passed genuine remote authorization, WASM decryption and HLS playlist validation. Separate unit regression: https://github.com/feixiangdao/test1/actions/runs/37794398048.

**Install URL:** unchanged \`https://raw.githubusercontent.com/feixiangdao/test1/main/vidplay-nuvio/manifest.json\`. V1 only, scraper ID \`vidplay-direct-lab\`, now **v0.1.7**. No V2/V3.

**Android playback not yet verified.** The installed Nuvio build must itself expose the same native bridge. After refreshing v0.1.7, retest the film in the screenshot *Kung Fu Panda* and inspect whether three actual playable quality rows appear, or whether the Status message now names a missing bridge/CDN/network issue. Native player decoding/long-running CDN access remain to be checked on-device.

---

# CURRENT UPDATE: VidPlay V1 v0.1.6 Android "not a function" compatibility (2026-10-08)

**User-reported Android issue:** After v0.1.5, V1 pill persisted but emitted `播放器：not a function` instead of playable stream rows on *Kung Fu Panda (2008)*. This is an Android JavaScript runtime error inside V1's YTHD chain, NOT evidence that the film lacks a source.

**Fix/diagnostics:**
- Maintain exact original install URL and scraper ID. v0.1.6 includes Android-friendly binary response and `Uint8Array` error checks; rewrites WASM parser to avoid dependence on `Uint8Array.prototype.slice` (older QuickJS versions may not expose every typed-array method).
- Introduces stage-specific exception markers, including `YTHD 页面`, `播放器入口配置`, `内层播放器页面`, `签名媒体 API`, `WASM 解密媒体地址`, and `CDN HLS 解析`. `response.arrayBuffer()` is explicitly checked before reading WASM; failures now surface exact stage and function rather than a generic `not a function`.
- **Root cause NOT YET conclusively identified**. Official NuvioMobile's latest JS fetch polyfill supports `arrayBuffer()`, so installed builds may differ or another function may be absent; await a real on-device retest.
- The clearly labelled **nonplayable** Status capsule fallback is retained. Only actual verified HLS media rows are presented as playable.
- **Exact film live verification after changes:** *Kung Fu Panda (2008)* TMDB 9502 returned **272p/544p/816p HLS**, all raw V1 service requests and master HLS responded HTTP 200, 3.1s. *Life (2017)* returned **266p/534p/800p HLS**, ~2.3s. No V2 or V3. GitHub real smoke: https://github.com/feixiangdao/test1/actions/runs/37790983288 ; mocked regression including a fetch response lacking binary `arrayBuffer`: https://github.com/feixiangdao/test1/actions/runs/37790678223 .
- Phone playback still awaiting user confirmation. Refresh v0.1.6 through the old manifest `https://raw.githubusercontent.com/feixiangdao/test1/main/vidplay-nuvio/manifest.json` and test *Kung Fu Panda* again. If Status persists, capture its precise new Chinese `播放器阶段[...]` diagnostic so the missing QuickJS method can be fixed without trial-and-error.

---

# CURRENT: VidPlay V1 Local v0.1.5 — real signed HLS verified (2026-10-08)

**Scope:** Stock/official Nuvio Android app + this local JavaScript Provider only; no app modification, custom server, proxy or extra installer URL. The original manifest remains:
\`https://raw.githubusercontent.com/feixiangdao/test1/main/vidplay-nuvio/manifest.json\` with unchanged scraper ID \`vidplay-direct-lab\`. V2 and V3 remain disabled.

**What changed vs v0.1.4:** The nested first-party player advertises \`turnstile: true\` **but also exposes a fresh, server-signed single-use \`apiToken\`** in its session-specific configuration. The server **accepted this token over ordinary HTTP**, returning HTTP 200 with encrypted \`stream_urls\`; the old Provider prematurely aborted without trying the server-issued signed token merely because the front-end Turnstile flag was set. V1 now checks the valid server-issued token through the normal supported API and still fails closed if the API rejects authorization. No user Opera cookies, human CAPTCHA tokens or Cloudflare challenge bypass are used.

The existing VidSrc WASM/ChaCha20 decoder processed the **actual live encrypted stream data**, then issued one CDN token request. The verified master playlist and three variant playlists returned HLS HTTP 200. The first TS segment was also HTTP 200 and began with byte \`0x47\` (MPEG transport stream sync), despite its non-media-looking \`.html\` filename and response MIME. Actual server-advertised variant heights for the tested Life (2017) film were **266p, 534p, and 800p**; no unverified 1080p claim.

**Fix for 429 rate limiting:** The provider now tries CDN stream URLs **sequentially** and stops after the first confirmed live master playlist. The previously concurrent token requests caused HTTP 429 and 401 for secondary candidates. Device time budget raised from 7 to 15 seconds, still below Nuvio's upstream 60-second plugin runtime timeout. The explicit non-playable Status row remains a fallback only when a genuinely validated stream cannot be retrieved.

**Verification evidence:**
- [Authorized public signed-token API for TMDB and IMDb IDs](https://github.com/feixiangdao/test1/actions/runs/37788542982): both HTTP 200 with encrypted stream URLs.
- [Real HLS master + three variant playlists HTTP 200](https://github.com/feixiangdao/test1/actions/runs/37788893041).
- [Actual first video transport-stream segment HTTP 200 / MPEG-TS sync](https://github.com/feixiangdao/test1/actions/runs/37789067226).
- [Published Provider itself: real V1 extraction, 3 HLS, ~2.7 seconds, no V2/V3](https://github.com/feixiangdao/test1/actions/runs/37789563230).
- [Regression tests for signed token despite Turnstile flag and sequential CDN auth](https://github.com/feixiangdao/test1/actions/runs/37789593501).

**Important:** Android Nuvio's native player playback has **NOT YET BEEN CONFIRMED**. A real HLS manifest and segment accessible on a CI IP does not guarantee the phone's VPN/proxy, ExoPlayer, DRM/codec compatibility or CDN IP-bound token will also succeed. User should refresh the existing manifest version **0.1.5**, test the Life (2017) movie V1 variants, and report whether playback starts and continues for >30 sec, or give the specific error/loading state. A user-visible Status diagnostic instead of real quality choices would indicate a remaining device-specific network or token failure.

---


## 2026-10-08 — NuvioMobile upstream source compatibility audit (V1 only)

The Android Nuvio app's current open-source runtime confirms **the direct V1 blocker cannot be fixed solely in a local JavaScript scraper**:

- [PluginRuntimeResult](https://github.com/NuvioMedia/NuvioMobile/blob/main/composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginModels.kt) specifies required \`url: String\`; no \`externalUrl\` or \`openWebView\` member is present on the plugin result model.
- [StreamFetchSupport](https://github.com/NuvioMedia/NuvioMobile/blob/main/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamFetchSupport.kt) maps plugin result \`url\` directly into \`StreamItem.url\`, **not** \`StreamItem.externalUrl\`. It cannot bridge an HTML player iframe to native playback.
- [StreamModels](https://github.com/NuvioMedia/NuvioMobile/blob/main/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamModels.kt) supports \`externalUrl\` on **general addon streams**, and [StreamDestination](https://github.com/NuvioMedia/NuvioMobile/blob/main/composeApp/src/commonMain/kotlin/com/nuvio/app/StreamDestination.kt) can open those externally; **neither feature is exposed for local plugin results**.
- [FetchBridge](https://github.com/NuvioMedia/NuvioMobile/blob/main/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/network/FetchBridge.kt) uses native HTTP requests rather than a JavaScript-capable WebView. The upstream [WebView resolver feature request #1158](https://github.com/NuvioMedia/NuvioMobile/issues/1158) remains a request, not a supported plugin API.
- V1's actual inner player responds with required browser verification and may require server-signed single-use stream API tokens. External API requests to retrieve \`&stream_urls\` without an authorized token receive **403 invalid api token** even when metadata-only requests are HTTP 200. See [real network test](https://github.com/feixiangdao/test1/actions/runs/37786459463).

**Practical consequence:** V1 works in Opera because Opera executes and satisfies browser-side playback checks. There is presently no documented local-plugin WebView API and no confirmed unrestricted raw media URL for Nuvio. Returning the YTHD iframe as \`type: "hls"\` will not work, nor will a plugin-only \`externalUrl\` field that is never mapped to \`StreamItem.externalUrl\`.

**Status:** Keep the existing stable \`v0.1.4\` manifest URL and the truthful nonplayable diagnostic. Do not claim a stream is working, clone another provider's unrelated source under the name “VidPlay V1”, or bump versions until a real Nuvio-playable V1 media URL is validated. Future feasible work requires an officially supported embedded-browser resolver/native-app change, or an alternative authorized media API that can produce a directly usable HLS/MP4 URL without browser session exchange.


# VidPlay V1 Local Lab — v0.1.4 fix (2026-10-08)

**Symptom:** On Android Nuvio the VidPlay Provider capsule disappeared after searching. Live v0.1.3 returned `[]` whenever the nested YTHD player required browser verification (or the VidPlay AJAX returned HTTP 403). The client can hide a provider with no results. Actual on-device UI behavior still requires user confirmation.

**Fix:** Keep the **same manifest/install URL** and scraper ID, now version **0.1.4**. `getStreams()` returns verified playable HLS/MP4/DASH rows if any; otherwise it returns exactly **one clearly labeled NON-PLAYABLE diagnostic Status row** with a tiny empty data HLS playlist, following our successful YesMovies/NOVIPNOAD diagnostic pattern. It must not be described as real movie playback; clicking this Status item will not play a video. A 7-second overall search budget prevents indefinite wait. No V2/V3 routes.

**Mocked regression run:** https://github.com/feixiangdao/test1/actions/runs/37786375781 ; covers positive verified HLS 360p/720p/1080p, authorization/challenge failures, no token, network failure, safe URLs, no-key metadata, and V1-only fallback.

**Real external-network smoke:** https://github.com/feixiangdao/test1/actions/runs/37786459463. Real `Life (2017)` queries completed in ~2 seconds on CI; returned 0 playable media, 1 explicit nonplayable diagnostic (`V1 requires browser verification; AJAX HTTP 403`), called no V2/V3 endpoints.

**Next step:** On Android refresh the **existing** URL `https://raw.githubusercontent.com/feixiangdao/test1/main/vidplay-nuvio/manifest.json`, check manifest v0.1.4; search Life (2017) or another movie and see if the VidPlay · V1 pill persists with a visible Status diagnostic. This is a **visibility repair, not a V1 playback breakthrough**. Upstream video authorization must be solved separately.

---

# VidPlay V1 Lab — CURRENT STATUS (2026-10-08, v0.1.3)

**Install/refresh the existing URL**: `https://raw.githubusercontent.com/feixiangdao/test1/main/vidplay-nuvio/manifest.json`. There is no new address and the stable scraper ID remains `vidplay-direct-lab`.

**Only V1 is queried**. Movie flow: public keyless metadata `https://data.vidsrc.sh/api.php?type=movie&tmdb=<TMDB_ID>` → valid IMDb ID → `https://ythd.org/embed/<IMDb_ID>` → `ythd.org/vs_src.php?type=movie&id=<IMDb_ID>` → nested player URL from signed JSON → parse player configuration and **legitimately available, server-issued one-use API token** → if permitted, obtain stream data, decrypt the provider-supplied media URL list as required, verify media playlist, and return real Nuvio stream objects. If not permitted by the upstream browser verification / missing token, return zero, *never a fake playable iframe*. Old first-party **V1 only** AJAX is a fail-closed fallback; V2 and V3 are disabled entirely. TV V1 currently only uses the AJAX fallback and **is not confirmed playable**.

**TMDB key is no longer required** for typical movie V1 lookup. The optional key in settings is retained strictly as fallback if the public metadata lookup fails. No API keys are committed to this provider.

**Verified simulated tests:** https://github.com/feixiangdao/test1/actions/runs/37785313475 — covers 360p/720p/1080p HLS master parsing, signed API-token flow, challenge rejection, missing/invalid token, V1 AJAX fallback, keyless TMDB-to-IMDb metadata mapping, and invalid/private URL rejection. Test fixtures are not proof of live playback.

**Verified live test:** https://github.com/feixiangdao/test1/actions/runs/37785368909 — actual cloud requests succeeded: keyless `data.vidsrc.sh` 200, YTHD embed 200, YTHD `vs_src.php` 200, both `stellarconductornexus.com` player layers 200. Inner player declared **browser verification required**; the direct fallback VidPlay AJAX returned HTTP 403, so **zero real HLS streams** on GitHub CI. Android Nuvio playback remains unverified. No claim that V1 plays on-device yet.

Next gate: determine whether Nuvio device networking receives authorized, signed direct media responses in its runtime. Browser-only verified playback cannot automatically be translated to Nuvio without a separate compatible public media response. Do not copy or reuse short-lived browser verification tokens.

---

# VidPlay Local Lab (Nuvio)

**Status: experimental, playback NOT verified.** This is a standalone Nuvio provider and does not modify any other providers.

## Confirmed mapping

| Type | V1 | V2 | V3 |
| --- | --- | --- | --- |
| Movie | `/ajax/mov_vplay.php?embed=<IMDb>` | `/ajax/mov_vplay2.php?embed=<IMDb>` | `/ajax/mov_vplay3.php?embed=<TMDB movie ID>` |
| TV | `/ajax/tv_vplay.php?embed=<TMDB TV ID>&season=S&episode=E` | `/ajax/tv_vplay2.php?embed=<TMDB TV ID>&season=S&episode=E` | `/ajax/tv_vplay3.php?embed=<TMDB TV ID>&season=S&episode=E` |

Observed on Life (2017), movie TMDB 395992 / IMDb tt5442430, and Abbott Elementary S1E1, TV TMDB 125935. TV site path convention: `/watchseries/<slug>-online-free/season/<season>/episode/<episode>`.

## What this prototype does

- Uses Nuvio's TMDB ID to construct movie V3 and all TV V1/V2/V3 requests.
- Optional TMDB API key resolves movie IMDb IDs, to construct movie V1/V2.
- Uses same-origin AJAX request headers and parses direct HLS/MP4/DASH URLs in responses.
- Follows up to two public iframe hops to detect ordinary non-obfuscated direct media URLs.
- On HTTP 403, Cloudflare challenge pages, malformed or HTML-only results, returns **zero** streams, not synthetic placeholders.
- Keeps all VidPlay routes separate from CineVibe / YFlix / YesMovies.

## Blocking issue (as tested 2026-10-08)

A headless Chromium browser opened detail and episode pages successfully (HTTP 200), but **all six** tested movie and TV AJAX routes received HTTP 403 with Cloudflare challenge HTML. A separate browser extraction service returned only `...` for movie AJAX responses. **No actual playback stream URL has been confirmed.**

The working mock tests demonstrate parser behavior only; they are not live end-to-end playback verification. No bypass of Cloudflare is included.

## Files

- `manifest.json`: Nuvio install manifest, version 0.1.2
- `providers/vidplay.js`: experimental parser/provider
- `test-provider.cjs`: mock-backed deterministic tests
- `probe-browser.cjs`, `probe-tv.cjs`, `probe-episode.cjs`, `inspect-ajax.cjs`, `inspect-scripts.cjs`: browser research tools

## Release gate

Do **not** describe the provider as working until at least one legally accessible, real playable media URL has been returned by the VidPlay AJAX endpoint and tested in Nuvio, followed by a movie and a TV episode regression test. Be careful with expiring CDN signatures, player-specific headers, and title/episode mismatch.

## Reference CI runs

- Browser movie AJAX HTTP 403: https://github.com/feixiangdao/test1/actions/runs/37760861548
- Request header and Cloudflare detail: https://github.com/feixiangdao/test1/actions/runs/37761311539
- Episode route and TV AJAX structure: https://github.com/feixiangdao/test1/actions/runs/37762337434
- Mock provider tests: https://github.com/feixiangdao/test1/actions/runs/37762621857

## 2026-10-08 follow-up

- v0.1.1 restricts media extraction to explicitly labeled video fields or video source tags, rejecting arbitrary URL strings in unrelated HTML/JS, and excludes private/internal IP literals.
- Shared `globalThis.TMDB_API_KEY` is accepted for optional movie IMDb resolution where exposed by the Nuvio runtime.
- Mock-backed regression tests passed, including unrelated ad URL filtering and shared TMDB API key lookup: https://github.com/feixiangdao/test1/actions/runs/37767657449
- A **real live smoke test** of the newly hardened provider on GitHub Actions returned **HTTP 403** for movie V3 and TV V1/V2/V3, yielding zero streams as designed. The tests did not establish playback: https://github.com/feixiangdao/test1/actions/runs/37767776290
- Actual playback remains unverified; do not label this as working or suggest using a fake media placeholder.

## 2026-10-08 v0.1.2 research and changes

**Newly verified first-party search route:** `GET https://vidplay.top/index.php?menu=search&query=TITLE` with GET form fields `menu=search` and `query`. Unlike the generic `/search?q=...`, this returns search result cards containing title, year, and canonical movie/TV page URLs. Examples: Life (2017) maps to `/movie/51381-watch-life-2017-online`; Interstellar (2014) maps to `/movie/51737-watch-interstellar-2014-online`.

With an optional TMDB API key, the experimental Nuvio provider now fetches film/show metadata and looks for an **unambiguous exact title+year+type** match on this first-party site search. It uses the real detail page URL as the `Referer` header when requesting movie/episode AJAX. For TV it adds `/season/<S>/episode/<E>`. Ambiguous/unavailable searches fall back without making up a page URL. Shared `globalThis.TMDB_API_KEY` remains supported where Nuvio exposes it. No API key is stored in source code.

**Tests passed:** https://github.com/feixiangdao/test1/actions/runs/37772936313. Covers Life (1999 vs 2017) exact matching, film and TV Referer mapping, and fail-closed responses.

**Live comparison** https://github.com/feixiangdao/test1/actions/runs/37773058341: GitHub Cloudflare enforcement returned HTTP 403 both for the first-party search and the AJAX with the correct actual movie/episode `Referer`. This means the corrected context alone does NOT make GitHub cloud-hosted requests work; on-device Nuvio playback is also not verified.

**Safety note:** A public AdGuard issue from June 2025 reported malicious advertising tabs on VidPlay V2: https://github.com/AdguardTeam/AdguardFilters/issues/206770. Do not install unknown VidPlay browser extensions or treat advertising popups as media. The lab never renders web pages as Nuvio playback or returns imaginary MP4/HLS sources.

## 2026-10-08 Opera-assisted visual playback research

- Opera Browser Connector can now list tabs, read the VidPlay Life (2017) accessibility page, and return a page screenshot. The visual screenshot shows the poster hero overlay (blue play circle) and three server selectors.
- Using isolated GitHub Actions Playwright we inspected the exact DOM under the central button: `<div class="video-play-button">` inside `<span class="ajaxlink_vplay">`. Clicking the central play circle triggers the **same V1 jQuery request** as clicking the V1 tab: `/ajax/mov_vplay.php?embed=tt5442430`. It produced HTTP 403 Cloudflare on GitHub's runner. Therefore, clicking this overlay does not reveal a *different* backend API.
- Proof: https://github.com/feixiangdao/test1/actions/runs/37775709582
- The Opera connector supports tab reading, navigation and screenshots, but exposes no click/DevTools/network-capture action. To investigate media only visible after human interaction in residential Opera, the site must be clicked in Opera before the connector captures subsequent state, or an expressly connected browser interaction capability must be used.
- No video URL was identified, no provider streams added, no playback claim. Retain v0.1.2 pending live playable media evidence.

## 2026-10-08: Real V1 iframe and new downstream player architecture

Confirmed from a **working playback session in Opera**: the Life (2017) VidPlay V1 iframe URL is **`https://ythd.org/embed/tt5442430`** (IMDb ID). Opera actually showed playback progress and the player's Auto/360p/720p/1080p controls; this only proves those controls are offered in the working iframe, not that a raw stream is accessible to Nuvio or that every quality is available.

Isolated Chromium / GitHub Actions inspection then confirmed this *current* network chain:

1. `GET https://ythd.org/embed/tt5442430` → **200**.
2. YTHD page embeds an iframe with `data-api="/vs_src.php?type=movie&id=tt5442430"`.
3. `GET https://ythd.org/vs_src.php?type=movie&id=tt5442430` → JSON `{src: ...}`; returned player location `https://stellarconductornexus.com/embed/movie/tt5442430`, **200 in browser**.
4. That landing page embeds `https://stellarconductornexus.com/embed/player/movie/tt5442430`, **200 in browser**.
5. The nested player loads `/embed/iframe_player/assets/player.js` and `vsdec.js`, with **`CONFIG.api` pointing to the `data.vidsrcme.ru` source backend**. The response's `stream_urls` may be encrypted and decrypted by the WebAssembly code exposed through `vsdec.js`.
6. `player.js` documents a **single-use `CONFIG.apiToken`** for fetching stream URLs; the player can also require Cloudflare Turnstile verification before playback. Raw direct requests from the GitHub runner to the nested page or the API return 403, whereas properly contextualized browser iframe requests can return 200.

**Do not assume** the older MediaFlow proxy documented `data-hash → cloudnestra.com/rcp → /prorcp` sequence is still accurate for current `ythd.org`. The observed host is now `stellarconductornexus.com`. The generic VidSrc backend is shared with the YesMovies S2 implementation, but the public cloud-runner reuse test still returned **403** for the underlying API: https://github.com/feixiangdao/test1/actions/runs/37779174090 . YesMovies S1 provided separate candidate streams for the two probe titles; those are not claimed as VidPlay V1 media sources.

**Live evidence:**
- Live YTHD frame navigation and request hosts: https://github.com/feixiangdao/test1/actions/runs/37778057602
- YTHD `vs_src.php` browser responses, nested player HTML and external JS resources: https://github.com/feixiangdao/test1/actions/runs/37778257972
- Config extraction, live API JSON response and nested-player metadata: https://github.com/feixiangdao/test1/actions/runs/37778458266
- Player.js/ vsdec.js code: encrypted `stream_urls`, browser challenge and single-use stream-data API token: https://github.com/feixiangdao/test1/actions/runs/37778741571
- Original user-confirmed iframe location: `https://ythd.org/embed/tt5442430`.

**Remaining release gate:** A genuine, reachable (and appropriately authorized) HLS/MP4 URL with verified media response and playback in Nuvio. No embedded HTML/iframe URL should ever be falsely returned as `type: hls`, and no Chrome-only or challenge-protected source should be considered portable until independently validated.

No `manifest.json` or Provider version change made based only on these diagnostics. Version remains v0.1.2.

## 2026-10-08: Current VidPlay V1 data API contract and precise 403 diagnosis

The actual inner `stellarconductornexus.com/embed/movie/tt5442430` page currently provides a **metadata** API at `data.vidsrc.sh/api.php?type=movie&imdb=tt5442430`. This differs from the legacy YesMovies S2 endpoint at `data.vidsrcme.ru/api.php?type=movie&tmdb=395992&stream_urls`. The new API host was observed by reading the browser-rendered `window.CFG.metaApi` field, not inferred from old code.

Tests:
- Sanitized browser config inspection: https://github.com/feixiangdao/test1/actions/runs/37780495064
- Public metadata-only comparison (current and legacy hosts, **both HTTP 200**, response includes `title`, `imdb_id`, `file_name`, and `backdrop`, no `stream_urls`): https://github.com/feixiangdao/test1/actions/runs/37780855613
- Actual `&stream_urls` requests on the current and legacy hosts (IMDB / TMDB variants) **all HTTP 403 JSON `{"status_code":"403","error":"invalid api token"}`**. This is a **first-party application-level authorization error**, unlike the earlier Cloudflare HTML challenges returned by `vidplay.top/ajax/*`: https://github.com/feixiangdao/test1/actions/runs/37781095675
- The current `player.js` states `CONFIG.apiToken` is server-generated, **single-use**, and may be associated with an interactive Turnstile gate. No token reuse, Cloudflare circumvention, or decryption/access-control bypass is implemented.

**Consequences:** Changing domains, Referer, or IMDb/TMDB query alone does not grant a stream. The existing `YesMovies S2` parser alone cannot turn this into a portable VidPlay V1 HLS stream unless the upstream legitimately provides the short-lived authorization required for its stream-data API. Metadata success is not media success. Do not publish any `ythd.org/embed/*` HTML iframe as `type: hls`.

**Status:** user confirmed genuine browser playback for Life (2017) in Opera, but no standalone Nuvio HLS URL confirmed. Keep `vidplay-nuvio/manifest.json` version 0.1.2 unchanged pending authorized media-response and Android Nuvio playback verification.

## 2026-10-08: V2 / V3 status (movie and TV)

Automated Chromium clicked the V2 and V3 selectors independently for both `Life (2017)` and `Abbott Elementary S01E01`. Both detail pages returned HTTP 200, but each movie or television playback AJAX endpoint returned Cloudflare HTTP 403 HTML, hence there was no third-party iframe and no media in the GitHub runner. Neither V2 nor V3 can currently be identified with a specific external player host from these cloud-only tests.

- Movie V2: `/ajax/mov_vplay2.php?embed=tt5442430` HTTP 403
- Movie V3: `/ajax/mov_vplay3.php?embed=395992` HTTP 403
- TV V2: `/ajax/tv_vplay2.php?embed=125935&season=1&episode=1` HTTP 403
- TV V3: `/ajax/tv_vplay3.php?embed=125935&season=1&episode=1` HTTP 403

[Automated V2/V3 real click log](https://github.com/feixiangdao/test1/actions/runs/37782995403). This does not prove that V2/V3 are unplayable for a browser user; V1 was previously observed playing in user's residential Opera while GitHub Actions could not get the equivalent VidPlay AJAX response. The Opera connector permits reading tabs and screenshots but not scripted clicks or directly reading DOM iframe src attributes. Next useful data is each successful V2 and V3 iframe URL obtained from the actual browser session, ideally just domain and embed path, with query tokens redacted. Keep experimental v0.1.2, do not invent media streams.
