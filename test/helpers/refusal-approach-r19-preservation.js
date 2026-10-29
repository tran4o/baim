import assert from 'node:assert/strict';
import {stripWardrobeQuestR20} from './wardrobe-quest-r20-preservation.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const f=JSON.parse(readFileSync(new URL('../fixtures/refusal-approach-r19-deltas.json',import.meta.url))),sha=x=>createHash('sha256').update(x).digest('hex');
export function stripRefusalApproachR19(path,source,strict=false){
 source=stripWardrobeQuestR20(path,source);
 const r=f.records[path];if(!r)return source;
 const s=String(source).replaceAll('\r\n','\n');
 if(sha(s)!==r.afterSHA256){if(strict)assert.equal(sha(s),r.beforeSHA256,'unbound refusal r19 source: '+path);return source;}
 assert.equal(sha(r.before),r.beforeSHA256);return r.before;
}
