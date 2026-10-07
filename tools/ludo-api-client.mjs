import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const API_BASE = 'https://api.ludo.ai/api/';
export const SPEC_URL = 'https://api.ludo.ai/api-documentation/openapi.json';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const MODELS = ['hydra', 'forge'];
const FRAME_COUNTS = [4, 9, 16, 25, 36, 49, 64];
const FRAME_SIZES = [32, 64, 96, 128, 192, 256, 384, 0, -9];

export function validateCandidate(config) {
  const allowed = ['label', 'reference', 'referenceSHA256', 'finalReference', 'finalReferenceSHA256', 'sourceDir', 'motionPrompt', 'model', 'duration', 'frames', 'frameSize', 'loop'];
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Candidate must be an object');
  for (const key of Object.keys(config)) if (!allowed.includes(key)) throw new Error(`Unsupported candidate field: ${key}`);
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(config.label)) throw new Error('Use a stable lowercase candidate label');
  if (!MODELS.includes(config.model)) throw new Error('Pilot supports painted-art models hydra or forge only');
  const durations = config.model === 'hydra' ? [3, 3.5, 4, 4.5, 5] : [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  if (!durations.includes(config.duration)) throw new Error('Invalid model/duration combination');
  if (!FRAME_COUNTS.includes(config.frames) || !FRAME_SIZES.includes(config.frameSize)) throw new Error('Invalid frame count or size; paid AI upscaling is excluded');
  if (typeof config.loop !== 'boolean') throw new Error('Loop must be explicitly true or false');
  if (typeof config.motionPrompt !== 'string' || !config.motionPrompt.trim() || config.motionPrompt.length > 2500) throw new Error('A bounded motion prompt is required');
  for (const [path, hash] of [[config.reference, config.referenceSHA256], [config.finalReference, config.finalReferenceSHA256]]) {
    if (path === undefined && hash === undefined && path !== config.reference) continue;
    if (typeof path !== 'string' || !/^[a-f0-9]{64}$/.test(hash || '')) throw new Error('Reference path and approved SHA-256 are required together');
  }
  if (typeof config.sourceDir !== 'string') throw new Error('Character source directory is required');
  return config;
}

export function pricingFromSpec(spec, model, duration) {
  const description = spec?.components?.schemas?.AnimateSpritePayload?.properties?.model?.description;
  const fail = () => { throw new Error('Cannot verify current Ludo pricing; stop before spending'); };
  if (!MODELS.includes(model) || !Number.isFinite(duration) || duration <= 0 || duration > 5
      || typeof description !== 'string' || description.length > 20000) fail();
  const lines = description.split(/\r?\n/).filter(line => line.includes(`"${model}"`));
  if (lines.length !== 1) fail();
  const number = '(0|[1-9]\\d*)(?:\\.\\d+)?';
  // Entire line must have one documented grammar. Unknown suffixes/discounts are unsafe.
  const prefix = `^- "${model}" \\(${model === 'hydra' ? 'Hydra' : 'Forge'}\\): `;
  const suffix = model === 'hydra' ? '(?: · Most capable all-around model, generates audio)?' : '';
  const old = lines[0].match(new RegExp(prefix + `(${number}) credits/s, min charge (${number}) credits${suffix}$`));
  const current = lines[0].match(new RegExp(prefix + `(${number}) credits/s, shortest duration (${number})s, so (${number}) credits minimum${suffix}$`));
  if (!old && !current) fail();
  const rate = Number((old || current)[1]), minimum = Number(old ? old[3] : current[5]);
  if (![rate, minimum].every(value => Number.isFinite(value) && value > 0 && value <= 1000)) fail();
  if (current) {
    const shortest = Number(current[3]);
    if (shortest !== (model === 'hydra' ? 3 : 1) || duration < shortest
        || Math.abs(rate * shortest - minimum) > 1e-9) fail();
  }
  return { model, rate, minimum, estimatedCredits: Math.round(Math.max(rate * duration, minimum) * 10) / 10,
    specVersion: spec.info?.version, verifiedAt: new Date().toISOString(), descriptionSHA256: sha256(description) };
}

export function makePayload(config, images, requestId) {
  validateCandidate(config);
  return { motion_prompt: config.motionPrompt, initial_image: images.initial,
    ...(images.final ? { final_image: images.final } : {}), model: config.model,
    duration: config.duration, frames: config.frames, frame_size: config.frameSize,
    loop: config.loop, crop: false, margin_ratio_mode: 'auto', image_type: 'sprite',
    augment_prompt: true, gif: false, individual_frames: false,
    spritesheet_with_background: false, async: true, request_id: requestId };
}

export async function referenceData(bytes, expectedHash) {
  if (bytes.length > 15_000_000 || sha256(bytes) !== expectedHash) throw new Error('Reference size/hash does not match approval');
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'png' || !metadata.hasAlpha) throw new Error('Pilot reference must be an approved transparent PNG');
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

