const MOVIE_GENRES = [
  ['28','动作'],['12','冒险'],['16','动画'],['35','喜剧'],['80','犯罪'],['99','纪录'],
  ['18','剧情'],['10751','家庭'],['14','奇幻'],['36','历史'],['27','恐怖'],['10402','音乐'],
  ['9648','悬疑'],['10749','爱情'],['878','科幻'],['10770','电视电影'],['53','惊悚'],['10752','战争'],['37','西部']
];

const TV_GENRES = [
  ['10759','动作冒险'],['16','动画'],['35','喜剧'],['80','犯罪'],['99','纪录'],['18','剧情'],
  ['10751','家庭'],['10762','儿童'],['9648','悬疑'],['10763','新闻'],['10764','真人秀'],
  ['10765','科幻奇幻'],['10766','肥皂剧'],['10767','脱口秀'],['10768','战争政治'],['37','西部']
];

const MOVIE_SECTIONS = ['推荐','热门','正在上映','即将上映','高评分','最新'];
const TV_SECTIONS = ['推荐','热门','今日播出','本周播出','高评分','最新'];
const SORT_OPTIONS = ['热门','评分','最新'];

function yearOptions() {
  const y = new Date().getFullYear();
  const out = [];
  for (let i = y; i >= y - 25; i--) out.push(String(i));
  return out;
}

function genreMap(type) {
  return new Map((type === 'series' ? TV_GENRES : MOVIE_GENRES).map(([id,name]) => [name,id]));
}

function genreNameMap(type) {
  return new Map((type === 'series' ? TV_GENRES : MOVIE_GENRES).map(([id,name]) => [String(id),name]));
}

module.exports = {
  MOVIE_GENRES, TV_GENRES, MOVIE_SECTIONS, TV_SECTIONS, SORT_OPTIONS,
  yearOptions, genreMap, genreNameMap
};
