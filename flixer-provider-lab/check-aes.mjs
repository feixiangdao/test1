import {readFile} from "node:fs/promises";
import {createDecipheriv,createHash} from "node:crypto";
const f=JSON.parse(await readFile("/tmp/flixer-fixture.json","utf8"));
const data=Buffer.from(f.body,"base64");
const rawKey=Buffer.from(f.suppliedKey,"hex");
const keys=[
  ["raw-32-byte-key",rawKey],
  ["sha256-key-hex-text",createHash("sha256").update(f.suppliedKey,"utf8").digest()],
  ["sha256-raw-key",createHash("sha256").update(rawKey).digest()]
];
const shapes=[
 ["iv-first-tag-last",data.subarray(0,12),data.subarray(12,-16),data.subarray(-16)],
 ["tag-first-iv-next",data.subarray(16,28),data.subarray(28),data.subarray(0,16)],
 ["iv-last-tag-previous",data.subarray(-12),data.subarray(0,-28),data.subarray(-28,-12)]
];
let success=[];
for(const [keyKind,key] of keys){
 for(const [shape,iv,ct,tag] of shapes){
   try{
     const d=createDecipheriv("aes-256-gcm",key,iv);
     d.setAuthTag(tag);
     const plain=Buffer.concat([d.update(ct),d.final()]).toString("utf8");
     const data=JSON.parse(plain);
     const values=Array.isArray(data.sources)?data.sources:[];
     success.push({keyKind,shape,isJson:true,sourceCount:values.length,hasMedia:values.some(x=>typeof x.url==="string"&&/^https?:\/\//.test(x.url))});
   }catch(_){}
 }
}
console.log("LOCAL_AES_GCM_HYPOTHESIS",JSON.stringify({tested:keys.length*shapes.length,publicDirectProfilesMatched:success}));
