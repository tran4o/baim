import{readFileSync,existsSync}from'node:fs';import path from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),old=path.resolve(root,'../extraFixes/apartment-two-photo-20261024/photo-puzzle-mouse-r25/source-before'),cache=new Map();
// Load the frozen r24 default/migration pair rather than asserting it is still the live default.
async function sourceURL(f){if(cache.has(f))return cache.get(f);let text=readFileSync(existsSync(path.join(old,f))?path.join(old,f):path.join(root,f),'utf8');for(const m of [...text.matchAll(/from (["'])(\.[^"']+)\1/g)]){const rel=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[2]));const url=existsSync(path.join(old,rel))?await sourceURL(rel):pathToFileURL(path.join(root,rel)).href;text=text.replace(m[0],'from '+m[1]+url+m[1]);}const url='data:text/javascript;base64,'+Buffer.from(text).toString('base64');cache.set(f,url);return url;}
export const R24_DEFAULT_SAVE=(await import(await sourceURL('src/engine/ids.js'))).DEFAULT_SAVE;
export const R24_SaveSystem=(await import(await sourceURL('src/engine/SaveSystem.js'))).SaveSystem;
