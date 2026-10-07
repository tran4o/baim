import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { privateDirectory } from '../tools/ludo-private-state.mjs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { referenceConstraints, referenceSize, prepareReferences, validateReferences, decodeReference, readReferenceFile } from '../tools/ludo-reference.mjs';
import { buildPlan, approvedPayload } from '../tools/ludo-api.mjs';
import { sha256, submitWithIntent } from '../tools/ludo-api-client.mjs';

const spec = { info: { version: 'fixture' }, components: { schemas: { AnimateSpritePayload: { properties: {
  model: { enum: ['hydra', 'forge'], description: '- "hydra" (Hydra): 3 credits/s, min charge 9 credits\n- "forge" (Forge): 1.5 credits/s, min charge 4 credits' },
  duration: { description: '- hydra: 3, 3.5, 4, 4.5, 5\n- forge: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5' },
  frame_size: { enum: [-9, 0, 384], description: '-9 is True Size' }, frames: { enum: [25, 36] },
  margin_ratio_mode: { enum: ['auto'] }, initial_image: {}, final_image: {}, crop: {}, loop: {}
} } } } };
const png = (width, height, background = { r: 30, g: 120, b: 220, alpha: 0.5 }) =>
  sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
async function fixture(t, width = 981, height = 1604) {
  const root = mkdtempSync(join(tmpdir(), 'ludo-ref-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const label = 'future-animation-c01', reference = 'assets_src/characters/example/external_animation_v1/references/approved.png';
  mkdirSync(join(root, 'assets_src/characters/example/external_animation_v1/references'), { recursive: true });
  mkdirSync(join(root, '.git'));
  privateDirectory(join(root, '.git'), join(root, `.git/ludo-api/${label}`));
  const bytes = await png(width, height); writeFileSync(join(root, reference), bytes);
  const config = { label, reference, referenceSHA256: sha256(bytes), finalReference: reference, finalReferenceSHA256: sha256(bytes),
    sourceDir: 'assets_src/characters/example/external_animation_v1/input', motionPrompt: 'A calm seated nod then settle.',
    model: 'hydra', duration: 3, frames: 36, frameSize: -9, loop: false };
  return { root, config, bytes };
}
const flags = plan => ['--approve-plan', sha256(`${JSON.stringify(plan, null, 2)}\n`), '--max-credits', '9'];
const make = f => buildPlan(f.config, { branch: 'feat/ludo-reference-autosizing', base: 'fixture' }, spec, f.root);

test('Baba-sized True Size input automatically produces one shared full-canvas derivative before plan hashing', async t => {
  const f = await fixture(t), before = readFileSync(join(f.root, f.config.reference));
  const plan = await make(f), { initial, final } = plan.referencePreparation.references;
  assert.equal(initial.original.width, 981); assert.equal(initial.original.height, 1604);
  assert.ok(initial.prepared.pixels < 1_000_000); assert.ok(initial.prepared.pixels <= 990_000);
  assert.deepEqual(initial.prepared, final.prepared);
  assert.equal(readdirSync(join(f.root, `.git/ludo-api/${f.config.label}`)).length, 1);
  assert.deepEqual(readFileSync(join(f.root, f.config.reference)), before);
  assert.deepEqual(plan.config, f.config); assert.equal(initial.transformation.lossless, false);
  assert.match(plan.referencePreparation.note, /Automatic API reference resize/);
  const { payload } = await approvedPayload(plan, flags(plan), spec, f.root);
  assert.equal(payload.initial_image, payload.final_image); assert.equal(payload.frame_size, -9);
  assert.equal(payload.crop, false); assert.equal(payload.duration, 3); assert.equal(payload.loop, false);
});

test('strict boundary and rounding policy covers below, exactly and above one megapixel without upscaling', () => {
  const constraints = referenceConstraints(spec, { model: 'hydra', frameSize: -9, duration: 3, frames: 36 });
  for (const [w, h] of [[999, 1000], [1000, 1000], [1001, 1000], [981, 1604], [16384, 61], [1, 1]]) {
    const out = referenceSize(w, h, constraints);
    assert.ok(out.width <= w && out.height <= h); assert.ok(out.width * out.height < 1_000_000);
    if (w * h < 1_000_000) assert.deepEqual(out, { width: w, height: h, scale: 1 });
    else { assert.equal(out.width, Math.floor(w * out.scale)); assert.equal(out.height, Math.floor(h * out.scale)); }
  }
  assert.throws(() => referenceSize(1, 16_000_000, constraints), /proportionally/);
});

test('actual decoded exact-limit input is resized and compatible input retains identical original bytes/path', async t => {
  for (const [w, h] of [[1000, 1000], [999, 1000], [7, 13]]) {
    const f = await fixture(t, w, h), prep = await prepareReferences(f.config, spec, f.root), entry = prep.references.initial;
    assert.ok(entry.prepared.pixels < 1_000_000);
    if (w * h < 1_000_000) {
      assert.deepEqual(entry.prepared, entry.original); assert.equal(entry.transformation.kind, 'unchanged');
      assert.equal(readdirSync(join(f.root, `.git/ludo-api/${f.config.label}`)).length, 0);
    } else assert.equal(entry.transformation.kind, 'proportional-downscale');
  }
});

test('resampling retains alpha, canvas edges, colors and relative position within integer rounding', async t => {
  const f = await fixture(t);
  const raw = Buffer.alloc(981 * 1604 * 4);
  const paint = (x0, y0, w, h, color) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) raw.set(color, (y * 981 + x) * 4); };
  paint(0, 0, 80, 80, [220, 40, 90, 255]); paint(901, 1524, 80, 80, [30, 180, 80, 255]);
  paint(300, 400, 100, 100, [80, 100, 190, 128]);
  const input = await sharp(raw, { raw: { width: 981, height: 1604, channels: 4 } }).png().toBuffer();
  writeFileSync(join(f.root, f.config.reference), input); f.config.referenceSHA256 = f.config.finalReferenceSHA256 = sha256(input);
  const prep = await prepareReferences(f.config, spec, f.root), entry = prep.references.initial;
  const { data, info } = await sharp(readFileSync(join(f.root, entry.prepared.path))).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.deepEqual(pixel(0, 0), [220, 40, 90, 255]); assert.deepEqual(pixel(info.width - 1, info.height - 1), [30, 180, 80, 255]);
  assert.equal(pixel(info.width / 2 | 0, info.height / 2 | 0)[3], 0);
  assert.deepEqual(pixel(Math.floor(350 * entry.transformation.scale), Math.floor(450 * entry.transformation.scale)), [79, 99, 189, 128]);
  assert.ok(Math.abs(info.width / info.height - 981 / 1604) < 1 / info.height);
});

