// Diagnostic row visibility, arm A.
//
// Shape under test: url "about:error", quality "Status", type "diagnostic".
// This is exactly what novipnoad-nuvio/providers/novipnoad-v025.js returns when
// it has nothing playable. Whether this row reaches the Streams list is the
// question this repository answers.
//
// Read-only: no network, no cookies, one row, always.

function rows() {
  return [{
    name: "DIAG A · about:error + diagnostic",
    title: "DIAG A · about:error + diagnostic",
    url: "about:error",
    quality: "Status",
    type: "diagnostic",
    provider: "diag-vis-about-error",
    headers: {},
    subtitles: []
  }];
}

function getStreams() {
  return Promise.resolve(rows());
}

module.exports = { getStreams: getStreams };
