import{stripPosterContestR45,restorePosterContestR45Snapshot}from'./poster-contest-r45-preservation.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const f=JSON.parse(readFileSync(new URL('../fixtures/poster-contest-r44-deltas.json',import.meta.url))),sha=x=>createHash('sha256').update(x).digest('hex');
export function stripPosterContestR44(path,source){source=stripPosterContestR45(path,source);const r=f.records[path];if(!r)return source;const s=String(source).replaceAll('\r\n','\n');if(sha(s)!==r.afterSHA256)return source;assert.equal(sha(r.before),r.beforeSHA256);return r.before;}
export function restorePosterContestR44Snapshot(kind,value){value=restorePosterContestR45Snapshot(kind,value);const r=f.snapshots[kind];if(!r||sha(JSON.stringify(value))!==r.afterSHA256)return value;const v=structuredClone(value);for(const p of r.patches){let parent=v;for(const k of p.path.slice(0,-1))parent=parent[k];if(p.exists)parent[p.path.at(-1)]=structuredClone(p.before);else delete parent[p.path.at(-1)];}assert.equal(sha(JSON.stringify(v)),r.beforeSHA256,'Exact R44 inverse');return v;}
