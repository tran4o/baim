import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, readSync, lstatSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoLinks, assertPrivate, privateReferencePath, gitDirectory, windowsACL } from './ludo-private-state.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const REFERENCE_ALGORITHM = 'proportional-full-canvas-lanczos3-floor-v1';
export const REFERENCE_MAX_BYTES = 15_000_000;
export const REFERENCE_MAX_PIXELS = 16_000_000;
const TARGET_PIXELS = 990_000;
const TRUE_SIZE_LIMIT = 1_000_000; // Exclusive; confirmed provider rejection, not present in OpenAPI 0.9.10.

export function referenceConstraints(spec, config) {
  const p = spec?.components?.schemas?.AnimateSpritePayload?.properties;
  if (!p?.model?.enum?.includes(config.model) || !p?.frame_size?.enum?.includes(config.frameSize)
      || !p?.frames?.enum?.includes(config.frames) || !p?.margin_ratio_mode?.enum?.includes('auto')
      || !p?.initial_image || !p?.final_image || !p?.crop || !p?.loop
      || (config.frameSize === -9 && !/True Size/.test(p.frame_size.description || ''))) {
    throw new Error('Unknown model/frame-size/reference schema constraints; stop before spending');
  }
  const durationLine = p.duration?.description?.split('\n').find(line => line.startsWith(`- ${config.model}:`));
  const durations = durationLine?.slice(durationLine.indexOf(':') + 1).trim().split(/,\s*/).map(Number);
  if (!durations?.includes(config.duration)) throw new Error('Unknown model duration constraints; stop before spending');
  return { specVersion: spec.info?.version ?? null, schemaSHA256: hash(JSON.stringify(p)), model: config.model,
    frameSize: config.frameSize, maximumPixelsExclusive: config.frameSize === -9 ? TRUE_SIZE_LIMIT : null,
    resizeTargetPixels: config.frameSize === -9 ? TARGET_PIXELS : null,
    limitEvidence: config.frameSize === -9 ? 'provider-error: True Size only works with source images under 1 megapixel; 2026-10-03' : 'local bounded decoder policy; no extra provider size bound documented',
    maximumInputBytes: REFERENCE_MAX_BYTES, maximumDecodedPixels: REFERENCE_MAX_PIXELS };
}

function safeParts(path) {
  if (typeof path !== 'string' || path.length > 500 || path.includes('\\') || path.includes(':')
      || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe reference path');
  return path.split('/');
}

// Reject every link/component before opening; bounded reads also catch growth after stat.
export function readReferenceFile(root, path, { prepared = false, label } = {}) {
  let parts = safeParts(path);
  if (prepared) {
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(label || '')
        || !new RegExp(`^\\.git/ludo-api/${label}/reference-[a-f0-9]{64}\\.png$`).test(path)) throw new Error('Unsafe prepared reference path');
    privateReferencePath(root, path);
    root = gitDirectory(root); parts = parts.slice(1);
  } else if (!path.startsWith('assets_src/characters/') || parts.some(part => part.startsWith('.'))) {
    throw new Error('Reference must stay within public character source assets');
  }
  let current = root;
  assertNoLinks(root);
  if (lstatSync(current).isSymbolicLink()) throw new Error('Unsafe reference root');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    const st = lstatSync(current);
    if (st.isSymbolicLink() || (i < parts.length - 1 ? !st.isDirectory() : !st.isFile())) throw new Error('Unsafe reference file or directory');
    if (prepared) assertPrivate(current);
  }
  const fd = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size <= 0 || st.size > REFERENCE_MAX_BYTES) throw new Error('Reference exceeds bounded byte limit');
    const buffer = Buffer.alloc(st.size + 1);
    let count = 0, read;
    do { read = readSync(fd, buffer, count, buffer.length - count, null); count += read; } while (read && count < buffer.length);
    const after = fstatSync(fd);
    if (count !== st.size || after.size !== st.size || after.mtimeMs !== st.mtimeMs) throw new Error('Reference changed while reading');
    return buffer.subarray(0, count);
  } finally { closeSync(fd); }
}

