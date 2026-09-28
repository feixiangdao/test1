const assert=require('assert');
const p=require('./providers/dooflix.js');
assert.equal(
  p.buildApiUrl('550','movie'),
  'https://panel.watchkaroabhi.com/api/3/movie/550/links?api_key=qNhKLJiZVyoKdi9NCQGz8CIGrpUijujE'
);
assert.equal(
  p.buildApiUrl('1399','tv',1,1),
  'https://panel.watchkaroabhi.com/api/3/tv/1399/season/1/episode/1/links?api_key=qNhKLJiZVyoKdi9NCQGz8CIGrpUijujE'
);
console.log('DooFlix helper tests passed');
