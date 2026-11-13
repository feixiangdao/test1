# YTS HTTP Integrity Diagnostic v0.3.3

For Nuvio Android Full 0.6.12-beta (155). This is a diagnostic provider, not proof that any torrent is playable.

Install/refresh:
https://raw.githubusercontent.com/feixiangdao/test1/main/yts-nuvio/manifest.json

After refreshing, verify the repository name **YTS HTTP Integrity Diagnostic for Nuvio Mobile**, version **0.3.3**, and provider **YTS HTTP Integrity v0.3.3**. The new filename and provider ID are intentional, to avoid reusing an older cached JS file.

## The issue this diagnoses

On the same Android phone, the Edge browser showed four different torrent hashes from the public YTS movie_details API, but the Nuvio v0.3.2 plugin observed one distinct hash `F998565D` in all four records for the same IMDb title.

Nuvio 0.6.12-beta's plugin FetchBridge adds a Windows desktop User-Agent if no User-Agent is supplied. v0.3.3 explicitly supplies a mobile Android Chrome User-Agent, `Cache-Control: no-cache, no-store`, `Pragma: no-cache`, and a unique cache-busting query parameter. Both public API roots were separately checked to accept the query parameter.

The plugin deliberately reads response `text()`, scans raw JSON for 40-character hexadecimal `hash` fields, then runs `JSON.parse`. It compares raw and parsed hash counts while retaining the same exact IMDb-film validation.

## Label decoding

Example:
`YTS 720p | v033 tt33764258 M79664 L1/4 D1/4 Raw4/1|4/4 PrefixF998565D/F566BBF0 R4 PickD1 | HashF566BBF0`

- **L1/4**: unique parsed hashes returned by primary/backup list_movies APIs.
- **D1/4**: unique parsed hashes from primary/backup movie_details APIs.
- **Raw4/1|4/4**: raw HTTP body contains four 40-hex hash values but only one distinct on the primary host; four values/four distinct on backup host.
- **PrefixF998565D/F566BBF0**: first recognized raw-body hash on each host.
- **R4**: chosen stream count, before Nuvio UI.
- **PickD1**: chose backup host's detail response.
- **HashF566BBF0**: current stream's hash prefix.

If both hosts show `Raw4/1|4/1`, the native HTTP response differs from what the mobile browser shows. Compare request User-Agent, DNS, VPN/proxy, and caching. If raw says `4/4` but parsed selection says `D1/1`, inspect QuickJS/JSON handling.

**Limits:** Regex scans the full raw JSON body. It does not validate file integrity, availability, uploader authenticity, or content rights. The plugin returns magnet sources; video playback is a separate Nuvio P2P engine issue. Peer-to-peer torrent activity can expose your public IP. Only use works you are entitled to access.

## Test

Node 18+: `npm test`. Tests mock the Android `fetch` interface and verify the diagnostic counters and source selection; device behavior remains unverified.
