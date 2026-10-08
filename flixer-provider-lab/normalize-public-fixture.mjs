import {readFile,writeFile} from "node:fs/promises";
const raw=await readFile("/tmp/hexa-public-fixture.json","utf8");
const fixture=JSON.parse(raw);
if(typeof fixture.apiKey!=="string" || !/^[a-fA-F0-9]{64}$/.test(fixture.apiKey))throw Error("INVALID_PUBLIC_FIXTURE_KEY");
if(typeof fixture.encrypted!=="string" || fixture.encrypted.length<100)throw Error("INVALID_PUBLIC_FIXTURE_CIPHER");
if(!Array.isArray(fixture.decrypted?.sources)||!fixture.decrypted.sources.length)throw Error("INVALID_PUBLIC_FIXTURE_EXPECTED");
await writeFile("/tmp/flixer-fixture.json",JSON.stringify({status:200,body:fixture.encrypted,suppliedKey:fixture.apiKey}));
await writeFile("/tmp/flixer-fixture-expected.json",JSON.stringify(fixture.decrypted));
console.log("PUBLIC_CIPHER_FIXTURE_READY",{sample:"hexa movie 550",cipherBytes:fixture.encrypted.length,expectedServers:fixture.decrypted.sources.length});