export class LudoClient {
  constructor(key, fetchImpl = fetch) {
    if (!key || /\s/.test(key)) throw new Error('Configure a private API key first');
    this.key = key;
    this.fetch = fetchImpl;
  }
  async request(path, { method = 'GET', body, onJobId = () => {} } = {}) {
    const endpoint = new URL(path, API_BASE);
    if (endpoint.origin !== new URL(API_BASE).origin || !endpoint.pathname.startsWith('/api/')) throw new Error('API credentials may only be sent to the official Ludo API');
    let response;
    try {
      response = await this.fetch(endpoint, { method, redirect: 'error',
        headers: { Authorization: `ApiKey ${this.key}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
    } catch {
      throw new Error('Ludo connection interrupted; do not submit a new generation. Resume the saved request.');
    }
    const id = response.headers.get('x-ludo-job-id');
    if (id) onJobId(id); // Preserve recovery ID before parsing a potentially broken body.
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      throw new Error(`Ludo HTTP ${response.status}${response.status === 429 ? `; wait ${retry || 'the documented delay'} before a read retry` : ''}. No automatic generation retry.`);
    }
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new Error('Malformed Ludo response; use the saved job ID, never regenerate automatically'); }
  }
  check() { return this.request('auth/validate-api-key'); }
  submit(payload, onJobId) { return this.request('assets/sprite/animate', { method: 'POST', body: payload, onJobId }); }
  job(id) {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('Invalid job ID');
    return this.request(`assets/jobs/${encodeURIComponent(id)}?wait=30`);
  }
  jobs() { return this.request('assets/jobs?limit=100'); }
  results(requestId) { return this.request(`assets/sprites/results?request_id=${encodeURIComponent(requestId)}&source=api`); }
}

export async function submitWithIntent(client, payload, state, createIntent, persist) {
  createIntent(state); // Must be exclusive and durable; a second call fails before POST.
  const response = await client.submit(payload, id => { state.id = id; persist(state); });
  if (response?.id) state.id = response.id;
  if (response?.status) state.status = response.status;
  if (response?.result) state.result = response.result;
  if (response?.credits_charged !== undefined) state.credits_charged = response.credits_charged;
  persist(state);
  return state;
}

export function verifyApproval(plan, options, pricing) {
  if (options.length !== 4 || options[0] !== '--approve-plan' || options[2] !== '--max-credits') throw new Error('Exact approved plan hash and spending cap are required');
  if (options[1] !== sha256(`${JSON.stringify(plan, null, 2)}\n`)) throw new Error('Plan changed after approval');
  if (pricing.descriptionSHA256 !== plan.pricing.descriptionSHA256) throw new Error('Pricing changed; request a new decision');
  const cap = Number(options[3]);
  if (!Number.isFinite(cap) || cap <= 0 || pricing.estimatedCredits > cap) throw new Error('Estimated cost exceeds approval cap');
  return cap;
}

export function artifactURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Missing/invalid artifact URL'); }
  const allowed = url.hostname === 'storage.googleapis.com' || url.hostname === 'ludo.ai' || url.hostname.endsWith('.ludo.ai');
  if (url.protocol !== 'https:' || !allowed || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Artifact host is not approved; inspect it before download');
  return url;
}

export async function downloadSheet(value, fetchImpl = fetch) {
  let url = artifactURL(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    // Never send the Ludo Authorization header to an asset host.
    let response;
    try { response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(45000) }); }
    catch { throw new Error('Artifact download interrupted; retry collection, not generation'); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3) throw new Error('Too many artifact redirects');
      url = artifactURL(new URL(response.headers.get('location'), url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Artifact HTTP ${response.status}; do not regenerate to recover a download`);
    const parts = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 64_000_000) { await response.body.cancel?.().catch(() => {}); throw new Error('Sprite sheet exceeds pilot download limit'); }
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  }
}

// Preserve native download bytes separately; runtime tooling consumes an actual PNG.
export async function normalizeSheet(bytes) {
  const metadata = await sharp(bytes).metadata();
  if (!['png', 'webp'].includes(metadata.format) || !metadata.hasAlpha
      || (metadata.pages || 1) !== 1 || metadata.width * metadata.height > 64_000_000) {
    throw new Error('Expected a bounded single-page transparent PNG or WebP sheet');
  }
  return { bytes: metadata.format === 'png' ? bytes : await sharp(bytes).png().toBuffer(),
    nativeFormat: metadata.format, nativeSHA256: sha256(bytes) };
}

export async function deriveAtlas(bytes, result) {
  const { num_frames: count, num_cols: cols, num_rows: rows, duration } = result;
  if (![count, cols, rows].every(value => Number.isInteger(value) && value > 0 && value <= 64)
      || count > cols * rows || rows !== Math.ceil(count / cols) || !Number.isFinite(duration) || duration <= 0 || duration > 10) {
    throw new Error('Missing/inconsistent returned grid or duration; preserve response and stop');
  }
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'png' || !metadata.hasAlpha || metadata.width % cols || metadata.height % rows || metadata.width * metadata.height > 64_000_000) throw new Error('Expected a bounded transparent PNG with divisible frame geometry');
  const stats = await sharp(bytes).stats();
  const alpha = stats.channels.at(-1);
  if (alpha.min !== 0 || alpha.max === 0) throw new Error('Sprite sheet lacks transparent background or visible content');
  const width = metadata.width / cols, height = metadata.height / rows;
  return { frames: Array.from({ length: count }, (_, index) => ({ filename: `frame-${String(index).padStart(3, '0')}`,
    frame: { x: (index % cols) * width, y: Math.floor(index / cols) * height, w: width, h: height }, duration: duration * 1000 / count })),
    meta: { image: 'spritesheet.png', size: { w: metadata.width, h: metadata.height },
      timingOrigin: 'derived-uniform-from-api-duration', durationSeconds: duration,
      warning: 'API supplies total duration, not per-frame timestamps. Verify timing and registration in actual runtime.' } };
}
