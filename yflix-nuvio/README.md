# YFlix Local for Nuvio

Independent Nuvio provider based on the current YFlix.in playback architecture.

## v0.1.0

Implemented:

- **YFlix · Server 1 (Multi Source)**
- Movie route: TMDB movie ID
- TV route: TMDB series ID + season + episode
- Uses the same PlayAPI stream backend as the current YFlix frontend
- Returns the backend's direct HLS / MP4 / MKV URLs
- Preserves per-stream playback headers
- Preserves subtitles returned by each stream source
- Prefers ordinary HLS/MP4 playback rows before very large MKV/remux rows

Verified while developing with:

- Interstellar (TMDB 157336): API returned 11 streams
- Reacher S01E01 (TMDB 108978): API returned 12 streams

The YFlix frontend currently exposes five servers. Server 1 is implemented first because it exposes terminal media URLs directly. Servers 2–5 are intentionally not represented as fake iframe streams; they require their own extraction paths before being added.
