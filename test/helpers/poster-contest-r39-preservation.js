import{stripPosterContestR40,restorePosterContestR40Snapshot}from'./poster-contest-r40-preservation.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const f=JSON.parse(readFileSync(new URL('../fixtures/poster-contest-r39-deltas.json',import.meta.url))),sha=x=>createHash('sha256').update(x).digest('hex');
export function stripPosterContestR39(path,source){source=stripPosterContestR40(path,source);const r=f.records[path];if(!r)return source;const s=String(source).replaceAll('\r\n','\n');if(sha(s)!==r.afterSHA256)return source;assert.equal(sha(r.before),r.beforeSHA256);return r.before;}
export function restorePosterContestR39Snapshot(kind,value){value=restorePosterContestR40Snapshot(kind,value);const r=f.snapshots[kind];if(!r||sha(JSON.stringify(value))!==r.afterSHA256)return value;const restored=structuredClone(value);for(const patch of r.patches){let parent=restored;for(const k of patch.path.slice(0,-1))parent=parent[k];const key=patch.path.at(-1);if(patch.exists)parent[key]=structuredClone(patch.before);else delete parent[key];}assert.equal(sha(JSON.stringify(restored)),r.beforeSHA256,'exact R39 snapshot inverse');return restored;}
