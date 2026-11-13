# YTS API Integrity Diagnostic v0.3.1 — Nuvio Android Full 0.6.12-beta (155)

## Installation

https://raw.githubusercontent.com/feixiangdao/test1/main/yts-nuvio/manifest.json

Refresh this repository in Nuvio's Plugins screen. Verify that it says
**YTS API Integrity Diagnostic for Nuvio Mobile**, version **0.3.1**, and
that its provider is **YTS API Integrity v0.3.1**. The manifest uses a new
provider ID and a new script filename to sidestep previous cached code.

## What to check

Example provider label:

\`YTS 720p | v031 tt33764258 M79664 L1 D4 V1 U1 R1 A0 | F998565D\`

- \`v031\`: this exact diagnostic code is running.
- \`tt33764258\`: IMDb ID used by the plugin (must match the intended film).
- \`M79664\`: YTS numeric movie ID from list_movies (verify matches details).
- \`L1\`: number of distinct valid hashes from IMDb-matched list_movies results.
- \`D4\`: *raw record count* in movie_details, not necessarily valid torrents.
- \`V1\`: detail records with syntactically valid 40-digit hexadecimal hashes.
- \`U1\`: number of *unique* valid hashes in the detail response.
- \`R1\`: number of unique hashes in the final list, before Nuvio display.
- \`A0\`: list_movies used primary API; A1 means fallback API.
- \`F998565D\`: first 8 digits of that stream's normalized infoHash.

Interpretation:

* D4 V1 U1 R1 and one card: the other three API records are invalid/duplicates.
* D4 V4 U4 R4 and one card: the provider returns four distinct results and Nuvio is hiding/filtering three.
* L1/D4 and IMDb/movie IDs different from public data: the phone is getting different underlying records or is querying a different title.
* This release does **not** repair P2P playback: it only verifies the source data.
* Even a well-formed 40-digit infoHash, a nonzero API seeder count, or
  visible card does not prove that a torrent is authentic or playable.

Source resolution and playback are separate issues. Nuvio 0.6.12-beta's
PluginRuntime parses a JSON array of source records and StreamsRepository adds
each converted stream. The provider deliberately issues *no* .torrent
metadata-cache requests, and it never guesses file indices.

**Privacy:** Diagnostic labels reveal the selected movie's IMDb/YTS IDs and
public torrent hash prefix. No sensitive user account information is added.
Torrent playback may reveal your IP address to peers, and movie distribution
rights must be respected.
