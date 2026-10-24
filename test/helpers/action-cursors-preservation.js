import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/action-cursors-deltas.json', import.meta.url)));
const sha = value => createHash('sha256').update(value).digest('hex');
export function stripActionCursors(path, source, allowOtherHistory = false) {
  const record = fixture.records[path];
  if (!record) return source;
  const originalSource = source;
  source = String(source).replaceAll('\r\n', '\n');
  if (sha(source) === record.beforeSHA256) return source;
  if (allowOtherHistory && sha(source) !== record.afterSHA256) return originalSource;
  assert.equal(sha(source), record.afterSHA256, 'exact action cursor inverse: ' + path);
  assert.equal(sha(record.before), record.beforeSHA256);
  return record.before;
}
export function restoreActionCursorsSnapshot(kind, value, allowOtherHistory = false) {
  const record = fixture.snapshots?.[kind];
  const hash = sha(JSON.stringify(value));
  if (!record || hash === record.beforeSHA256) return value;
  if (allowOtherHistory && hash !== record.afterSHA256) return value;
  assert.equal(hash, record.afterSHA256, 'exact scene fix action cursor snapshot: ' + kind);
  assert.equal(sha(JSON.stringify(record.before)), record.beforeSHA256);
  return structuredClone(record.before);
}
