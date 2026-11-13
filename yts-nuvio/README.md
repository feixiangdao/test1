# YTS API Diagnostic v0.3.0 for Nuvio Android

> This release deliberately changes the scraper ID and filename to avoid reuse
> of old provider JavaScript, and removes the metadata-cache/file-number probes
> from the *active* provider. The old `providers/yts.js` is kept for historical
> reference but is no longer listed in the manifest.

## Add repository

https://raw.githubusercontent.com/feixiangdao/test1/main/yts-nuvio/manifest.json

Target: Nuvio Android Full 0.6.12-beta (155), movie-only.

In Nuvio **Settings → Content & Discovery → Plugins**, refresh this repository
and confirm **YTS API Diagnostic for Nuvio Mobile (version 0.3.0)** and provider
**YTS API Diagnostic v0.3**. If the old provider is still listed, the reload
has not succeeded. Reinstall this repository if refreshing fails.

## How to read stream labels

For example: `YTS 720p x264 | v030 L1/D4 | F566BBF0 | S:100`.

- `v030`: this exact new provider code is running, not the old cached plugin.
- `L1`: list_movies API returned one unique torrent for the exact IMDb movie.
- `D4`: movie_details API returned four torrent records for the exact IMDb movie.
- `DERR`: movie_details could not be verified from either known API base.
- `DNOID`: list_movies did not include a usable numeric movie ID.
- `F566BBF0`: first eight characters of the returned torrent infoHash.
- `S:100`: API-supplied seeder number, **not** an independently checked live count.

The provider merges distinct infoHash records from both list and detail endpoints
and sorts them by advertised quality. It does not send traffic to iTorrents,
BTcache or other metadata caches during stream search.

## Diagnosing the previous one-source problem

The developer-verified Nuvio 0.6.12 streaming repository appends all results
returned by one plugin; it does not impose a hard limit of one stream per provider.

With this diagnostic provider:

- **New provider name absent / no v030** → likely stale plugin installation
  or refresh failure, not yet evidence about YTS API.
- **v030 L1/D4 but only one card** → potential Nuvio parsing/UI/filter issue.
- **v030 L1/DERR, one card** → movie_details unreachable or invalid on the phone.
- **v030 L1/D1, one card** → both API responses really provide only one record
  to the phone on that request; compare the API response with a browser request
  using the same network.
- **Four v030 cards, no playback** → listing issue resolved. Test the built-in
  P2P streaming settings/logs separately. This code uses Magnet links and does
  not claim that the torrent contains a playable movie.

## Safety and limitations

Raw YTS/yifystatus torrent metadata does not establish licensing, file
authenticity, torrent health, or working playback. Use only works you are
authorized to access. Torrent P2P may disclose your IP address to other peers.

## Why this is a diagnostic rather than another guessed fix

Earlier builds 0.2.1–0.2.4 attempted to download Torrent file metadata and
guess/select file indices. The phone observed HTTP404 and invalid/missing video
metadata. This version isolates source discovery from the P2P playback engine;
no more speculative file-index changes. 