test('different images on matching canvases receive matching transforms; differing canvases fail before writes', async t => {
  const f = await fixture(t), finalPath = f.config.reference.replace('approved', 'final');
  const different = await png(981, 1604, { r: 200, g: 20, b: 50, alpha: 0.5 });
  writeFileSync(join(f.root, finalPath), different); f.config.finalReference = finalPath; f.config.finalReferenceSHA256 = sha256(different);
  const plan = await make(f), a = plan.referencePreparation.references.initial, b = plan.referencePreparation.references.final;
  assert.deepEqual(a.transformation, b.transformation); assert.equal(a.prepared.width, b.prepared.width);
  assert.notEqual(a.prepared.sha256, b.prepared.sha256); await validateReferences(plan, spec, f.root);
  const wrong = await png(981, 1603); writeFileSync(join(f.root, finalPath), wrong); f.config.finalReferenceSHA256 = sha256(wrong);
  await assert.rejects(make(f), /canvases differ/);
});

test('identical source bytes from separate paths share a resized derivative', async t => {
  const f = await fixture(t); f.config.finalReference = f.config.reference.replace('approved', 'copy');
  writeFileSync(join(f.root, f.config.finalReference), f.bytes);
  const plan = await make(f); assert.deepEqual(plan.referencePreparation.references.initial.prepared, plan.referencePreparation.references.final.prepared);
  await validateReferences(plan, spec, f.root);
});

