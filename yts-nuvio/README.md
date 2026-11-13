# YTS Movie Sources — Nuvio Mobile

Experimental Nuvio Provider v0.2.3 for **Nuvio Android 0.6.12-beta (155), Full build**. Movie-only. Public GitHub hosting does not imply that film distribution is authorized. Access only media you have the right to use.

## Install

Copy this exact URL into **Nuvio → Settings → Content & Discovery → Plugins → Add Repository**:

https://raw.githubusercontent.com/feixiangdao/test1/main/yts-nuvio/manifest.json

Use a Full Android build with the plugin feature enabled. The Play Store build disables third-party plugins. After adding, enable **YTS Movies (Torrent)** and try its built-in Test action. If streams appear, enable/authorize local P2P under Playback settings to test playback. Automatic addon Debrid resolution for plugin streams is not established by the source code.

## How it works

Nuvio passes a TMDB movie ID to `getStreams(tmdbId, mediaType, season, episode)`. The provider fetches the movie's IMDb ID from TMDB, searches YTS for the **exact IMDb ID**, and returns one item per valid, distinct torrent with infoHash, title, quality, size and peer counts. It tries to download the associated small .torrent metadata file, verifies the SHA-1 of its info dictionary matches the advertised infoHash, finds the largest MP4/MKV (or other video file), and emits a torrent://hash/index URL recognized by Nuvio 0.6.12-beta. If the YTS `.torrent` URL is unavailable, it tries two publicly documented, hash-addressed metadata caches (iTorrents and BTcache). It validates SHA-1 of the bencoded info dictionary against the official API infoHash before selecting the largest recognized video file. If all checks fail, it falls back to a Magnet without guessing a file index. It supports movies only, not TV series.

The script uses two YTS API bases: `https://movies-api.accel.li/api/v2` and the legacy `https://yts.gg/api/v2`. The status page at yifystatus.com is not a video-stream API. An API being listed publicly does not guarantee that it is reachable from your network.

## Test

Requires Node.js 18 or newer. Run `npm test` in this folder for mocked offline tests. Run `npm run live-check` to check the live YTS API without downloading a torrent or starting video playback.

**Verification status:** Offline mocked bencode file-selection and fallback tests passed. Live .torrent metadata retrieval, the phone's QuickJS runtime and physical playback have not been verified. The last two public metadata caches may be blocked, unavailable, or not yet contain a hash. Hash verification protects against selecting files from the wrong torrent; it does not verify film authenticity or playable peers. Device playback is still unverified.

## Troubleshooting

- **Cannot add repository:** Confirm this URL loads raw JSON in the phone browser, and you use the Full APK.
- **Zero streams:** Check the TMDB API key in Nuvio settings, Internet access to api.themoviedb.org and YTS API availability. The built-in Test uses TMDB movie ID 603, and the movie also must exist in the upstream index.
- **Streams appear but cannot play:** `Video #N (Y/I/B)` means the video index was verified against the torrent hash using metadata from YTS / iTorrents / BTcache. `Auto (Y404/I404/B404)` means all three metadata fetches failed with HTTP 404; other diagnostic codes include `Hash`, `Invalid`, `NoVideo`, and `Fail`. Auto does **not** guarantee that playback works. This version removes `Try File #1` because a guessed index can refer to subtitles or images.
- **Plugin update not visible:** Refresh the repository in Nuvio and restart if necessary.

## Official source used for compatibility review

https://github.com/NuvioMedia/NuvioMobile/releases/tag/0.6.12-beta

https://github.com/NuvioMedia/NuvioMobile/blob/0.6.12-beta/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt

https://github.com/NuvioMedia/NuvioMobile/blob/0.6.12-beta/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamFetchSupport.kt

## Privacy and copyright

P2P torrent activity can expose the device's public IP to peers and may upload as well as download content. Use only sources you are authorized to access; neither this provider nor this repository establishes distribution rights.

### Additional privacy note

When the primary YTS .torrent endpoint fails, the plugin sends the public infoHash and your IP to independent metadata cache services to fetch small .torrent metadata. It does not send API keys to those services. The services may be subject to ISP/network restrictions and can be disabled in the provider source if desired.
