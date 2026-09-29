# Stellar Local Provider Research Status

Last updated: 2026-09-29

This file is the durable research baseline for Stellar Local. It records why a provider is active, limited, deferred, or rejected so later work does not repeat the same probes.

## Active providers

| Provider | Status | Notes |
| --- | --- | --- |
| VidZee | active | Local direct media resolver. |
| VixSrc | active | Local signed HLS; useful when server egress is restricted. |
| MovieBox | active | Current signed DASH mobile protocol; MPD + init segment preflight. |
| VAPlayer | active | Movie/TV HLS; multiple mirrors; current live probes healthy. |
| VidRock | active, movie only | Movie HLS works; TV endpoint currently 404. |
| CastleTV | active | Valid HLS when upstream responds; live availability can fluctuate. |
| Cineby | active | Movie/TV local HLS with final playlist validation. |
| Movix | active | Movie/TV HLS; current live probes healthy. |
| Vidlink | limited | API can return streams, but media CDN is egress-sensitive. |
| ZXCStreams | active | Current 2026-09 API; HLS + DASH; dead Resshin route excluded. |
| OneTouchTV | limited | Strict title/year matching; catalog/season coverage incomplete. |
| 4KHDHub | limited | Strong movie 2160p/1080p direct-file supplement; TV coverage unstable. |
| UHDMovies | limited | LinkPilot/DriveSeed chain; verified real Google-hosted MKV for movie and TV. |
| DVDPlay | limited, TV only | Strict TV/season/episode matching; newer seasons work, old coverage incomplete. |
| PurStream | active | Clean direct HLS; current movie and TV probes healthy. |
| Mapple | limited | Protocol still works (request token → PoW → playback token → encrypted stream), but anti-bot/egress behavior is unstable. |
| NetMirror | limited | Device-local master + first-variant validation; region/network sensitive. |
| VegaMovies | limited | Strong direct-file candidate promoted after strict regression: Fight Club 4/4, Inception 4/4, GOT S1E1 4/7 and Squid Game S1E1 2/6 final links valid after media filtering; S3E1 currently 0. |

## Unregistered local candidate

### HDHub4U
Keep unregistered. Strict title/year/season matching and Range validation were tested, but coverage is too inconsistent:
- Fight Club: 0 in latest regression.
- Inception: some valid direct files.
- Game of Thrones S1/S8: 0.
- Squid Game: partial/unstable.

## Rejected or deferred

| Provider | Decision | Reason |
| --- | --- | --- |
| DooFlix | defer | API fetch failures in current environment. |
| Xprime | reject for now | Current enc-dec authentication endpoint returns 404. |
| Showbox | reject for now | Tested titles returned 0. |
| MyCima | reject for now | Tested titles returned 0 / long dead-end waits. |
| MovieBlast | defer | Catalog matching works but final media failed from current test egress. |
| YFlix | defer | Final stream-link stage failed. |
| CinemaCity | reject for now | No usable media found. |
| VideoEasy | reject for now | Backend 404/522 / Cloudflare failures. |
| AllMovieLand | reject for now | No usable search results. |
| HDGharTV | reject for now | API currently returns HTML where JSON is expected. |
| MoviesMod | reject for now | Current tests returned 0. |
| MoviesDrive | reject for now | Current tests returned 0. |
| Goated | reject for now | Backend hostname failed DNS resolution. |
| FibWatch | reject for now | fibwatch.top failed DNS resolution. |
| IDLix | reject for now | Endpoint returned HTML instead of expected JSON. |
| Coflix | reject for now | Endpoint returned HTML instead of expected JSON. |
| Moonflix | reject for now | Current Railway endpoints returned 404. |
| 1Shows | reject for now | Token endpoint returned 403. |
| NiakVIO VidFast | reject for now | Interstellar, Breaking Bad S1E1, Fight Club and GOT S1E1 all returned 0. |
| DesiFlix | defer | Current manifest.desitvhub.eu.org IMDb endpoints time out; TMDB fallback returns no streams for Fight Club and GOT S1E1. |
| DahmerMovies | defer | Direct movie/TV directory requests hit Cloudflare 403 challenge pages in repeated probes; no usable links from current egress. |
| PlayIMDb | skip duplicate | Uses the same streamdata.vaplayer.ru backend family already covered by VAPlayer. |
| Castle | skip duplicate | Substantial overlap with CastleTV. |
| Nakios | defer pending API migration | Current maintained source explicitly says the default api.nakios.store sources backend is dead/404 and exposes NUVIO_NAKIOS_API_URL for a future replacement API. Do not register until a new working API is published. |
| Peachify | defer | Backend aggregation overlaps existing sources and has shown provider churn. |
| HindMoviez | research only | Candidate exists but is not promoted. |
| VidSrc.me | reject for now | Current embed pages parsed 0 servers for Fight Club and GOT S1E1. |
| Xpass | reject for now | Current embed pages no longer expose the expected backups variable; Fight Club and GOT S1E1 both returned 0. |
| VidLove | reject for now | Fight Club and GOT S1E1 both returned 0 in current quick screen. |
| Einthusan | verified candidate, unregistered | Regional South Asian movie source. 3 Idiots returned Hindi 1080p/480p and Dangal returned Hindi/Tamil/Telugu variants; sampled 1080p links were HTTP 200 video/mp4. Keep unregistered pending further allowed integration work. |
| GramCinema | defer | Provider requires a user-supplied `cinemaTvToken` setting; without it getStreams returns 0. Not suitable as a zero-config source. |
| ZinkMovies | reject for now | Current quick screen returned 0 for Fight Club and GOT S1E1. |
| MoviesHunt | reject for now | Search returned candidates, but strict matcher rejected Fight Club and GOT S1E1; both returned 0. |
| Movies4U | reject for now | Current quick screen returned 0 for Fight Club and GOT S1E1. |

## Next candidates to reassess

### CineFreak
Current reassessment: do not promote.
- Fight Club, Inception, Game of Thrones S01E01 and Squid Game S01E01 all returned 0.
- TMDB lookup succeeded, but CineFreak search returned no results for all four titles.
- Keep deferred until the upstream catalog/search path changes.

### CTGMovies
Current reassessment: do not promote.
- Fight Club, Inception, Game of Thrones S01E01 and Squid Game S01E01 all returned 0.
- Current API calls to /movies, /tv and /anime fail in the test environment.
- The configured API base remains cockpit.103.109.92.178.nip.io; do not register until a reachable backend is confirmed.

## CI policy

Hard failures:
- JavaScript syntax
- manifest structure / duplicate IDs / missing registered provider files
- deterministic helper tests

Informational live probes:
- third-party source/API/CDN availability
- final media availability from GitHub datacenter egress

A temporary upstream or CDN outage should not make structural CI red. Device-local validation remains authoritative for network-sensitive providers.

## Design rules for promotion

A new provider should normally satisfy all of these before registration:
1. Exact or defensible TMDB/title/year/type matching; no first-result fallback.
2. Movie and/or TV scope declared accurately.
3. Returns direct native media, not an iframe or external player page.
4. Rejects HTML/interstitial/ad pages.
5. Final HLS should contain #EXTM3U; DASH should contain a valid MPD; direct files should look like media via status/content type/range where practical.
6. Network-sensitive sources are marked limited rather than presented as universally reliable.
7. Prefer Nuvio's injected globalThis.TMDB_API_KEY when provider code needs TMDB.
