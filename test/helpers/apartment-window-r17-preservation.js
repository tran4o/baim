import {stripInteractionFacingR18,restoreInteractionFacingR18Snapshot} from './interaction-facing-r18-preservation.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const f=JSON.parse(readFileSync(new URL('../fixtures/apartment-window-r17-deltas.json',import.meta.url)));
const sha=x=>createHash('sha256').update(x).digest('hex');
export function stripApartmentWindowR17(path,source,strict=false){
 source=stripInteractionFacingR18(path,source);
 const r=f.records[path];if(!r)return source;
 const s=String(source).replaceAll('\r\n','\n');
 if(sha(s)!==r.afterSHA256){if(strict)assert.equal(sha(s),r.beforeSHA256,'unbound window r17 source: '+path);return source;}
 assert.equal(sha(r.before),r.beforeSHA256);return r.before;
}
export function restoreApartmentWindowR17Snapshot(kind,value){
 value=restoreInteractionFacingR18Snapshot(kind,value);
 const r=f.snapshots[kind];if(!r||sha(JSON.stringify(value))!==r.afterSHA256)return value;
 assert.equal(sha(JSON.stringify(r.before)),r.beforeSHA256);return structuredClone(r.before);
}
