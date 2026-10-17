import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/turn-pocket-deltas.json',import.meta.url)));
const sha=value=>createHash('sha256').update(value).digest('hex');
export function stripTurnPocket(path,source){
 const record=fixture.records[path];if(!record)return source;
 assert.equal(sha(source),record.afterSHA256,'exact turning pilot candidate (c05 inverse): '+path);
 assert.equal(sha(record.before),record.beforeSHA256,'immutable PR68 predecessor: '+path);
 return record.before;
}
export function restoreTurnPocketSnapshot(kind,value){
 const record=fixture.snapshots[kind];if(!record)return value;
 assert.equal(sha(JSON.stringify(value)),record.afterSHA256,'exact turning pilot snapshot (c05 inverse): '+kind);
 assert.equal(sha(JSON.stringify(record.before)),record.beforeSHA256,'immutable PR68 snapshot: '+kind);
 return structuredClone(record.before);
}
