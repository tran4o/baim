import {stripRefusalApproachR19} from './refusal-approach-r19-preservation.js';
import {stripWardrobeQuestR20,restoreWardrobeQuestR20Snapshot} from './wardrobe-quest-r20-preservation.js';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const f=JSON.parse(readFileSync(new URL('../fixtures/interaction-facing-r18-deltas.json',import.meta.url))),sha=x=>createHash('sha256').update(x).digest('hex');
export function stripInteractionFacingR18(path,source,strict=false){source=stripWardrobeQuestR20(path,source);source=stripRefusalApproachR19(path,source);const r=f.records[path];if(!r)return source;const s=String(source).replaceAll('\r\n','\n');if(sha(s)!==r.afterSHA256){if(strict)assert.equal(sha(s),r.beforeSHA256,'unbound interaction r18 source: '+path);return source;}assert.equal(sha(r.before),r.beforeSHA256);return r.before;}
export function restoreInteractionFacingR18Snapshot(kind,value){value=restoreWardrobeQuestR20Snapshot(kind,value);const r=f.snapshots[kind];if(!r||sha(JSON.stringify(value))!==r.afterSHA256)return value;assert.equal(sha(JSON.stringify(r.before)),r.beforeSHA256);return structuredClone(r.before);}
