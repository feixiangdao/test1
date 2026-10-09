// NOVIPNOAD runtime probe for Nuvio QuickJS
function getStreams(id, mediaType, season, episode) {
  return Promise.resolve([
    {
      name: "NOVIPNOAD PROBE OK",
      title: "NOVIPNOAD PROBE OK",
      url: "https://example.com/probe.m3u8",
      quality: "Probe",
      type: "hls",
      provider: "novipnoad-probe",
      headers: {},
      subtitles: []
    }
  ]);
}
module.exports = { getStreams: getStreams };