test('fixed export sizes do not invent input limits or upscale approved input', async t => {
  const f = await fixture(t); f.config.frameSize = 384;
  const plan = await make(f); assert.equal(plan.referencePreparation.references.initial.transformation.kind, 'unchanged');
  const { payload } = await approvedPayload(plan, flags(plan), spec, f.root); assert.equal(payload.frame_size, 384);
});

test('the shared preparation supports future Forge tasks and initial-only references', async t => {
  const f = await fixture(t); f.config.model = 'forge'; f.config.duration = 1;
  delete f.config.finalReference; delete f.config.finalReferenceSHA256;
  const plan = await make(f);
  assert.deepEqual(Object.keys(plan.referencePreparation.references), ['initial']);
  assert.equal(plan.pricing.estimatedCredits, 4);
  const { payload } = await approvedPayload(plan, flags(plan), spec, f.root);
  assert.equal(payload.model, 'forge'); assert.equal(payload.duration, 1); assert.equal(payload.final_image, undefined);
  assert.ok(plan.referencePreparation.references.initial.prepared.pixels < 1_000_000);
});

test('preparation is deterministic and does not overwrite an existing changed derivative', async t => {
  const f = await fixture(t), first = await prepareReferences(f.config, spec, f.root), again = await prepareReferences(f.config, spec, f.root);
  assert.deepEqual(first, again);
  writeFileSync(join(f.root, first.references.initial.prepared.path), 'changed');
  await assert.rejects(prepareReferences(f.config, spec, f.root), /changed/);
});

test('original or derivative mutation invalidates the approved plan before intent/POST and never regenerates', async t => {
  for (const target of ['original', 'prepared']) {
    const f = await fixture(t), plan = await make(f), approval = flags(plan), snapshot = JSON.stringify(plan);
    const entry = plan.referencePreparation.references.initial;
    writeFileSync(join(f.root, entry[target].path), Buffer.from('changed'));
    let posts = 0, intents = 0;
    await assert.rejects((async () => {
      const { payload } = await approvedPayload(plan, approval, spec, f.root);
      await submitWithIntent({ submit: async () => { posts++; } }, payload, {}, () => { intents++; }, () => {});
    })());
    assert.equal(posts, 0); assert.equal(intents, 0); assert.equal(JSON.stringify(plan), snapshot);
    assert.equal(readFileSync(join(f.root, entry[target].path)).toString(), 'changed');
  }
});

test('changed transformation/settings/path/schema bind a fresh reviewed plan', async t => {
  const f = await fixture(t), plan = await make(f), approval = flags(plan);
  for (const mutate of [p => { p.config.frameSize = 384; }, p => { p.referencePreparation.references.initial.transformation.crop = true; },
    p => { p.referencePreparation.references.initial.prepared.path = '.git/ludo-api/key'; }, p => { delete p.referencePreparation; }]) {
    const changed = structuredClone(plan); mutate(changed);
    await assert.rejects(approvedPayload(changed, approval, spec, f.root), /Plan changed/);
    await assert.rejects(validateReferences(changed, spec, f.root));
  }
  const changedSpec = structuredClone(spec); changedSpec.components.schemas.AnimateSpritePayload.properties.frame_size.description += ' changed';
  await assert.rejects(validateReferences(plan, changedSpec, f.root), /constraints/);
});

test('a reference mutated while asynchronous decoding is in flight invalidates approval before POST', async t => {
  const f = await fixture(t); delete f.config.finalReference; delete f.config.finalReferenceSHA256;
  const plan = await make(f), approval = flags(plan);
  const checking = approvedPayload(plan, approval, spec, f.root);
  // approvedPayload has read the initial bytes, then yielded to Sharp; mutate those disk bytes now.
  writeFileSync(join(f.root, f.config.reference), 'changed during decode');
  await assert.rejects(checking, /changed during validation/);
});

