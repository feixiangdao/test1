# YTS Dual-API Integrity Provider v0.3.2

Target: Nuvio Android Full 0.6.12-beta (155).

Install or refresh:
https://raw.githubusercontent.com/feixiangdao/test1/main/yts-nuvio/manifest.json

After refreshing, the repository should be **YTS Dual-API Integrity for Nuvio Mobile** (v0.3.2), with one **YTS Dual-API v0.3.2** provider. This release changes both the script filename and provider ID to prevent stale-code reuse.

## Reason for this version

On-device v0.3.1 observed:
`v031 tt33764258 M79664 L1 D4 V4 U1 R1 A0 | F998565D`.

The phone's first successful movie_details result had four syntactically valid hashes but only **one distinct hash**. In an independent public API check, the same IMDb film had four distinct hashes. The earlier code accepted the first successful API and did not compare the fallback host.

v0.3.2 requests movie-list and movie-details records from **both** https://movies-api.accel.li/api/v2/ and https://yts.gg/api/v2/ in parallel batches. It selects the *single* response with the greatest number of unique, valid 40-hex hash values; it does not mix suspicious records from one source into a healthier alternative. Two-list / two-detail API requests may be slower than v0.3.1.

## Interpreting source labels

Example:

`YTS 720p | v032 tt33764258 M79664 L1/4 D1/4 R4 PickD1 !DIFF | F566BBF0`

- `L1/4`: distinct hashes from list_movies on primary / backup host.
- `D1/4`: distinct hashes from movie_details on primary / backup.
- `R4`: results chosen from the most complete response and passed to Nuvio.
- `PickD1`: selected the backup movie_details response; `PickD0` would be primary.
- `!DIFF`: primary and backup details had different counts of distinct hashes.
- `F566BBF0`: short prefix of the selected torrent infoHash.
- `tt33764258` and `M79664` identify the query and YTS movie.

If the phone shows `L1/1 D1/1 R1`, both hosts appear to be returning only one unique hash from that network. Compare the raw API JSON responses in the phone browser and check DNS, network proxy, and domain routing. Do **not** assume that a correctly formatted infoHash represents a real or playable video.

This provider returns Magnet links. It does **not** solve P2P engine failure, seed reachability, or video-file selection. For those issues review Nuvio Playback P2P status and diagnostics separately. Respect film distribution rights; BitTorrent peers may see your public IP.

## Tests

Node 18+ in this directory: `npm test`.

The previous releases' JS files are retained as historical references but only `providers/yts-api-v032.js` is active in this manifest.
