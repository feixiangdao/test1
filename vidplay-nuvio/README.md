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
