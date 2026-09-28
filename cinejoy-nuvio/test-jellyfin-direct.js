const assert = require('assert');

global.SCRAPER_SETTINGS = {
  serverUrl: 'https://jf.example/',
  accessToken: 'token-123'
};

const calls = [];
global.fetch = async function(url, options) {
  calls.push({url, options});
  const u = new URL(url);
  const p = u.pathname;
  let body;

  if (p === '/Users/Me') {
    body = {Id:'u1'};
  } else if (p === '/Users/u1/Items' && u.searchParams.get('IncludeItemTypes') === 'Movie') {
    body = {Items:[{Id:'m1',ProviderIds:{Tmdb:'550'}}]};
  } else if (p === '/Users/u1/Items' && u.searchParams.get('IncludeItemTypes') === 'Series') {
    body = {Items:[{Id:'s1',ProviderIds:{TMDB:'1399'}}]};
  } else if (p === '/Shows/s1/Episodes') {
    assert.equal(u.searchParams.get('Season'),'1');
    body = {Items:[{Id:'e1',ParentIndexNumber:1,IndexNumber:1}]};
  } else if (p === '/Items/m1/PlaybackInfo') {
    body = {MediaSources:[{Id:'ms1',Name:'Original',Container:'mkv',Size:2147483648,MediaStreams:[
      {Type:'Video',Height:1080,Codec:'hevc'},
      {Type:'Audio',Language:'eng'}
    ]}]};
  } else if (p === '/Items/e1/PlaybackInfo') {
    body = {MediaSources:[{Id:'ems1',DirectStreamUrl:'/Videos/e1/stream?static=true&MediaSourceId=ems1',Container:'mp4',MediaStreams:[
      {Type:'Video',Height:2160,Codec:'h264'}
    ]}]};
  } else {
    throw new Error('Unexpected fetch '+url);
  }
  return {ok:true,status:200,json:async()=>body};
};

const provider = require('./providers/jellyfin_direct');

(async()=>{
  const layout = provider.onSettings();
  assert(layout.some(x=>x.key==='serverUrl'));
  assert(layout.some(x=>x.key==='accessToken'));

  const movie = await provider.getStreams('550','movie');
  assert.equal(movie.length,1);
  assert.equal(movie[0].url,'https://jf.example/Videos/m1/stream?static=true&MediaSourceId=ms1');
  assert.equal(movie[0].quality,'1080p');
  assert(movie[0].headers.Authorization.includes('Token="token-123"'));

  const tv = await provider.getStreams('1399','tv',1,1);
  assert.equal(tv.length,1);
  assert.equal(tv[0].url,'https://jf.example/Videos/e1/stream?static=true&MediaSourceId=ems1');
  assert.equal(tv[0].quality,'2160p');

  assert(calls.every(x=>x.options && x.options.headers && x.options.headers.Authorization));
  console.log('Jellyfin Direct tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
