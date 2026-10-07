import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import sharp from 'sharp';
import { LudoClient, validateCandidate, pricingFromSpec, makePayload, referenceData, sha256, artifactURL, downloadSheet, normalizeSheet, deriveAtlas, submitWithIntent, verifyApproval } from '../tools/ludo-api-client.mjs';
import { requireEnvironment } from '../tools/ludo-api.mjs';
import { isPublicFile } from '../tools/private-file-guard.mjs';

const candidate = () => ({ label: 'tony-test-c01', reference: 'assets_src/characters/tony_fridge/ref.png', referenceSHA256: 'a'.repeat(64),
  sourceDir: 'assets_src/characters/tony_fridge/external_animation_v1/input', motionPrompt: 'A brief skeptical glance.',
  model: 'hydra', duration: 3, frames: 25, frameSize: 384, loop: false });
const spec = { info: { version: 'fixture' }, components: { schemas: { AnimateSpritePayload: { properties: { model: {
  description: '- "hydra" (Hydra): 3 credits/s, min charge 9 credits\n- "forge" (Forge): 1.5 credits/s, min charge 4 credits' } } } } } };

test('Ludo pilot validates explicit painted-art settings and rejects expanded capabilities', () => {
  assert.equal(validateCandidate(candidate()).label, 'tony-test-c01');
  for (const change of [{ model: 'forge-pixel' }, { duration: 1 }, { frameSize: -1 }, { loop: undefined }, { frames: 100 },
    { referenceSHA256: 'wrong' }, { finalReference: 'x' }, { label: '../escape' }, { batch: 3 }]) {
    assert.throws(() => validateCandidate({ ...candidate(), ...change }));
  }
});

test('Ludo pilot pricing follows current documented rates and minimums, not an assumed web cost', () => {
  assert.equal(pricingFromSpec(spec, 'hydra', 3).estimatedCredits, 9);
  assert.equal(pricingFromSpec(spec, 'forge', 1).estimatedCredits, 4);
  assert.equal(pricingFromSpec(spec, 'forge', 3.5).estimatedCredits, 5.3);
  assert.throws(() => pricingFromSpec({}, 'hydra', 3), /Cannot verify/);
});

test('Ludo spending gate rejects absent approval, changed plans/pricing and insufficient caps', () => {
  const pricing = pricingFromSpec(spec, 'hydra', 3), plan = { config: candidate(), pricing };
  const digest = sha256(`${JSON.stringify(plan, null, 2)}\n`), flags = ['--approve-plan', digest, '--max-credits', '9'];
  assert.equal(verifyApproval(plan, flags, pricing), 9);
  assert.throws(() => verifyApproval(plan, [], pricing), /required/);
  assert.throws(() => verifyApproval({ ...plan, config: { ...candidate(), frames: 36 } }, flags, pricing), /changed/);
  assert.throws(() => verifyApproval(plan, flags, { ...pricing, descriptionSHA256: 'changed' }), /Pricing changed/);
  assert.throws(() => verifyApproval(plan, ['--approve-plan', digest, '--max-credits', '8'], pricing), /exceeds/);
});

test('Ludo payload pins async request identity, framing and explicit loop/crop settings', () => {
  const payload = makePayload(candidate(), { initial: 'first', final: 'last' }, 'saved-id');
  assert.equal(payload.request_id, 'saved-id'); assert.equal(payload.async, true);
  assert.equal(payload.crop, false); assert.equal(payload.loop, false);
  assert.equal(payload.margin_ratio_mode, 'auto'); assert.equal(payload.augment_prompt, true);
  assert.equal(payload.final_image, 'last'); assert.equal(payload.individual_frames, false);
});

test('Ludo reference validation refuses changed bytes and non-alpha images', async () => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  assert.match(await referenceData(bytes, sha256(bytes)), /^data:image\/png;base64,/);
  await assert.rejects(referenceData(bytes, 'a'.repeat(64)), /hash/);
  const opaque = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(referenceData(opaque, sha256(opaque)), /transparent PNG/);
});

test('Ludo paid submission saves exclusive intent first and never retries after connection loss', async () => {
  let intent, posts = 0;
  const client = new LudoClient('fixture-not-a-real-key', async () => { posts++; assert.ok(intent); throw new Error('private transport details'); });
  const create = value => { if (intent) throw new Error('existing intent'); intent = { ...value }; };
  await assert.rejects(submitWithIntent(client, { request_id: 'fixed' }, { requestId: 'fixed' }, create, () => {}), /connection interrupted/);
  assert.equal(posts, 1); assert.equal(intent.requestId, 'fixed');
  await assert.rejects(submitWithIntent(client, {}, {}, create, () => {}), /existing intent/);
  assert.equal(posts, 1);
});