export async function decodeReference(bytes, expectedHash) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > REFERENCE_MAX_BYTES || hash(bytes) !== expectedHash) throw new Error('Reference size/hash does not match approval');
  try {
    const decoder = sharp(bytes, { limitInputPixels: REFERENCE_MAX_PIXELS, failOn: 'warning' });
    const meta = await decoder.metadata();
    if (meta.format !== 'png' || !meta.hasAlpha || (meta.pages || 1) !== 1 || (meta.orientation && meta.orientation !== 1)
        || meta.width > 16384 || meta.height > 16384 || meta.width * meta.height > REFERENCE_MAX_PIXELS) {
      throw new Error('Expected a bounded single-page transparent PNG with unambiguous orientation');
    }
    // metadata() alone is not a decode: truncated PNGs can have a valid IHDR.
    const { info } = await decoder.raw().toBuffer({ resolveWithObject: true });
    if (info.width !== meta.width || info.height !== meta.height) throw new Error('Decoded dimensions differ');
    return { width: info.width, height: info.height, pixels: info.width * info.height, format: 'png', hasAlpha: true };
  } catch {
    throw new Error('Cannot fully decode a bounded single-page transparent PNG reference; preserve original and stop');
  }
}

export function referenceSize(width, height, constraints) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('Invalid decoded dimensions');
  if (!constraints.maximumPixelsExclusive || width * height < constraints.maximumPixelsExclusive) return { width, height, scale: 1 };
  const scale = Math.sqrt(constraints.resizeTargetPixels / (width * height));
  const w = Math.floor(width * scale), h = Math.floor(height * scale);
  if (w < 1 || h < 1 || w * h >= constraints.maximumPixelsExclusive) throw new Error('Cannot proportionally fit reference safely');
  return { width: w, height: h, scale };
}

function settings(config) {
  return { model: config.model, frameSize: config.frameSize, duration: config.duration, frames: config.frames,
    loop: config.loop, crop: false, margin_ratio_mode: 'auto', image_type: 'sprite', augment_prompt: true,
    gif: false, individual_frames: false, spritesheet_with_background: false, async: true };
}
const roles = config => [['initial', config.reference, config.referenceSHA256],
  ...(config.finalReference ? [['final', config.finalReference, config.finalReferenceSHA256]] : [])];

export async function prepareReferences(config, spec, root) {
  const constraints = referenceConstraints(spec, config);
  const originals = [];
  for (const [role, path, sha256] of roles(config)) {
    const bytes = readReferenceFile(root, path);
    originals.push({ role, bytes, original: { path, sha256, ...await decodeReference(bytes, sha256) } });
  }
  if (originals.some(({ original }) => original.width !== originals[0].original.width || original.height !== originals[0].original.height)) {
    throw new Error('Initial/final canvases differ; reconcile approved registration before spending');
  }
  const size = referenceSize(originals[0].original.width, originals[0].original.height, constraints);
  const cache = new Map(), references = {};
  for (const { role, original, bytes } of originals) {
    let prepared = size.scale === 1 ? undefined : cache.get(original.sha256);
    if (!prepared) {
      if (size.scale === 1) prepared = { ...original };
      else {
        const output = await sharp(bytes, { limitInputPixels: REFERENCE_MAX_PIXELS, failOn: 'warning' })
          .resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3', withoutEnlargement: true })
          .keepIccProfile().png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
        const sha256 = hash(output), dimensions = await decodeReference(output, sha256);
        if (dimensions.width !== size.width || dimensions.height !== size.height || dimensions.pixels >= constraints.maximumPixelsExclusive) throw new Error('Prepared reference does not satisfy bounds');
        const path = `.git/ludo-api/${config.label}/reference-${sha256}.png`;
        // candidateDir in the native CLI creates/validates the owner-only directory first.
        const parent = `.git/ludo-api/${config.label}`;
        for (const part of ['.git', '.git/ludo-api', parent]) {
          const full = part === '.git' ? gitDirectory(root) : join(gitDirectory(root), ...part.split('/').slice(1));
          assertNoLinks(full);
          const st = lstatSync(full);
          if (!st.isDirectory() || st.isSymbolicLink() || (process.platform !== 'win32' && part !== '.git' && (st.mode & 0o077))) throw new Error('Unsafe prepared reference directory');
          if (part !== '.git') assertPrivate(full);
        }
        const full = privateReferencePath(root, path);
        if (!existsSync(full)) {
          writeFileSync(full, output, { flag: 'wx', mode: 0o600 });
          if (process.platform === 'win32') windowsACL(full, true);
        }
        if (hash(readReferenceFile(root, path, { prepared: true, label: config.label })) !== sha256) throw new Error('Existing prepared derivative changed; preserve and reconcile');
        prepared = { path, sha256, ...dimensions };
      }
      cache.set(original.sha256, prepared);
    }
    references[role] = { original, prepared, transformation: size.scale === 1 ? { kind: 'unchanged' } : {
      kind: 'proportional-downscale', scale: size.scale, rounding: 'floor-both-axes', kernel: 'lanczos3',
      crop: false, fullCanvas: true, upscale: false, lossless: false } };
  }
  return { algorithm: REFERENCE_ALGORITHM, toolchain: { sharp: sharp.versions.sharp, vips: sharp.versions.vips },
    constraints, settings: settings(config), references,
    note: size.scale === 1 ? 'Approved reference bytes unchanged.' : `Automatic API reference resize: ${originals[0].original.width}x${originals[0].original.height} -> ${size.width}x${size.height}; full canvas retained; resampling is not lossless. Original approved art unchanged.` };
}