test('corrupt/truncated, opaque, unsupported, over-byte and image-bomb inputs fail with no prepared writes', async t => {
  const f = await fixture(t, 4, 4);
  const opaque = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).png().toBuffer();
  const webp = await sharp(f.bytes).webp().toBuffer();
  for (const bytes of [Buffer.from('invalid'), f.bytes.subarray(0, 40), opaque, webp, Buffer.alloc(15_000_001)]) {
    writeFileSync(join(f.root, f.config.reference), bytes); f.config.referenceSHA256 = f.config.finalReferenceSHA256 = sha256(bytes);
    await assert.rejects(make(f)); assert.equal(readdirSync(join(f.root, `.git/ludo-api/${f.config.label}`)).length, 0);
  }
  const bomb = await png(4001, 4000); await assert.rejects(decodeReference(bomb, sha256(bomb)), /bounded/);
});

test('original paths reject URLs, hidden/private paths, traversal and intermediate directory links', async t => {
  const f = await fixture(t, 4, 4);
  for (const path of ['https://example.test/a.png', '.git/ludo-api/key', '/assets_src/characters/a.png', 'assets_src/characters/../key',
    'assets_src/characters/.private/a.png', 'assets_src\\characters\\a.png']) assert.throws(() => readReferenceFile(f.root, path));
  symlinkSync(join(f.root, 'assets_src/characters/example'), join(f.root, 'assets_src/characters/alias'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => readReferenceFile(f.root, f.config.reference.replace('/example/', '/alias/')), /Unsafe/);
});

test('prepared links/private paths and missing derivative are rejected with no recreation', async t => {
  const f = await fixture(t), plan = await make(f), entry = plan.referencePreparation.references.initial;
  const derivative = join(f.root, entry.prepared.path); rmSync(derivative);
  await assert.rejects(validateReferences(plan, spec, f.root)); assert.equal(readdirSync(join(f.root, `.git/ludo-api/${f.config.label}`)).length, 0);
  const other = structuredClone(plan); other.referencePreparation.references.initial.prepared.path = '.git/ludo-api/key';
  await assert.rejects(validateReferences(other, spec, f.root), /Unsafe/);
});

test('unknown provider constraints stop before preparing any derivative', async t => {
  const f = await fixture(t);
  for (const change of [s => { delete s.components.schemas.AnimateSpritePayload.properties.frame_size.enum; },
    s => { s.components.schemas.AnimateSpritePayload.properties.duration.description = 'unknown'; }]) {
    const unknown = structuredClone(spec); change(unknown); await assert.rejects(makeWith(unknown));
  }
  async function makeWith(s) { return buildPlan(f.config, {}, s, f.root); }
  assert.equal(readdirSync(join(f.root, `.git/ludo-api/${f.config.label}`)).length, 0);
});

test('compatible legacy approved plan keeps its exact hash; oversized legacy plan stops without rewriting history', async t => {
  for (const [w, h] of [[7, 13], [981, 1604]]) {
    const f = await fixture(t, w, h), version2 = await make(f);
    const legacy = { config: version2.config, environment: version2.environment, requestId: version2.requestId, pricing: version2.pricing, createdAt: version2.createdAt };
    const original = JSON.stringify(legacy), approval = flags(legacy);
    if (w === 7) assert.equal((await approvedPayload(legacy, approval, spec, f.root)).cap, 9);
    else await assert.rejects(approvedPayload(legacy, approval, spec, f.root), /Legacy/);
    assert.equal(JSON.stringify(legacy), original);
  }
});

test('the CLI paid path retains exclusive intent and one POST with prepared bytes', async t => {
  const f = await fixture(t), plan = await make(f), { cap, payload } = await approvedPayload(plan, flags(plan), spec, f.root);
  let posts = 0, intent;
  const create = state => { if (intent) throw new Error('existing intent'); intent = state; };
  const client = { submit: async actual => { posts++; assert.ok(intent); assert.equal(actual.initial_image, payload.initial_image); return { id: 'mock-job', status: 'queued', credits_charged: 0 }; } };
  const state = { requestId: plan.requestId, approvedMaxCredits: cap };
  await submitWithIntent(client, payload, state, create, () => {});
  await assert.rejects(submitWithIntent(client, payload, state, create, () => {}), /existing intent/);
  assert.equal(posts, 1);
});
