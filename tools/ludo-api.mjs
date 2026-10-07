import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, relative, join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LudoClient, SPEC_URL, validateCandidate, pricingFromSpec, makePayload, sha256, downloadSheet, normalizeSheet, deriveAtlas, submitWithIntent, verifyApproval } from './ludo-api-client.mjs';
import { prepareReferences, validateReferences } from './ludo-reference.mjs';
import { PC_PRIMARY, VPS_ROOT, assertNoLinks, gitDirectory, privateDirectory, assertPrivate, windowsACL, protectExistingState } from './ludo-private-state.mjs';

let ROOT = VPS_ROOT, PRIVATE = join(ROOT, '.git/ludo-api'), KEY = join(PRIVATE, 'key');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const read = path => JSON.parse(readFileSync(path, 'utf8'));

export function requireEnvironment(root = ROOT, run = execFileSync, host = hostname(), platform = process.platform) {
  const git = (...args) => run('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (platform === 'win32') {
    const primary = resolve(PC_PRIMARY);
    root = assertNoLinks(root);
    if (resolve(git('rev-parse', '--show-toplevel')) !== root
        || resolve(git('rev-parse', '--path-format=absolute', '--git-common-dir')) !== join(primary, '.git')
        || git('remote', 'get-url', 'marto') !== 'https://github.com/tran4o/baim.git'
        || git('remote', 'get-url', 'zeshad') !== 'https://github.com/ZeShad/baim.git') throw new Error('Wrong PC repository/canonical remote; stop');
    assertNoLinks(primary); assertNoLinks(join(primary, '.git'));
    const dir = gitDirectory(root), expected = resolve(git('rev-parse', '--absolute-git-dir'));
    if (dir !== expected || !lstatSync(join(primary, '.git')).isDirectory()) throw new Error('Wrong primary Git directory; stop');
    if (root !== primary) {
      if (relative(join(primary, '.git/worktrees'), dir).startsWith('..')
          || resolve(readFileSync(join(dir, 'gitdir'), 'utf8').trim()) !== join(root, '.git')) throw new Error('Wrong linked worktree; stop');
    }
  } else if (host !== 'vps-b30ffe96' || root !== VPS_ROOT || git('rev-parse', '--show-toplevel') !== VPS_ROOT
      || git('remote', 'get-url', 'marto') !== 'https://github.com/tran4o/baim.git') throw new Error('Wrong host/repository/canonical remote; stop');
  const branch = git('branch', '--show-current');
  if (!branch.startsWith('feat/')) throw new Error('Use a focused feat/ branch, never master');
  return { branch, base: git('rev-parse', 'marto/master'), ...(platform === 'win32' ? { platform, root, gitDir: gitDirectory(root) } : {}) };
}

