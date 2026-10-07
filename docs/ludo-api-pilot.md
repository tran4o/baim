# Ludo REST API — one-animation pilot

This development tool replaces website clicking/download transport, not the game renderer or visual approval. It is not a batch generator and never changes production asset selection automatically.

## Status and prerequisites

Tooling can be tested without an account or spending. The original Tony pilot was collected and published; that historical result does not prove compatibility for another model/reference. Verify current authentication, task/job ownership and service paid-enable state privately before each task. Pro/Studio API access is currently advertised by Ludo; verify your account's API Settings. No real generation is authorized by installing this tool.

Official references: [API guide](https://ludo.ai/developers/api), [OpenAPI schema](https://api.ludo.ai/api-documentation/openapi.json), [API credit/security documentation](https://ludo.ai/docs/api-mcp). Parameters/pricing were checked on 2026-10-01 against schema version 0.9.10. The tool checks current documented pricing again before submission and stops if it changes.

## Private setup — user action once

1. Create a named key in Ludo API Settings, for example `BAIM VPS pilot`. Treat it as a password; do not paste it into chat or a command argument.
2. In your VPS terminal, on the focused feature branch in `/home/ZeShad/baim`, run:

   ```bash
   npm run ludo:api -- setup
   ```

3. Paste the key into the hidden terminal prompt. It validates authentication without generation, then stores the key at `.git/ludo-api/key` with owner-only permissions. Existing keys are never overwritten automatically. Rotation/revocation needs a separate explicit decision.
4. Run `npm run ludo:api -- check`. This validates access; it never starts generation.

Setup/use first probes that the active port-5173 server blocks existing private files. If the older server is running, the tool stops before key entry/storage. The agent checks its exact PID, ZeShad ownership and checkout, then refreshes only that preview. Do not use broad `pkill`, sudo/root, port 5174 or another checkout. Do not enter the key until this protection check passes.

An existing `LUDO_API_KEY` environment variable is also supported. Never put it in a committed file, browser code, shell command history or logs. Private raw responses/job state stay in `.git/ludo-api/` (not served or tracked); signed result URLs are not copied into public provenance.

## Temporary Windows route

The explicitly approved PC primary checkout is `C:/Users/SveBiS/Desktop/myStuff/2026_GitPro/baim-local-active`. Its registered linked worktrees are also supported. On Windows, open the exact focused checkout in VS Code and use its integrated terminal. Set the non-secret checkout selector for that terminal only:

```powershell
$env:BAIM_LUDO_PC_ROOT = (Get-Location).Path
npm.cmd run ludo:api -- setup
```

Run setup only after tooling review, using the owner account. Paste a new owner-provided key only into the hidden prompt; never transfer the VPS key or place a key in PowerShell assignments/history. No key is needed for `plan` or `validate-plan`. The selector does not bypass canonical remote, focused branch, primary Git directory or registered worktree checks. VPS defaults still require the actual VPS hostname and primary path. This temporary route does not make the VPS workflow assistant pass on Windows.

Private directories and files on Windows are protected with native ACLs, allowing only the current owner and SYSTEM. Existing permissive state is rejected, not silently repaired. For migrated state owned by your current Windows account, the reviewed explicit `npm.cmd run ludo:api -- setup --protect-existing-state` command protects only that checkout's private API state tree before privacy verification/key entry. It preflights every entry, rejects links/hardlinks and foreign ownership, preserves all file contents, and refuses an existing key before any ACL migration. A partial ACL failure stops; no generation is attempted. Historical plans and consumed/uncertain jobs remain preserved and retain their original approval status. Setup checks preview privacy before requesting a key. An ACL failure is a real blocker; chmod is not a Windows privacy fix. The Codex sandbox account may lack ACL modification rights; run owner-side checks in VS Code. File-symlink regression fixtures may additionally require a temporary administrator VS Code terminal. Ordinary key setup should stay non-elevated.

The primary checkout retains `.git/ludo-api`. Linked worktrees retain their own state under the primary `.git/worktrees/NAME/ludo-api`, with logical `.git/ludo-api/...` reference paths resolved through the verified worktree pointer. The live primary preview on port 5173 is probed at the actual existing private file path. Preview guards remain unchanged; no preview restart is part of setup. Do not copy plans/jobs between worktrees or relabel consumed/uncertain work. New Windows plans bind both branch and resolved checkout/Git state paths. Existing job recovery keeps its original request IDs and exclusive intent behavior.

Pricing accepts explicit historical `min charge N credits` and current `shortest duration Ns, so N credits minimum` formats. Current Hydra's exact documented capability suffix is recognized; unknown suffixes, duplicate model lines, inconsistent arithmetic, wrong model identity and nonfinite/unbounded values stop preparation. The full original description hash is retained, including capability text and other model lines. The current Forge description supplies a rate but no explicit minimum; preparation stops rather than guessing a minimum. A schema version that remains 0.9.10 does not preserve approval when the description or reference schema changes.

`validate-plan` checks current pricing as well as references. Prepare a fresh immutable candidate after any binding change; historical c01/c02 state and c03 preparation are preservation evidence, not current spending authority. Tooling publication, hidden key setup, one exact generation decision, and later runtime publication remain separate gates. No paid request is needed for compatibility regression tests.

## Normal per-animation sequence

The agent creates the candidate configuration in task-owned ignored staging, such as `target/ludo-api/candidate.json`. Example structure only; replace the placeholders with an approved reference and its real hash:

```json
{
  "label": "character-reaction-c01",
  "reference": "assets_src/characters/character/external_animation_v1/references/approved.png",
  "referenceSHA256": "REPLACE_WITH_APPROVED_SHA256",
  "sourceDir": "assets_src/characters/character/external_animation_v1/input",
  "motionPrompt": "A restrained seated skeptical glance, then settle back.",
  "model": "hydra",
  "duration": 3,
  "frames": 25,
  "frameSize": 384,
  "loop": false
}
```

Optional `finalReference` and `finalReferenceSHA256` use an approved end-frame PNG. No middle-keyframe, motion-transfer, image editing, audio, pixel-art, paid-upscaling or batch endpoint is implemented. Hydra/Forge only; crop off, Auto margin and prompt augmentation on. Align and review returned art against approved registration; do not assume API settings guarantee matching motion/geometry.

1. Agent: `npm run ludo:api -- plan target/ludo-api/candidate.json`. This reads local reference hashes and public schema, then prints the saved plan hash and estimate. No key or generation required. Existing candidate plans are not overwritten.
2. Agent shows the exact prompt, references, settings, estimate and cap. User explicitly approves one generation with that cap. Example: “Approve character-reaction-c01, one generation, maximum 9 credits.” The CLI cap is a local preflight safeguard, not a server-enforced billing limit; investigate any discrepant actual charge.
3. Only after that approval, agent: `npm run ludo:api -- submit character-reaction-c01 --approve-plan PLAN_SHA256 --max-credits 9`. The tool rejects changed hashes/pricing/references, wrong checkout/branch, and repeat submission. It persists the request ID and an exclusive intent BEFORE its only paid POST. Setup/publication approvals never substitute for this spending approval.
4. Agent: `npm run ludo:api -- collect character-reaction-c01`. Each invocation performs at most one long-poll; respect returned `poll_after_ms`. Repeat free collection as needed while reporting progress. HTTP errors or failed/canceled jobs stop the task; no automatic regeneration or paid POST retry exists.
5. On success, download the original PNG once, validate transparency/grid/duration, and preserve native raw response privately. The tool produces a new source folder containing `spritesheet.png`, `derived-atlas.json` and sanitized `provenance.json`. It never overwrites an existing source package.
6. Agent continues existing Stage 2: inspect source, register/derive runtime art, update candidate provenance/manifests, build, focused/full tests, confirm manifest/source readiness, and review actual 1280x720 gameplay on port 5173. Collection is not a runnable animation and must not be published as a source-only delivery.
7. User reviews actual runtime and approves publication once. Follow the existing bundled publication/merge-if-green/sync/exact-cleanup gates.

## Automatic reference preparation

All new native CLI plans prepare references before estimating cost and hashing the plan. The manager's future-task bridge uses this same CLI. Original approved PNG paths, bytes and hashes remain unchanged. Only a private API derivative is resized; no production art is replaced, cropped, stretched, regenerated or upscaled. Model, duration, loop and framing settings stay as reviewed. Resampling is not lossless.

The tool fully decodes a bounded, single-page alpha PNG using Sharp (15 MB encoded, 16 million decoded pixels, maximum axis 16384). It rejects corrupt/unsupported images, orientation ambiguity, URLs, hidden/private source paths and symlink components. Different initial/final canvases require explicit registration reconciliation; equal canvases receive the same transform. Identical oversized references share one derivative.

For True Size (`frame_size:-9`), sources must be strictly below 1,000,000 pixels. The current official OpenAPI describes True Size's position/untrimmed framing but **does not document this numerical threshold**. The threshold comes from the retained 2026-10-03 provider error on the 981x1604 Baba reference. The local policy targets 990,000 pixels when resizing is necessary: `scale=sqrt(990000/(width*height))`, floor both output axes, Lanczos3 over the entire canvas, no crop or added padding. Integer rounding causes at most one pixel of axis error; no independent artistic registration adjustment is made. Compatible sources keep their exact bytes. Fixed frame exports retain bounded input bytes; no undocumented input threshold is invented.

Plan version 2 binds the original and prepared path/hash/decoded dimensions, actual request settings, constraint/schema fingerprint, transformation/version, Sharp/libvips versions and concise resize note. Derivatives live only in owner-only `.git/ludo-api/CANDIDATE/reference-SHA256.png`, blocked by the existing preview guard; private paths are redacted from public collected provenance. Reproducibility means the recorded algorithm, toolchain and exact retained bytes, not identical outputs across different Sharp/libvips releases.

Use `npm run ludo:api -- validate-plan CANDIDATE` before a spending offer. It checks the originals, exact prepared bytes/dimensions, settings and current schema without resizing or rewriting the plan. The separate manager follow-up must invoke this command for both saved-plan reuse and every spending quote; installing game tooling alone does not protect the existing manager card path. `submit` performs the same validation immediately before durable intent and the single paid POST. Changed originals/derivatives/settings/schema require a fresh reviewed plan and exact paid decision; nothing is silently re-prepared after approval.

Compatible legacy approved plans keep their original hash and byte-for-byte reference payload. Oversized legacy True Size plans stop before POST and require a new candidate/decision. Existing saved jobs remain collectible without reference migration or revalidation, preserving failed/uncertain jobs and receipt history. Never replay a consumed card, reset the bootstrap reservation or auto-retry a paid call.

Authentication/runtime readiness proves neither model/image compatibility nor generation success. These checks prevent the known local reference incompatibility and some invalid inputs; unrelated provider/account/network failures can still occur. Mocked tests never establish real billing, artwork quality or provider acceptance. No disposable generation is needed for validation.

Future focused chats must verify the live paid-enable state rather than copy dated disabled claims, retain current Telegram routing and decision receipts, and include the automatic preparation note in exact plan review. Send meaningful results/decisions through the existing guarded interfaces; no recurring AI checks or duplicate bot. Changes and publication still require the established separate approvals.

## Recovery and evidence

Connection loss preserves the original request ID and any response-header job ID. `collect` looks up existing jobs/results; it does not submit again. If recovery is ambiguous, stop and inspect that same request. Never mint a new label/request to bypass an uncertain or failed paid attempt.

Asset URLs expire after seven days per Ludo documentation. Download promptly. A failed download is not a failed generation: retain the response and retry collection, or obtain that same result manually. Download requests carry no API Authorization header, accept only explicitly allowed HTTPS Ludo/Google-storage hosts, and reject unsafe redirects. Unexpected hosts/schema/content require investigation, not guessing.

API grid/duration metadata does not supply per-frame timestamps. `derived-atlas.json` uses clearly labeled uniform timing from returned total duration. Human runtime review must verify timing, anchor stability, transparency, intro/return behavior and reaction priority before approval. Never claim derived timing is an original Ludo Sheet+JSON export. Original website ZIPs and previously approved assets remain unchanged.

Private state is durable job-recovery evidence, not disposable temp output. Retain it until source/runtime evidence and final publication are verified. List exact cleanup targets and ask before deleting it or rotating a key. Public provenance records actual reported credits (or null if unavailable), request/job IDs, submitted settings, approved reference hashes, downloaded source hash, derived-atlas hash and pending runtime status; never invent generation evidence.

The private response record preserves parsed native job/result fields, not an HTTP byte-for-byte transcript. The original downloaded sheet is preserved byte-for-byte. Do not describe reserialized response JSON or derived atlas JSON as an original website export.

## Verification and limits

Run focused API/security tests, the full browser-enabled `npm test`, `git diff --check` and `npm run workflow:review` before publication. Mock tests prove guards and transport behavior, not a real account, real billing or generation quality. Keep those limitations explicit until the live pilot passes. No engine/gameplay/approved art changes belong in the setup task.
