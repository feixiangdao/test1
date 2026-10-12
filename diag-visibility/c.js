// Diagnostic row visibility, arm C.
//
// Shape under test: url "https://example.com/...", quality "Diag", type "hls".
// This is the shape every working diagnostic provider in this repository uses
// (debug3/control.js, debug3/fetch.js, debug2/tmdb.js, and so on) and the one
// observed rendering on a Pixel 9 emulator with Nuvio 0.5.8-beta.
// It serves as the positive control: if C is hidden too, the whole probe is void.

function rows() {
  return [{
    name: "DIAG C · https + hls",
    title: "DIAG C · https + hls",
    url: "https://example.com/diag-visibility-c.m3u8",
    quality: "Diag",
    type: "hls",
    provider: "diag-vis-https-hls",
    headers: {},
    subtitles: []
  }];
}

function getStreams() {
  return Promise.resolve(rows());
}

module.exports = { getStreams: getStreams };
