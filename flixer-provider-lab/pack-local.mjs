import {readFile,writeFile} from "node:fs/promises";
const env=await readFile("flixer-provider-lab/local-environment.js","utf8");
let decoder=await readFile("/tmp/flixer-hermes-syntax-preview.js","utf8");
const adapter=await readFile("flixer-provider-lab/local-protocol.js","utf8");
// Keep diagnostic tracing out of the runtime, otherwise WBG import calls grow the log unbounded.
decoder=decoder.replace("globalThis.__FLIXER_WBG_CALLS = [];","").replace("globalThis.__FLIXER_WBG_CALLS.push(k);","");
const script="/* Flixer Local - experimental single-file Hermes provider; no remote resolver. */\n"+
 env+"\n"+decoder+"\n"+adapter+"\n";
await writeFile("/tmp/flixer-local-candidate.js",script);
console.log("FLIXER_LOCAL_SINGLEFILE_CREATED",JSON.stringify({bytes:script.length,usesNativeWasm:/WebAssembly\.instantiate\(/.test(script),remoteResolver:/vercel\.app|\/resolve\/movie/.test(script),hasGetStreams:/module\.exports=\{getStreams/.test(script)}));
