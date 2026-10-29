import{readFileSync}from'node:fs';import path from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{frozenR24Source}from'./apartment-history-inputs.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),cache=new Map();
// Only the two changed R24 modules are frozen; unchanged modules use the repository source.
async function sourceURL(f){if(cache.has(f))return cache.get(f);const historical=frozenR24Source(f);let text=historical?historical.text:readFileSync(path.join(root,f),'utf8');for(const m of [...text.matchAll(/from (["'])(\.[^"']+)\1/g)]){const rel=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[2]));const url=frozenR24Source(rel)?await sourceURL(rel):pathToFileURL(path.join(root,rel)).href;text=text.replace(m[0],'from '+m[1]+url+m[1]);}const url='data:text/javascript;base64,'+Buffer.from(text).toString('base64');cache.set(f,url);return url;}
export const R24_DEFAULT_SAVE=(await import(await sourceURL('src/engine/ids.js'))).DEFAULT_SAVE;
export const R24_SaveSystem=(await import(await sourceURL('src/engine/SaveSystem.js'))).SaveSystem;
