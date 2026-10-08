// Flixer Local: original HLS master-playlist helper, no cloud or DOM dependencies.
// This module is staged for local integration once Flixer's media decoding is verified.
function resolveHlsUrl(base, ref) {
  if (typeof base !== "string" || typeof ref !== "string") return "";
  ref = ref.trim().replace(/^["']|["']$/g, "");
  if (!ref || /^data:|^javascript:/i.test(ref)) return "";
  if (/^https?:\/\//i.test(ref)) return ref;
  var origin = /^(https?):\/\/([^/]+)/i.exec(base);
  if (!origin) return "";
  var root = origin[1] + "://" + origin[2];
  if (ref.slice(0,2) === "//") return origin[1] + ":" + ref;
  var relativeParts = ref.split("?");
  var path = relativeParts[0];
  var basePath = base.slice(root.length).split("?")[0].split("#")[0];
  if (!basePath) basePath = "/";
  if (path.charAt(0) !== "/") path = basePath.slice(0,basePath.lastIndexOf("/")+1) + path;
  var segments = path.split("/");
  var stack = [];
  for (var i=0;i<segments.length;i++) {
    var part=segments[i];
    if (part === "..") stack.pop();
    else if (part !== "." && part !== "") stack.push(part);
  }
  return root + "/" + stack.join("/") + (relativeParts.length>1?"?"+relativeParts.slice(1).join("?"):"");
}
function hlsQuality(width,height) {
  if (width>=3800 || height>=2100) return "4K";
  if (width>=1850 || height>=1000) return "1080p";
  if (width>=1200 || height>=690) return "720p";
  if (width>=750 || height>=450) return "480p";
  return width>0 || height>0 ? "SD" : "Auto";
}
function parseHlsMaster(body, url) {
  if(typeof body !== "string" || body.slice(0,7)!=="#EXTM3U") return [];
  var lines=body.split(/\r?\n/), variants=[], seen={};
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var attrs=line.slice("#EXT-X-STREAM-INF:".length);
    var size=/\bRESOLUTION=(\d+)x(\d+)/i.exec(attrs);
    var bw=/\bBANDWIDTH=(\d+)/i.exec(attrs);
    var width=size?Number(size[1]):0,height=size?Number(size[2]):0;
    var next="";
    for(var j=i+1;j<lines.length;j++){
      var candidate=lines[j].trim();
      if(candidate && candidate.charAt(0)==="#")continue;
      next=candidate;
      break;
    }
    if(!next)continue;
    var dest=resolveHlsUrl(url,next);
    if(!/^https?:\/\//i.test(dest) || seen[dest])continue;
    seen[dest]=true;
    var quality=hlsQuality(width,height);
    variants.push({url:dest,quality:quality,width:width,height:height,
      bandwidth:bw?Number(bw[1]):0,title:quality+(width&&height?" · "+width+"×"+height:"")});
    i=j;
  }
  variants.sort(function(a,b){return (b.width*b.height)-(a.width*a.height)||b.bandwidth-a.bandwidth});
  return variants;
}
module.exports={parseHlsMaster:parseHlsMaster,resolveHlsUrl:resolveHlsUrl,hlsQuality:hlsQuality};
