// Diagnostic row visibility, arm B.
//
// Shape under test: url "https://example.com/...", quality "Status", type "diagnostic".
// Same quality and type as arm A; only the url scheme differs. If A is hidden and
// B is shown, Nuvio is filtering on the url scheme (about: is not fetchable).

function rows() {
  return [{
    name: "DIAG B · https + diagnostic",
    title: "DIAG B · https + diagnostic",
    url: "https://example.com/diag-visibility-b.m3u8",
    quality: "Status",
    type: "diagnostic",
    provider: "diag-vis-https-diagnostic",
    headers: {},
    subtitles: []
  }];
}

function getStreams() {
  return Promise.resolve(rows());
}

module.exports = { getStreams: getStreams };
