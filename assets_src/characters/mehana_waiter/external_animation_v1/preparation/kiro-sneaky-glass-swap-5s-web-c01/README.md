> Historical c01 preparation snapshot. c01 was subsequently rejected; owner-selected c02 is now implemented locally for runtime review. See ../../animation-pilot.json and ../../input/kiro-sneaky-glass-swap-5s-web-c02/README.md for current status. The historical text below is not fresh spending authority.

# Kiro sneaky glass swap — manual candidate c01

Prepared 8 October 2026. No generation, runtime integration or publication has occurred.
Candidate: `kiro-sneaky-glass-swap-5s-web-c01`; NPC: `npc.mehana_waiter`.
Branch: `feat/kiro-sneaky-glass-swap`, based on canonical `5484767bab0126b0a0504dd2efd97bf208735b07`.

## Reference and prompt

Upload [idle-frame-000.png](idle-frame-000.png), a lossless pixel crop of the approved polishing sheet's first frame. Use [prompt.txt](prompt.txt) exactly. [Reference provenance](reference-provenance.json) records original reference, ZIP, sheet and upload hashes. The original 698x2106 reference remains untouched; use the actual approved idle opening for closer continuity. Upload: RGBA PNG, 339x1024, 464278 bytes, SHA256 `b435c04743ec41fdb86c5f1df02b1bda50b518fcf094104936ce2861b0c99d9e`. Decoded pixels equal the retained prior opening-frame review. No resize, trim, recolor or generated pixels.

## Proposed manual settings

Ludo Sprite Generator, Animate, Character; Hydra; requested duration 5 seconds; First Frame = supplied PNG; no additional/final keyframe for this initial prompt-driven attempt. Auto margin; export True Size; maximum 36 frames; Loop Animation OFF. If the legacy whitespace toggle exists, keep it OFF. Preserve the full canvas and transparency. Runtime audio is outside this silent visual variation; retain any native audio with the original export without adding it to gameplay.

