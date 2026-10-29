import {stripApartmentWindowR17,restoreApartmentWindowR17Snapshot} from './apartment-window-r17-preservation.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const f=JSON.parse(readFileSync(new URL('../fixtures/apartment-two-photo-deltas.json',import.meta.url)));
const sha=v=>createHash('sha256').update(v).digest('hex');
export function stripApartmentTwoPhoto(path,source,allowOtherHistory=false){
 source=stripApartmentWindowR17(path,source);
 const r=f.records[path];if(!r)return source;
 const s=String(source).replaceAll('\r\n','\n');if(sha(s)===r.beforeSHA256)return s;
 if(allowOtherHistory&&sha(s)!==r.afterSHA256)return source;
 assert.equal(sha(s),r.afterSHA256,'exact scene fix apartment inverse: '+path);
 assert.equal(sha(r.before),r.beforeSHA256,'immutable PR78 predecessor: '+path);return r.before;
}
export function restoreApartmentTwoPhotoSnapshot(kind,value,allowOtherHistory=false){
 value=restoreApartmentWindowR17Snapshot(kind,value);
 const r=f.snapshots[kind],hash=sha(JSON.stringify(value));if(!r||hash===r.beforeSHA256)return value;
 if(allowOtherHistory&&hash!==r.afterSHA256)return value;
 assert.equal(hash,r.afterSHA256,'exact scene fix apartment snapshot: '+kind);assert.equal(sha(JSON.stringify(r.before)),r.beforeSHA256);return structuredClone(r.before);
}