function privateDir(path) {
  privateDirectory(gitDirectory(ROOT), path);
}
function protectNew(path) { if (process.platform === 'win32') windowsACL(path, true); assertPrivate(path); }
function save(path, data, exclusive = false) {
  if (exclusive) { writeFileSync(path, json(data), { flag: 'wx', mode: 0o600 }); protectNew(path); return; }
  if (existsSync(path)) assertPrivate(path);
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, json(data), { flag: 'wx', mode: 0o600 });
  protectNew(temp);
  renameSync(temp, path);
}
function candidateDir(label) {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(label || '')) throw new Error('Invalid candidate label');
  const path = join(PRIVATE, label); privateDir(path); return path;
}
function sourceDir(path) {
  if (!/^assets_src\/characters\/[a-z0-9_]+\/external_animation_v1\/input$/.test(path || '')) throw new Error('Use the established character source input directory');
  const full = resolve(ROOT, path);
  assertNoLinks(full);
  let current = ROOT;
  for (const part of path.split('/')) {
    current = join(current, part);
    if (existsSync(current) && (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory())) throw new Error('Unsafe source directory');
  }
  return full;
}
function loadKey() {
  if (process.env.LUDO_API_KEY) return process.env.LUDO_API_KEY;
  if (!existsSync(KEY)) throw new Error('No API key configured. Run setup privately in the verified checkout terminal');
  const st = lstatSync(KEY);
  assertPrivate(KEY);
  if (!st.isFile()) throw new Error('API key must be an owner-only regular file');
  return readFileSync(KEY, 'utf8').trim();
}
async function verifyPrivacy() {
  privateDir(PRIVATE);
  const name = `probe-${randomUUID()}.txt`, file = join(PRIVATE, name);
  writeFileSync(file, 'non-secret privacy probe', { flag: 'wx', mode: 0o600 });
  protectNew(file);
  try {
    const probePath = relative(process.platform === 'win32' ? resolve(PC_PRIMARY) : ROOT, file).replaceAll('\\', '/');
    if (probePath.startsWith('../') || isAbsolute(probePath)) throw new Error('Private probe is outside the verified preview checkout');
    const response = await fetch(`http://127.0.0.1:5173/${probePath}`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (response.status !== 404) throw new Error('Preview does not protect private API state; stop before setup/use');
  } finally { unlinkSync(file); }
}
export async function readHiddenKey(input = process.stdin, output = process.stdout) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') throw new Error('Setup requires an interactive terminal; never paste the key into chat or a command argument');
  const wasRaw = Boolean(input.isRaw);
  output.write('Paste Ludo API key (hidden), then Enter: ');
  input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  return new Promise((resolveKey, reject) => {
    let key = '';
    const finish = (error) => {
      input.off('data', onData); input.setRawMode(wasRaw); input.pause(); output.write('\n');
      if (error) reject(error); else resolveKey(key);
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') { finish(new Error('Setup cancelled')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') key = key.slice(0, -1);
        else key += char;
        if (key.length > 1000) { finish(new Error('Invalid key length')); return; }
      }
    };
    input.on('data', onData);
  });
}
async function currentSpec() {
  const response = await fetch(SPEC_URL, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Cannot verify official API pricing/schema');
  return response.json();
}
function print(value) { console.log(json(value)); }

export async function buildPlan(config, environment, spec, root) {
  validateCandidate(config);
  const referencePreparation = await prepareReferences(config, spec, root);
  const pricing = pricingFromSpec(spec, config.model, config.duration);
  return { planVersion: 2, config, environment, requestId: randomUUID(), referencePreparation, pricing, createdAt: new Date().toISOString() };
}

export async function approvedPayload(plan, options, spec, root) {
  validateCandidate(plan.config);
  const pricing = pricingFromSpec(spec, plan.config.model, plan.config.duration);
  const cap = verifyApproval(plan, options, pricing);
  const images = await validateReferences(plan, spec, root);
  return { cap, payload: makePayload(plan.config, images, plan.requestId) };
}

export async function main(args) {
  const [command, labelOrPath, ...options] = args;
  if (!command || command === 'help') {
    console.log('Ludo pilot: setup | check | plan candidate.json | validate-plan LABEL | submit LABEL --approve-plan HASH --max-credits N | collect LABEL\nNo command generates by default. See docs/ludo-api-pilot.md.'); return;
  }
  if (process.platform === 'win32') {
    if (!process.env.BAIM_LUDO_PC_ROOT || !isAbsolute(process.env.BAIM_LUDO_PC_ROOT)) throw new Error('Set BAIM_LUDO_PC_ROOT to the explicit approved PC checkout');
    ROOT = resolve(process.env.BAIM_LUDO_PC_ROOT);
  }
  const environment = requireEnvironment();
  if (process.platform !== 'win32' && gitDirectory(ROOT) !== join(ROOT, '.git')) throw new Error('VPS pilot requires the primary checkout');
  PRIVATE = join(gitDirectory(ROOT), 'ludo-api'); KEY = join(PRIVATE, 'key');
  if (command === 'setup') {
    if (existsSync(KEY)) throw new Error('Key already configured; do not overwrite it without an explicit rotation decision');
    if (labelOrPath !== undefined) {
      if (labelOrPath !== '--protect-existing-state' || options.length || process.platform !== 'win32') throw new Error('Setup accepts only the explicit Windows --protect-existing-state option');
      if (existsSync(PRIVATE)) console.log(`Protected ACLs on ${protectExistingState(PRIVATE)} existing private state entries; contents preserved.`);
    }
    await verifyPrivacy();
    const key = await readHiddenKey(); await new LudoClient(key).check();
    writeFileSync(KEY, key, { flag: 'wx', mode: 0o600 });
    protectNew(KEY);
    console.log('API key validated and stored privately. No generation or credits spent.'); return;
  }
  if (command === 'check') {
    await verifyPrivacy(); await new LudoClient(loadKey()).check();
    console.log('API authentication passed. No generation submitted.'); return;
  }
  if (command === 'plan') {
    await verifyPrivacy();
    const config = validateCandidate(read(resolve(ROOT, labelOrPath)));
    sourceDir(config.sourceDir);
    const dir = candidateDir(config.label);
    if (existsSync(join(dir, 'plan.json'))) throw new Error('Plan already exists; preserve it and prepare a fresh reviewed candidate');
    const spec = await currentSpec();
    const plan = await buildPlan(config, environment, spec, ROOT);
    save(join(dir, 'plan.json'), plan, true);
    print({ label: config.label, planSHA256: sha256(json(plan)), estimatedCredits: plan.pricing.estimatedCredits,
      submitted: false, referenceNote: plan.referencePreparation.note, note: 'Ask the user to approve this exact plan and maximum charge before submit.' }); return;
  }
  if (!['submit', 'collect', 'validate-plan'].includes(command)) throw new Error('Unknown command; run help');
  const dir = candidateDir(labelOrPath), planPath = join(dir, 'plan.json');
  assertPrivate(planPath);
  const planBytes = readFileSync(planPath), plan = JSON.parse(planBytes);
  validateCandidate(plan.config);
  if (plan.environment.branch !== environment.branch) throw new Error('Candidate belongs to a different task branch');
  if (plan.environment.root && (plan.environment.root !== environment.root || plan.environment.gitDir !== environment.gitDir)) throw new Error('Candidate belongs to a different checkout');
  await verifyPrivacy();
  if (command === 'validate-plan') {
    const spec = await currentSpec();
    await validateReferences(plan, spec, ROOT);
    if (pricingFromSpec(spec, plan.config.model, plan.config.duration).descriptionSHA256 !== plan.pricing.descriptionSHA256) throw new Error('Pricing changed; fresh reviewed plan required');
    if (sha256(readFileSync(planPath)) !== sha256(planBytes)) throw new Error('Saved plan changed during validation; fresh reviewed plan required');
    print({ label: labelOrPath, valid: true, planSHA256: sha256(json(plan)), referenceNote: plan.referencePreparation?.note || 'Compatible legacy reference bytes unchanged.' }); return;
  }
  const client = new LudoClient(loadKey());
  const statePath = join(dir, 'job.json');
  if (command === 'submit') {
    const spec = await currentSpec();
    const { cap, payload } = await approvedPayload(plan, options, spec, ROOT);
    if (sha256(readFileSync(planPath)) !== sha256(planBytes)) throw new Error('Saved plan changed during validation; fresh reviewed plan required');
    // Exclusive intent is durable BEFORE the only paid POST. Even a timeout cannot trigger another submission.
    const state = { requestId: plan.requestId, status: 'submission-uncertain', approvedPlanSHA256: options[1], approvedMaxCredits: cap, submittedAt: new Date().toISOString() };
    await submitWithIntent(client, payload, state, value => save(statePath, value, true), value => save(statePath, value));
    if (state.credits_charged > cap) throw new Error('Reported charge exceeds approval cap; saved job must be investigated, never resubmitted');
    print({ label: labelOrPath, jobId: state.id || null, status: state.status, next: 'collect the saved candidate; never repeat submit' }); return;
  }
  assertPrivate(statePath);
  const state = read(statePath);
  if (!state.id && !state.result) {
    const jobs = await client.jobs();
    const job = Array.isArray(jobs) && jobs.find(job => job.request_id === plan.requestId);
    if (job) Object.assign(state, job);
    else {
      const results = await client.results(plan.requestId);
      if (!Array.isArray(results) || results.length !== 1 || results[0].request_id !== plan.requestId) throw new Error('Submission unresolved; preserve request ID and stop. No new paid POST is permitted');
      state.status = 'succeeded'; state.result = results[0];
    }
  }
  if (state.id && state.status !== 'succeeded') {
    const after = Math.max(0, Number(state.poll_after_ms) || 0);
    if (state.lastPollAt && Date.now() - state.lastPollAt < after) throw new Error('Respect saved poll_after_ms before collecting again');
    Object.assign(state, await client.job(state.id)); state.lastPollAt = Date.now();
  }
  save(statePath, state);
  if (state.credits_charged > state.approvedMaxCredits) throw new Error('Reported charge exceeds approval cap; preserve the saved job and investigate');
  if (state.status !== 'succeeded') {
    print({ label: labelOrPath, jobId: state.id || null, status: state.status,
      pollAfterMs: state.poll_after_ms || null, next: ['failed', 'canceled'].includes(state.status) ? 'stop; a new paid attempt needs a new decision' : 'collect again after the recommended delay; this is a free read' }); return;
  }
  if (existsSync(join(dir, 'download.json'))) {
    assertPrivate(join(dir, 'download.json'));
    const report = read(join(dir, 'download.json'));
    const destination = join(sourceDir(plan.config.sourceDir), `${plan.config.label}-api`);
    for (const [name, digest] of [['spritesheet.png', report.sourceSHA256], ['derived-atlas.json', report.derivedAtlasSHA256], ['provenance.json', report.provenanceSHA256]]) {
      if (sha256(readFileSync(join(destination, name))) !== digest) throw new Error('Collected source package changed; preserve user work and investigate');
    }
    if (report.nativeSourceFile && sha256(readFileSync(join(destination, report.nativeSourceFile))) !== report.nativeSourceSHA256) throw new Error('Native source package changed; preserve user work and investigate');
    print(report); return;
  }
  const bytesPath = join(dir, 'spritesheet.png');
  if (existsSync(bytesPath)) assertPrivate(bytesPath);
  const nativeBytes = existsSync(bytesPath) ? readFileSync(bytesPath) : await downloadSheet(state.result.spritesheet_url);
  if (!existsSync(bytesPath)) { writeFileSync(bytesPath, nativeBytes, { flag: 'wx', mode: 0o600 }); protectNew(bytesPath); }
  const normalized = await normalizeSheet(nativeBytes), bytes = normalized.bytes;
  const nativeSourceFile = normalized.nativeFormat === 'png' ? 'spritesheet.png' : 'spritesheet.original.webp';
  const atlas = await deriveAtlas(bytes, state.result);
  const config = plan.config, destination = join(sourceDir(config.sourceDir), `${config.label}-api`);
  if (existsSync(destination)) throw new Error('Source package exists; preserve it and investigate before overwriting');
  const provenance = { candidate: config.label, status: 'candidate', transport: 'ludo-rest-api', requestId: plan.requestId,
    jobId: state.id || null, generationCreatedAt: state.result.created_at || null, creditsCharged: state.credits_charged ?? null,
    approvedMaxCredits: state.approvedMaxCredits, estimatedCredits: plan.pricing.estimatedCredits,
    settings: { ...makePayload(config, { initial: '[reference-bytes-recorded-by-hash]' }, plan.requestId),
      ...(config.finalReference ? { final_image: '[reference-bytes-recorded-by-hash]' } : {}) },
    references: { initial: { path: config.reference, sha256: config.referenceSHA256 },
      ...(config.finalReference ? { final: { path: config.finalReference, sha256: config.finalReferenceSHA256 } } : {}) },
    ...(plan.referencePreparation ? { referencePreparation: {
      ...plan.referencePreparation, references: Object.fromEntries(Object.entries(plan.referencePreparation.references).map(([role, entry]) => [role, {
        ...entry, prepared: { ...entry.prepared, path: entry.transformation.kind === 'unchanged' ? entry.prepared.path : '[private API derivative retained by hash]' }
      }]))
    } } : {}),
    nativeSourceFile, nativeSourceSHA256: normalized.nativeSHA256, nativeFormat: normalized.nativeFormat,
    normalization: normalized.nativeFormat === 'png' ? 'none-original-png' : 'lossless-decoded-webp-to-png; original bytes retained',
    sourceSHA256: sha256(bytes), returnedMetadata: { num_frames: state.result.num_frames, num_cols: state.result.num_cols,
      num_rows: state.result.num_rows, duration: state.result.duration }, derivedAtlasSHA256: sha256(json(atlas)),
    timingOrigin: 'derived-uniform-from-api-duration', schemaVersion: plan.pricing.specVersion,
    note: 'Native API sheet + metadata; not an original website ZIP. Raw responses retained privately. Runtime integration and visual approval pending.' };
  mkdirSync(destination, { recursive: true });
  if (nativeSourceFile !== 'spritesheet.png') writeFileSync(join(destination, nativeSourceFile), nativeBytes, { flag: 'wx' });
  writeFileSync(join(destination, 'spritesheet.png'), bytes, { flag: 'wx' });
  writeFileSync(join(destination, 'derived-atlas.json'), json(atlas), { flag: 'wx' });
  writeFileSync(join(destination, 'provenance.json'), json(provenance), { flag: 'wx' });
  const report = { label: config.label, status: 'source-collected-not-runtime-approved', sourceDir: relative(ROOT, destination), sourceSHA256: sha256(bytes),
    nativeSourceFile, nativeSourceSHA256: normalized.nativeSHA256,
    derivedAtlasSHA256: sha256(json(atlas)), provenanceSHA256: sha256(json(provenance)),
    creditsCharged: state.credits_charged ?? null, next: 'Agent continues the existing Stage 2 runtime integration/build/test/5173 preview. No new approval pause.' };
  save(join(dir, 'download.json'), report, true); print(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
