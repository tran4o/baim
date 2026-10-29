import{stripKioskR07}from'./kiosk-r07-preservation.js';
import assert from 'node:assert/strict';
import {restorePhotoQuestSnapshot} from './photo-quest-preservation.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripMitkoIdleRestoration} from './mitko-idle-preservation.js';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/northeast-kiosk-deltas.json',import.meta.url)));
const sha=value=>createHash('sha256').update(value).digest('hex');
export function stripNortheastKiosk(path,source){
 source=stripKioskR07(path,source);
 source=stripMitkoIdleRestoration(path,source);
 const record=fixture.records[path];if(!record)return source;
 assert.equal(sha(source),record.afterSHA256,'exact scene fix northeast kiosk inverse: '+path);
 assert.equal(sha(record.before),record.beforeSHA256,'immutable PR72 predecessor: '+path);
 return record.before;
}
export function restoreNortheastKioskSnapshot(kind,value){
 value=restorePhotoQuestSnapshot(kind,value);
 const record=fixture.snapshots[kind];if(!record)return value;
 assert.equal(sha(JSON.stringify(value)),record.afterSHA256,'exact scene fix snapshot (northeast kiosk): '+kind);
 assert.equal(sha(JSON.stringify(record.before)),record.beforeSHA256,'immutable PR72 snapshot: '+kind);
 return structuredClone(record.before);
}
