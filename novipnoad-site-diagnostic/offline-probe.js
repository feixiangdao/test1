// Isolated offline diagnostic: NO network, cookies, keys, or real media.
function getStreams() {
  return Promise.resolve([
    {name:'OFFLINE PROBE PASS 1',title:'OFFLINE PROBE PASS 1',url:'https://example.com/offline-probe-1.m3u8',quality:'Diagnostic',type:'hls',provider:'nuvio-offline-probe',headers:{},subtitles:[]},
    {name:'OFFLINE PROBE PASS 2',title:'OFFLINE PROBE PASS 2',url:'https://example.com/offline-probe-2.m3u8',quality:'Diagnostic',type:'hls',provider:'nuvio-offline-probe',headers:{},subtitles:[]}
  ]);
}
module.exports={getStreams:getStreams};
