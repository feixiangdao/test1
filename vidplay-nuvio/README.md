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
