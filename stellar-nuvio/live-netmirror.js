const p=require('./providers/netmirror.js');

async function check(row,label){
  if(!row)throw new Error(label+' missing stream');
  const r=await fetch(row.url,{headers:row.headers||{},redirect:'manual'});
  const text=await r.text();
  console.log(label,'master',r.status,r.headers.get('content-type'),new URL(row.url).host,row.name,text.slice(0,160).replace(/\s+/g,' '));
  if(r.status!==200 && r.status!==206)throw new Error(label+' master status '+r.status);
  if(text.indexOf('#EXTM3U')<0)throw new Error(label+' not HLS');

  const lines=text.split(/\r?\n/).filter(Boolean);
  let variant='';
  for(let i=0;i<lines.length;i++){
    if(lines[i].indexOf('#EXT-X-STREAM-INF')===0 && lines[i+1] && lines[i+1][0]!=='#'){
      variant=new URL(lines[i+1],row.url).href;
      break;
    }
  }
  if(variant){
    const vr=await fetch(variant,{headers:row.headers||{},redirect:'manual'});
    const vt=await vr.text();
    console.log(label,'variant',vr.status,vr.headers.get('content-type'),new URL(variant).host,vt.slice(0,120).replace(/\s+/g,' '));
    if(vr.status!==200 && vr.status!==206)throw new Error(label+' variant status '+vr.status);
    if(vt.indexOf('#EXTM3U')<0)throw new Error(label+' variant not HLS');
  }
}

(async()=>{
  const movie=await p.getStreams('550','movie');
  console.log('NetMirror movie rows',movie.length,movie.map(x=>x.name));
  if(movie.length<1)throw new Error('NetMirror movie empty');
  await check(movie.find(x=>x.quality==='1080p')||movie[0],'movie');

  const tv=await p.getStreams('1399','tv',1,1);
  console.log('NetMirror TV rows',tv.length,tv.map(x=>x.name));
  if(tv.length<1)throw new Error('NetMirror TV empty');
  await check(tv.find(x=>x.quality==='1080p')||tv[0],'tv');
})().catch(e=>{console.error(e);process.exit(1)});
