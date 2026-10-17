import assert from 'node:assert/strict';
import {stripTurnPocket,restoreTurnPocketSnapshot} from './turn-pocket-preservation.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/turning-pilot-deltas.json',import.meta.url)));
const sha=value=>createHash('sha256').update(value).digest('hex');
export function stripTurningPilot(path,source){
 source=stripTurnPocket(path,source);
 const record=fixture.records[path];if(!record)return source;
 assert.equal(sha(source),record.afterSHA256,'exact turning pilot candidate: '+path);
 assert.equal(sha(record.before),record.beforeSHA256,'immutable PR67 predecessor: '+path);
 return record.before;
}
export function restoreTurningSnapshot(kind,value){
 value=restoreTurnPocketSnapshot(kind,value);
 const record=fixture.snapshots[kind];if(!record)return value;
 assert.equal(sha(JSON.stringify(value)),record.afterSHA256,'exact turning pilot snapshot: '+kind);
 assert.equal(sha(JSON.stringify(record.before)),record.beforeSHA256,'immutable PR67 snapshot: '+kind);
 return structuredClone(record.before);
}
