# OnlyFlix Local for Nuvio

Independent Nuvio provider reconstructed from `https://onlyflix.to/`.

## Current site mapping

Live inspection of the OnlyFlix movie player found three top-level choices:

- **Server 1** → `vidapi.xyz`
- **Server 2** → `sv2.nontongo.stream` / NontonGo
- **Server 3** → `vidfast.vc`

OnlyFlix itself is primarily a catalog/player shell; playback is delegated to those downstream services.

## v0.1.0

Enabled:

- **OnlyFlix · Server 3 · VidFast**
  - movie + TV
  - TMDB ID based
  - direct HLS/MP4 resolution
  - subtitles when returned by VidFast
  - tries `vidfast.vc`, then recent mirrors
  - does not return iframe/player pages

Research status:

- **Server 1 / VidAPI**: the embed endpoint accepts TMDB or IMDb IDs. Its A/X/N/V/Y/P/B/S/F/M buttons are internal VidAPI server selections and the final media URL is not exposed directly in the static DOM. Not enabled until direct media extraction is reproduced.
- **Server 2 / NontonGo**: upstream identified, but direct-stream protocol is not yet reproduced. Not enabled yet.

## Install

Use this raw manifest URL in Nuvio Local Scrapers / Repository:

`https://raw.githubusercontent.com/feixiangdao/test1/main/onlyflix-nuvio/manifest.json`

## Design rule

This plugin stays separate from Stellar Local, NoctraTV Local and KissKH Local. An upstream iframe is not treated as a completed direct provider.