test('Ludo header job ID survives malformed response and secret response details are not logged', async () => {
  let saved;
  const client = new LudoClient('fixture-not-a-real-key', async () => new Response('not-json', { status: 202, headers: { 'X-Ludo-Job-Id': 'job-123' } }));
  await assert.rejects(submitWithIntent(client, {}, {}, () => {}, state => { saved = { ...state }; }), /Malformed/);
  assert.equal(saved.id, 'job-123');
  const denied = new LudoClient('fixture-not-a-real-key', async () => new Response('SECRET RESPONSE CONTENT', { status: 403 }));
  await assert.rejects(denied.check(), error => /HTTP 403/.test(error.message) && !error.message.includes('SECRET'));
});

test('Ludo recovery/auth operations use only authenticated GETs and correct saved IDs', async () => {
  const calls = [];
  const client = new LudoClient('fixture-not-a-real-key', async (url, options) => {
    calls.push({ url: String(url), ...options }); return new Response('{}', { status: 200 });
  });
  await client.check(); await client.job('job-1'); await client.jobs(); await client.results('request-1');
  assert.ok(calls.every(call => call.method === 'GET' && call.headers.Authorization === 'ApiKey fixture-not-a-real-key'));
  assert.match(calls[1].url, /jobs\/job-1\?wait=30$/); assert.match(calls[3].url, /request_id=request-1&source=api/);
  assert.throws(() => client.job('../x'), /Invalid job ID/);
});

test('Ludo rate-limit response stops instead of automatically retrying a paid call', async () => {
  let calls = 0;
  const client = new LudoClient('fixture-not-a-real-key', async () => { calls++; return new Response('{}', { status: 429, headers: { 'retry-after': '30' } }); });
  await assert.rejects(client.submit({}), /wait 30/); assert.equal(calls, 1);
});

test('Ludo API credentials cannot be redirected to an arbitrary origin by a request path', async () => {
  let calls = 0;
  const client = new LudoClient('fixture-not-a-real-key', async () => { calls++; return new Response('{}'); });
  await assert.rejects(client.request('https://example.test/steal'), /official Ludo API/);
  await assert.rejects(client.request('/other'), /official Ludo API/);
  assert.equal(calls, 0);
});

test('Ludo artifact downloads never forward API credentials and reject unsafe hosts/redirects', async () => {
  for (const url of ['http://storage.googleapis.com/x', 'https://127.0.0.1/x', 'https://storage.googleapis.com.evil.test/x', 'https://user:pass@ludo.ai/x', 'https://ludo.ai:8443/x']) {
    assert.throws(() => artifactURL(url));
  }
  const bytes = await downloadSheet('https://storage.googleapis.com/ludo-assets/x.png', async (_url, options) => {
    assert.equal(options.headers, undefined); return new Response(Buffer.from('original-bytes'));
  });
  assert.equal(bytes.toString(), 'original-bytes');
  await assert.rejects(downloadSheet('https://storage.googleapis.com/x', async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } })), /host is not approved/);
});

test('Ludo native WebP normalization preserves decoded pixels, geometry, alpha and original hash', async () => {
  const raw = Buffer.alloc(8 * 8 * 4); raw.set([255, 100, 50, 255], 0);
  const webp = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).webp({ lossless: true }).toBuffer();
  const normalized = await normalizeSheet(webp);
  assert.equal(normalized.nativeFormat, 'webp'); assert.equal(normalized.nativeSHA256, sha256(webp));
  assert.equal((await sharp(normalized.bytes).metadata()).format, 'png');
  assert.deepEqual(await sharp(normalized.bytes).raw().toBuffer(), await sharp(webp).raw().toBuffer());
  assert.equal((await deriveAtlas(normalized.bytes, { num_frames: 4, num_cols: 2, num_rows: 2, duration: 1 })).frames.length, 4);
});

test('Ludo sheet normalization keeps original PNG bytes and rejects opaque or foreign formats', async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  assert.equal((await normalizeSheet(png)).bytes, png);
  const opaque = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).webp().toBuffer();
  await assert.rejects(normalizeSheet(opaque), /single-page transparent/);
  const gif = await sharp(png).gif().toBuffer();
  await assert.rejects(normalizeSheet(gif), /single-page transparent/);
});

test('Ludo derived atlas uses returned geometry and explicitly labels inferred uniform timing', async () => {
  const raw = Buffer.alloc(8 * 8 * 4); raw.set([255, 100, 50, 255], 0);
  const png = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
  const atlas = await deriveAtlas(png, { num_frames: 4, num_cols: 2, num_rows: 2, duration: 0.8 });
  assert.equal(atlas.frames.length, 4); assert.equal(atlas.frames[3].duration, 200);
  assert.deepEqual(atlas.frames[3].frame, { x: 4, y: 4, w: 4, h: 4 });
  assert.equal(atlas.meta.timingOrigin, 'derived-uniform-from-api-duration');
  await assert.rejects(deriveAtlas(png, { num_frames: 4, num_cols: 3, num_rows: 2, duration: 0.8 }), /geometry/);
  await assert.rejects(deriveAtlas(png, { num_frames: 4, num_cols: 2, num_rows: 2 }), /duration/);
});

