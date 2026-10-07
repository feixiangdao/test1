# YFlix Local for Nuvio

Independent Nuvio providers based on the current YFlix.in playback architecture.

## Current build: v0.3.0

### YFlix · Server 1 — Multi Source

- Uses the same PlayAPI backend as the current YFlix frontend.
- Movie and TV supported.
- Returns direct HLS / MP4 / direct-file streams with per-stream headers.
- DahmerMovies is intentionally filtered after repeated real-device Nuvio playback failures.
- Other S1 upstreams remain available.

Verified during development:
- Interstellar (TMDB 157336): PlayAPI returned 11 raw streams before the DahmerMovies filter.
- Reacher S01E01 (TMDB 108978): PlayAPI returned 12 raw streams.

### YFlix · Server 2 — Multi Dubbed

- Resolves VidBolt directly rather than returning its iframe.
- Callisto provides multi-language HLS/MP4 for movie and TV.
- Orion provides an additional direct movie HLS fallback.
- Preserves source headers and subtitles.

Automated validation:
- Interstellar: 13 normalized S2 streams.
- Reacher S01E01: 7 normalized S2 streams.
- Sample Callisto 1080p movie/TV HLS playlists returned HTTP 200 and valid #EXTM3U.

### YFlix · Server 4 — Multi Audio

- Resolves FilmU directly rather than returning its iframe.
- Movie: Pulsar / Allmovieland multi-audio HLS, with required FilmU Origin/Referer playback headers.
- TV: Singularity 1080p HLS fallback; Pulsar is also retained automatically when a title has TV results.
- Movie Singularity is suppressed when Pulsar succeeds to avoid duplicating the same Orion-style movie fallback already exposed by S2.

Automated validation:
- Interstellar Pulsar English 1080p: HTTP 200, valid #EXTM3U.
- Interstellar Pulsar Hindi 1080p: HTTP 200, valid #EXTM3U.
- Reacher S01E01 Singularity 1080p: HTTP 200, valid #EXTM3U.

## Intentionally omitted

### Server 3 — Original / VidGod

The current vidgod.net frontend closes the connection. Its surviving Sigma/Stellar worker returned candidate GoodStream URLs, but direct terminal probes returned HTTP 403 for both movie and TV. It is not exposed as a fake/dead Nuvio provider.

### Server 5 — BackUp / CineSrc

Current CineSrc uses a challenge-gated minting flow: bootstrap, two proof-of-work stages, Next.js server actions and encrypted stream payloads before producing a temporary /api/playlist/ master. Current public implementations either remain unfinished for pure QuickJS/Nuvio-style runtimes or depend on an external encryption/decryption service. S5 is therefore withheld until a direct, reproducible implementation is verified.

## Manifest

`https://raw.githubusercontent.com/feixiangdao/test1/main/yflix-nuvio/manifest.json`
