# OnlyFlix Local for Nuvio

Independent Nuvio provider reconstructed from `https://onlyflix.to/`.

## Current site mapping

OnlyFlix server numbers are dynamic. The reliable identifier is the upstream source name.

For titles where CDNM is available, the current page order is typically:

1. **CDNM** → `share.cdnm.ink`
2. **VidAPI** → `vidapi.xyz`
3. **NontonGo** → `sv2.nontongo.stream` / `sv2.nontongo.day`
4. **VidFast** → `vidfast.vc`

For titles without CDNM, the remaining sources shift forward, so this plugin displays source names rather than hard-coded Server numbers.

## v0.4.x

Enabled sources:

- **OnlyFlix · CDNM**
  - IMDb-backed CDNM / PlayerJS route
  - TMDB → IMDb mapping handled by the resolver
  - movie + TV
  - direct HLS qualities when available, including 240p / 360p / 480p / 720p / 1080p
  - video bytes are not proxied through Vercel; the resolver only discovers the final HLS URLs

- **OnlyFlix · VidAPI**
  - movie + TV
  - direct HLS via the current VAPlayer backend

- **OnlyFlix · NontonGo**
  - current `/01russia/multisourcesoap.php` path
  - movie + TV
  - probes Soap2 candidates and removes failed upstreams
  - returns live HLS and MP4 candidates with the correct stream type

- **OnlyFlix · VidFast**
  - movie + TV
  - direct HLS via the current VAPlayer/VidFast backend

## Resolver

The local scrapers use:

`https://onlyflix-resolver-feixiangdao.vercel.app/api/resolve`

The resolver performs upstream discovery only. Returned HLS/MP4 URLs are played directly by Nuvio.

## Install

Use this raw manifest URL in Nuvio Local Scrapers / Repository:

`https://raw.githubusercontent.com/feixiangdao/test1/main/onlyflix-nuvio/manifest.json`

## Design rule

This plugin stays separate from Stellar Local, NoctraTV Local and KissKH Local. An upstream iframe is not treated as a completed direct provider.
