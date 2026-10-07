import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { requireEnvironment, readHiddenKey } from '../tools/ludo-api.mjs';
import { EventEmitter } from 'node:events';
import { pricingFromSpec, sha256 } from '../tools/ludo-api-client.mjs';
import { validateWindowsACL, windowsACL, assertPrivate, privateDirectory, gitDirectory, privateReferencePath, assertNoLinks, protectExistingState } from '../tools/ludo-private-state.mjs';

const spec = description => ({ info: { version: '0.9.10' }, components: { schemas: { AnimateSpritePayload: { properties: { model: { description } } } } } });
const current = '- "hydra" (Hydra): 3 credits/s, shortest duration 3s, so 9 credits minimum';
test('Current explicit minimum and historical pricing retain original-description binding', () => {
  for (const line of [current, current + ' · Most capable all-around model, generates audio', '- "hydra" (Hydra): 3 credits/s, min charge 9 credits']) {
    const p = pricingFromSpec(spec(line), 'hydra', 3.5);
    assert.equal(p.rate, 3); assert.equal(p.minimum, 9); assert.equal(p.estimatedCredits, 10.5);
    assert.equal(p.descriptionSHA256, sha256(line));
  }
});
test('PC environment requires exact canonical primary and linked worktree ownership; VPS host is not spoofed', () => {
  if (process.platform === 'win32') {
    const root = process.cwd();
    const run = (command, args, options) => execFileSync(command, ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], options);
    assert.match(requireEnvironment(root, run, 'actual-PC', 'win32').branch, /^feat\//);
    for (const change of [args => args[0] === 'remote' ? 'foreign' : null,
      args => args[0] === 'branch' ? 'master' : null,
      args => args.includes('--git-common-dir') ? 'C:/wrong/.git' : null,
      args => args.includes('--absolute-git-dir') ? 'C:/wrong/.git' : null]) {
      assert.throws(() => requireEnvironment(root, (c, a, o) => change(a) ?? run(c, a, o), 'actual-PC', 'win32'));
    }
    assert.throws(() => requireEnvironment(root, run, 'actual-PC', 'linux'), /Wrong/);
  } else {
    assert.throws(() => requireEnvironment('/home/ZeShad/baim', () => 'foreign', 'actual-PC', 'linux'), /Wrong/);
  }
});
test('Pricing fails closed for inconsistent, ambiguous, unknown, unbounded or undocumented minimums', () => {
  for (const line of [current + '\n' + current, current + ' discount available', current.replace('9 credits', '8 credits'),
    current.replace('3s,', '1s,'), current.replace('Hydra', 'Forge'), current.replace('3 credits/s', 'NaN credits/s'),
    current.replace('3 credits/s', '999999999 credits/s'), current.replace('3 credits/s', '0 credits/s'),
    current.replace('3 credits/s', '3..0 credits/s'), current.replace('shortest duration', 'typical duration')]) {
    assert.throws(() => pricingFromSpec(spec(line), 'hydra', 3), /Cannot verify/);
  }
  assert.throws(() => pricingFromSpec(spec('- "forge" (Forge): 1.5 credits/s'), 'forge', 1), /Cannot verify/);
  for (const duration of [NaN, Infinity, -1, 6, '3']) assert.throws(() => pricingFromSpec(spec(current), 'hydra', duration));
});