test('Ludo environment gate refuses master, foreign host/path and noncanonical remote', () => {
  const run = (_command, args) => args[0] === 'remote' ? 'https://github.com/tran4o/baim.git\n' : args[0] === 'branch' ? 'feat/test\n' : args[1] === '--show-toplevel' ? '/home/ZeShad/baim\n' : 'base\n';
  assert.equal(requireEnvironment('/home/ZeShad/baim', run, 'vps-b30ffe96', 'linux').branch, 'feat/test');
  assert.throws(() => requireEnvironment('/home/ubuntu/git/baim', run, 'vps-b30ffe96', 'linux'), /Wrong/);
  assert.throws(() => requireEnvironment('/home/ZeShad/baim', run, 'other-host', 'linux'), /Wrong/);
  assert.throws(() => requireEnvironment('/home/ZeShad/baim', (_c, args) => args[0] === 'branch' ? 'master' : run(_c, args), 'vps-b30ffe96', 'linux'), /never master/);
  assert.throws(() => requireEnvironment('/home/ZeShad/baim', (_c, args) => args[0] === 'remote' ? 'other-repo' : run(_c, args), 'vps-b30ffe96', 'linux'), /Wrong/);
});

test('Preview file guard blocks private state, dotfiles and aliases into private/outside files', () => {
  const root = mkdtempSync(join(tmpdir(), 'baim-private-'));
  const outside = mkdtempSync(join(tmpdir(), 'baim-outside-'));
  try {
    mkdirSync(join(root, '.git/ludo-api'), { recursive: true }); mkdirSync(join(root, 'target/ludo-api'), { recursive: true });
    writeFileSync(join(root, '.git/ludo-api/key'), 'non-secret fixture'); writeFileSync(join(root, 'target/ludo-api/plan.json'), '{}');
    writeFileSync(join(root, '.env'), 'non-secret fixture'); writeFileSync(join(root, 'index.html'), 'public');
    writeFileSync(join(outside, 'secret'), 'non-secret fixture');
    symlinkSync(join(root, '.git/ludo-api/key'), join(root, 'alias.txt')); symlinkSync(join(outside, 'secret'), join(root, 'external.txt'));
    assert.equal(isPublicFile(root, join(root, 'index.html')), true);
    for (const path of ['.git/ludo-api/key', 'target/ludo-api/plan.json', '.env', 'alias.txt', 'external.txt']) assert.equal(isPublicFile(root, join(root, path)), false);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('Actual preview HTTP server blocks existing encoded private files while serving public content', async t => {
  const root = mkdtempSync(join(tmpdir(), 'baim-api-http-'));
  mkdirSync(join(root, 'tools')); mkdirSync(join(root, '.git/ludo-api'), { recursive: true }); mkdirSync(join(root, 'target/ludo-api'), { recursive: true });
  copyFileSync(new URL('../tools/dev-server.mjs', import.meta.url), join(root, 'tools/dev-server.mjs'));
  copyFileSync(new URL('../tools/private-file-guard.mjs', import.meta.url), join(root, 'tools/private-file-guard.mjs'));
  writeFileSync(join(root, 'index.html'), 'public fixture'); writeFileSync(join(root, '.git/ludo-api/key'), 'non-secret fixture');
  writeFileSync(join(root, 'target/ludo-api/plan.json'), '{}');
  const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  const processHandle = spawn(process.execPath, [join(root, 'tools/dev-server.mjs')], { cwd: root, env: { ...process.env, PORT: String(port), HTTPS: '0' }, stdio: 'ignore' });
  t.after(async () => { const stopped = new Promise(resolve => processHandle.once('exit', resolve)); processHandle.kill(); if (processHandle.exitCode === null) await stopped; rmSync(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${port}`;
  for (let tries = 0; tries < 50; tries++) { try { await fetch(origin); break; } catch { await new Promise(resolve => setTimeout(resolve, 40)); } }
  assert.equal((await fetch(origin)).status, 200);
  for (const path of ['/.git/ludo-api/key', '/%2egit/ludo-api/key', '/target/ludo-api/plan.json', '/%ZZ']) assert.equal((await fetch(origin + path)).status, 404);
});

test('Ludo workflow keeps setup distinct from spending, collection distinct from runtime, and derived timing explicit', () => {
  const doc = readFileSync(new URL('../docs/ludo-api-pilot.md', import.meta.url), 'utf8');
  assert.match(doc, /No real generation is authorized/); assert.match(doc, /existing Stage 2/);
  assert.match(doc, /not a server-enforced billing limit/); assert.match(doc, /derived-atlas.json/);
  assert.match(doc, /not a runnable animation/);
});