// Validation never writes or resizes. Legacy jobs remain collectible; incompatible legacy plans need a new reviewed candidate.
export async function validateReferences(plan, spec, root) {
  const constraints = referenceConstraints(spec, plan.config), prep = plan.referencePreparation;
  if (plan.planVersion !== undefined && plan.planVersion !== 2) throw new Error('Unknown plan version');
  if ((plan.planVersion === 2) !== Boolean(prep)) throw new Error('Prepared reference binding missing; fresh reviewed plan required');
  if (prep && (prep.algorithm !== REFERENCE_ALGORITHM || !equal(prep.constraints, constraints) || !equal(prep.settings, settings(plan.config)))) throw new Error('Reference constraints/settings changed; fresh reviewed plan required');
  const images = {}, dimensions = [];
  for (const [role, path, sha256] of roles(plan.config)) {
    const originalBytes = readReferenceFile(root, path), original = { path, sha256, ...await decodeReference(originalBytes, sha256) };
    dimensions.push(original);
    const entry = prep?.references?.[role];
    const size = referenceSize(original.width, original.height, constraints);
    if (!prep) {
      if (size.scale !== 1) throw new Error('Legacy reference exceeds True Size limit; preserve plan/job and prepare a fresh reviewed candidate');
      images[role] = `data:image/png;base64,${originalBytes.toString('base64')}`; continue;
    }
    if (!entry || !equal(entry.original, original)) throw new Error('Original reference provenance changed; fresh reviewed plan required');
    const resized = size.scale !== 1;
    const expectedTransformation = resized ? { kind: 'proportional-downscale', scale: size.scale, rounding: 'floor-both-axes', kernel: 'lanczos3', crop: false, fullCanvas: true, upscale: false, lossless: false } : { kind: 'unchanged' };
    if (!equal(entry.transformation, expectedTransformation)) throw new Error('Reference transformation changed');
    const bytes = resized ? readReferenceFile(root, entry.prepared.path, { prepared: true, label: plan.config.label }) : originalBytes;
    const prepared = { path: entry.prepared.path, sha256: entry.prepared.sha256, ...await decodeReference(bytes, entry.prepared.sha256) };
    if (!equal(prepared, entry.prepared) || prepared.width !== size.width || prepared.height !== size.height
        || (!resized && !equal(entry.prepared, original))
        || (resized && prepared.path !== `.git/ludo-api/${plan.config.label}/reference-${prepared.sha256}.png`)
        || (constraints.maximumPixelsExclusive && prepared.pixels >= constraints.maximumPixelsExclusive)) throw new Error('Prepared reference changed; fresh reviewed plan required');
    images[role] = `data:image/png;base64,${bytes.toString('base64')}`;
  }
  if (dimensions.some(image => image.width !== dimensions[0].width || image.height !== dimensions[0].height)) throw new Error('Initial/final canvases differ');
  if (prep && Object.keys(prep.references).length !== roles(plan.config).length) throw new Error('Unexpected reference roles');
  if (prep && dimensions.length === 2 && dimensions[0].sha256 === dimensions[1].sha256
      && prep.references.initial.transformation.kind !== 'unchanged'
      && !equal(prep.references.initial.prepared, prep.references.final.prepared)) throw new Error('Identical originals require identical prepared references');
  // Decoding yields asynchronously. Recheck every bound file synchronously after the last decode,
  // so a mutation during validation cannot receive a card or reach the subsequent intent/POST.
  for (const [role, path, sha256] of roles(plan.config)) {
    if (hash(readReferenceFile(root, path)) !== sha256) throw new Error('Original reference changed during validation; fresh reviewed plan required');
    const entry = prep?.references[role];
    if (entry?.transformation.kind === 'proportional-downscale'
        && hash(readReferenceFile(root, entry.prepared.path, { prepared: true, label: plan.config.label })) !== entry.prepared.sha256) {
      throw new Error('Prepared reference changed during validation; fresh reviewed plan required');
    }
  }
  return images;
}
