import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const additions=JSON.parse(readFileSync(new URL('../fixtures/kiro-oil-integration-additions.json',import.meta.url)));
// Remove only exact, hash-bound oil integration deltas before ORIGINAL Baba comparisons.
// Original Baba baseline and its hashes remain immutable.
export function stripKiroOilIntegration(path,source){
 const record=additions[path];if(!record)return source;
 source=source.toString();
 for(const patch of record.patches){
  assert.equal(createHash('sha256').update(patch.after).digest('hex'),patch.afterSHA256);
  assert.equal(source.split(patch.after).length,2,'exact oil integration addition: '+path);
  source=source.replace(patch.after,patch.before);
 }
 return source;
}