const sid = 'S-1-5-21-1-2-3-1001';
const acl = () => ({ current: sid, owner: sid, protected: true, rules: [{ sid, allow: true, inherited: false, rights: 2032127 }, { sid: 'S-1-5-18', allow: true, rights: 2032127 }] });
test('Windows privacy checks actual SID grants, protection, ownership and full access', () => {
  validateWindowsACL(acl());
  for (const mutate of [v => v.protected = false, v => v.owner = 'other', v => v.rules.push({ sid: 'S-1-1-0', allow: true }),
    v => v.rules[0].rights = 1, v => v.rules[0].allow = false, v => v.rules = []]) {
    const v = acl(); mutate(v); assert.throws(() => validateWindowsACL(v), /ACL/);
  }
  assert.throws(() => windowsACL('fixture', false, () => { throw new Error('private details'); }), /Cannot establish/);
});
test('Hidden terminal input never echoes a key, handles cancellation and restores raw mode', async () => {
  const input = new EventEmitter(); let output = '';
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; }, resume() {}, pause() {}, setEncoding() {} });
  const sink = { write(value) { output += value; } };
  const reading = readHiddenKey(input, sink); input.emit('data', 'fixturex\b-key\r');
  assert.equal(await reading, 'fixture-key'); assert.equal(input.isRaw, false); assert.equal(input.listenerCount('data'), 0);
  assert.equal(output.includes('fixture'), false);
  input.isRaw = true;
  const cancelled = readHiddenKey(input, sink); input.emit('data', '\u0003');
  await assert.rejects(cancelled, /cancelled/); assert.equal(input.isRaw, true);
  await assert.rejects(readHiddenKey({ isTTY: false }, sink), /interactive/);
});
test('Real private directory ACL and worktree reference routing avoid public and hardlink escapes', () => {
  const root = mkdtempSync(join(tmpdir(), 'baim-portable-'));
  try {
    const git = join(root, 'primary/.git'), work = join(root, 'work');
    mkdirSync(git, { recursive: true }); mkdirSync(work);
    const dir = join(git, 'worktrees/task'); mkdirSync(dir, { recursive: true });
    writeFileSync(join(work, '.git'), `gitdir: ${dir}\n`);
    assert.equal(gitDirectory(work), dir);
    privateDirectory(dir, join(dir, 'ludo-api/task-c01'));
    assertPrivate(join(dir, 'ludo-api/task-c01'));
    const logical = `.git/ludo-api/task-c01/reference-${'a'.repeat(64)}.png`;
    assert.equal(privateReferencePath(work, logical), join(dir, 'ludo-api/task-c01', `reference-${'a'.repeat(64)}.png`));
    assert.throws(() => privateReferencePath(work, '.git/ludo-api/key'));
    assert.throws(() => privateDirectory(dir, join(root, 'escape')));
    const file = join(dir, 'ludo-api/task-c01/file'); writeFileSync(file, 'fixture', { mode: 0o600 });
    if (process.platform === 'win32') windowsACL(file, true);
    assertPrivate(file); linkSync(file, join(dir, 'alias')); assert.throws(() => assertPrivate(file), /Unsafe/);
    assert.equal(assertNoLinks(work), work);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
const inspectACL = path => windowsACL(path, false, execFileSync, { inspectOnly: true });
const snapshotACL = path => {
  const value = inspectACL(path);
  return { owner: value.owner, current: value.current, protected: value.protected,
    rules: value.rules.map(({ sid, allow, inherited, rights }) => ({ sid, allow, inherited, rights }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
};
test('Explicit migrated-state protection preserves records and rejects unsafe trees before mutation', t => {
  const root = mkdtempSync(join(tmpdir(), 'baim-acl-migration-'));
  try {
    const file = join(root, 'plan.json'); writeFileSync(file, '{"requestId":"preserved"}', { flag: 'wx' });
    if (process.platform === 'win32') {
      const initial = snapshotACL(root), initialFile = snapshotACL(file), before = sha256(readFileSync(file));
      t.diagnostic(`New disposable fixture ownership: ${JSON.stringify({ owner: initial.owner, current: initial.current })}`);
      if (initial.owner !== initial.current) {
        assert.throws(() => protectExistingState(root), /belongs to another Windows account/);
        assert.deepEqual(snapshotACL(root), initial);
        assert.deepEqual(snapshotACL(file), initialFile);
        assert.equal(sha256(readFileSync(file)), before);
      }
      // This fixture was just created by this test. Establish its owner explicitly
      // even when an elevated token chose a different default owner SID. Never
      // adopt an existing/migrated state path or change the production guard.
      windowsACL(root, true); windowsACL(file, true);
      const owned = snapshotACL(root), ownedFile = snapshotACL(file);
      assert.equal(owned.owner, owned.current); assert.equal(ownedFile.owner, ownedFile.current);
      linkSync(file, join(root, 'alias'));
      assert.throws(() => protectExistingState(root), /Unsafe/);
      assert.deepEqual(snapshotACL(root), owned);
      assert.deepEqual(snapshotACL(file), ownedFile);
      assert.equal(sha256(readFileSync(file)), before);
      rmSync(join(root, 'alias'));
      assert.equal(protectExistingState(root), 2);
      assertPrivate(root); assertPrivate(file);
      assert.equal(sha256(readFileSync(file)), before);
    } else assert.throws(() => protectExistingState(root), /Windows-only/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Foreign child ownership rejects the whole tree before any ACL or record mutation', t => {
  const root = mkdtempSync(join(tmpdir(), 'baim-acl-foreign-'));
  try {
    if (process.platform !== 'win32') {
      assert.throws(() => protectExistingState(root), /Windows-only/); return;
    }
    windowsACL(root, true);
    const file = join(root, 'job.json'); writeFileSync(file, '{"requestId":"consumed","status":"submission-uncertain"}', { flag: 'wx' });
    windowsACL(file, true);
    const before = sha256(readFileSync(file)), rootACL = snapshotACL(root), fileACL = snapshotACL(file);
    const nativeRun = childProcess.execFileSync;
    let inspections = 0, writes = 0;
    // Supply a synthetic foreign owner only in the native inspection response.
    // This tests the real whole-tree preflight without taking another account's
    // files or requiring permission to assign an arbitrary foreign SID.
    const mocked = t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
      const script = Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
      if (script.includes('$item.SetAccessControl')) { writes++; throw new Error('Rejected tree must not write ACLs'); }
      inspections++;
      const value = JSON.parse(nativeRun(command, args, options));
      if (script.includes(`$p='${file.replaceAll("'", "''")}'`)) value.owner = 'synthetic-foreign-owner';
      return JSON.stringify(value);
    });
    syncBuiltinESMExports();
    try {
      assert.throws(() => protectExistingState(root), /belongs to another Windows account/);
      assert.equal(inspections, 2); assert.equal(writes, 0);
    } finally { mocked.mock.restore(); syncBuiltinESMExports(); }
    assert.deepEqual(snapshotACL(root), rootACL); assert.deepEqual(snapshotACL(file), fileACL);
    assert.equal(sha256(readFileSync(file)), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