Public documentation checked on 8 October 2026 supports these controls. Hydra's documented estimate is 3 credits/second, hence 15 credits for five seconds. This is an estimate, not verified billing or the account's current displayed charge. No USD/subscription purchase is proposed. Sources: [Sprite Generator](https://ludo.ai/docs/sprite-generator), [account credit table](https://ludo.ai/docs/account).

The public Sprite Generator document does not publish numeric upload byte/dimension limits. The prepared PNG decodes, has genuine transparency and is under 0.5 MB, but current website acceptance and warning state remain unverified. Do not declare this gate passed from the historical successful export. Inspect the current non-generating settings/upload screen before spending. Do not tap Animate or an overlapping warning icon merely to inspect a warning; do not use a paid editor, Change Pose, Fix Loop, repair, reroll or alternative model.

## Five-second action direction

Suggested readability budget (direction, not provider-guaranteed timing): 0–0.5s stop polishing; 0.5–1.5s lower old glass and bring up replacement; 1.5–2.1s tiny spit gesture; 2.1–3.1s simultaneous sheepish smile/look; 3.1–5.0s settle and resume original polishing pose. The replacement must have the same silhouette/design so its identity can change without breaking the ending pose. Keep cloth in its original hand throughout. The mouth may make the small gesture, but there is no speech or gross spray. Small movements must remain readable at the existing 265px actor height.

Risks: several hand/prop beats in five seconds, model confusion about glass identity, mouth/cloth overlap, and imprecise final-pose matching. Prompt alone cannot guarantee these. Review the one returned candidate; if rushed/incoherent, report it and preserve the result. No automatic additional spending or duration change. The old loop is 36x133ms = 4788ms; the new requested five seconds does not imply an exactly 5000ms export. Inspect and record native frame timing; never silently retime to claim exact duration.

## Counter and continuity contract

Preserve left727/top222/height265, full-frame registration and actor z50. Renderer sorts descending z; counter_front z45 draws afterward and occludes the actor. Its approved opaque rear edge is y343–355, x720–824. At source scale265/1024, the top edge at scene y343 corresponds approximately to source y468; lowering glass/hands below that line should hide them. This is an inference for direction, not candidate evidence. Do not bake a counter into the transparent actor or change scene masks, anchor, scale, Tony seating or layout. Verify actual new motion against the complete irregular counter mask and at BG/EN runtime size. Final handoff must return to idle frame0/phase0 rather than jump to a global-clock middle pose; record any deterministic transition needed after inspecting the candidate.

## Scheduling preparation — design only, no enabled scaffold

Use a reusable Game-owned controller with injectable RNG and elapsed-time input; no RNG/timer mutations in Renderer. Sample `25000 + rng()*25000` milliseconds (RNG in [0,1)), within25–50 seconds. Count only eligible quiet game time in the active scene, with loaded approved polishing idle, no dialogue (any NPC), player/NPC speech, competing animation, scene transition, completion screen, editor, dev home or animation lab. Apply scheduling after interaction/speech updates so a dialogue entered on the threshold tick wins.

Pause/menu: freeze interval progress and an already-playing variation, consistent with current game motion/reaction semantics; never start behind the overlay. Conversation or scene exit cancels immediately and invalidates the active token. Conversation ending starts a fresh sampled interval; scene re-entry starts fresh. Successful completion restarts the interval after return to polishing. At due time, if art is unavailable, consume/skip that occurrence and start a fresh interval; loading later cannot replay it. No setTimeout queue, background catch-up, saved late event, or simultaneous reaction. Use the existing tick's eligible simulation delta; menus/inactive tabs do not accrue wall time. The old polishing renderer currently uses global time, so explicit return phase belongs in later integration, not a claimed existing capability.

## Verification after original candidate ZIP arrives

1. Preserve the original Sheet+JSON ZIP unchanged, filename/result ID (or precise reason unavailable), submitted prompt/settings, displayed credits and actual billing if observable. Check safe members, PNG decode, alpha, geometry, frame count, full-canvas alignment, native per-frame timings and total duration before deriving anything.
2. Derive optimized runtime assets; keep sources and baseline inventory. Integrate only as runtime_review, preserving approved polishing/static fallback and all Tony/Baba assets, dialogue/effects and scene geometry.
3. Deterministic clock/RNG tests: bounds/endpoints, eligible accrual, exact threshold, one-shot completion, fresh restart, dialogue threshold priority, menu freeze, scene exit/re-entry, cancellation token, missing/late-load skip, once-only consumption and no RNG side effects during repeated draws.
4. Actual BG and EN gameplay at1280x720: visual glass/cloth continuity, counter occlusion, idle handoff, dialogue cancel/pause/resume, menu freeze and fallback. Decode inventory/prior animation images and inspect console/page/network failures; HTTP200 alone is insufficient.
5. Run relevant preservation tests and full npm test for implementation. Compare against the frozen base inventory, not moving HEAD. Update catalog source/timing/provenance and verify HTML/PDF freshness. Run workflow review and git diff --check. Then obtain exact runtime/publication authority. Test the exact committed snapshot before approved push; merge only with exact-head green CI.

## Boundaries and next action

Immediate next action: owner uploads this PNG on Ludo's non-generating Animate setup screen, applies the listed settings, and provides the visible settings/cost/warning screenshot here without tapping Animate. This completes the missing live preflight; it is not a request to spend yet.

After that check, the generation decision can bind ONE Hydra5s c01 request at the verified displayed cost (expected15credits, maximum15 only if owner approves), no retries/paid repairs. A changed price or settings requires review before submission. The owner may generate manually and provide the completed original ZIP; that authorizes reversible PC runtime_review integration/testing without further mini-approvals. Visual acceptance and bundled commit/push/PR/green merge/PC synchronization/named cleanup remain separate. No VPS game sync, restart, API job reuse or destructive cleanup is implied.

PC-only single writer; no VPS coding worker, Windows bot, recurring checks or desktop wakeup bridge. Manual decisions and detailed reports stay here under the temporary PC routing exception; no Telegram message or hub completion notice is sent. Retain original exports, approved assets, failed/consumed historical API records and uncertain receipts. Future bulky recovery goes outside repos to `C:/Users/SveBiS/Desktop/myStuff/2026_GitPro/recovery_store/YYYY-MM-DD/task-id/` with verified manifests/restore instructions; no archive relocation/deletion authorized. Archive this chat only after verified completion.

Compact local evidence: `C:/Users/SveBiS/Desktop/myStuff/2026_GitPro/extraFixes/10_Bar/kiro-sneaky-glass-swap-5s-web-c01/`. No scratch checkout, dependency install, runtime build or VPS disk work. Budget recorded before cropping:64MiB estimated additional use plus2GiB reserve;246345768960bytes free. Actual package/evidence sizes are recorded after verification. No disposable deletion targets yet.
