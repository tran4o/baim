# Mitko front-to-west continuous turn and pocket entry — local runtime review

Owner accepted c05 source ("looks good"), then approved native gameplay appearance for local integration and interruption testing. This approval excludes publication. Original ZIP/GIF/sheet/JSON, exact prompt and observed Hydra+ settings are retained under `assets_src/characters/bai_mitko/turning_front_west_pocket_c05_20261017/`. Source and derivative hashes are bound in provenance and the reproducible builder. Review status remains `runtime_review`.

Gameplay trigger: ordinary final south/front arrival on the right half, visible gait contact0, centre-facing outcome west, ready art, no higher-priority interaction/action. Other gait phases/rear approaches retain existing fallback. The previously released front-to-east/contact0 pilot stays unchanged.

All36 source frames play at their native76ms/frame (2736ms), using one fixed uniform registration. c05 contains the turn and pocket entry; no cut to the old side-pocket source occurs in the middle. Completion holds the exact c05 final35 at identical draw geometry, with no extra controller placeholder strip or generated in-betweens. Uniform half-resolution full atlas is encoded losslessly after resizing. No art deformation, dissolve or arbitrary retiming.

Pocket entry begins at source14 (source13 is the preceding hands-out pose). A new click through13 cancels the turn and starts gait immediately. A click from14 onward cancels arrival and reverses the actually exposed c05 source frames down to13 before gait; native timing and zero travel during withdrawal keep hands outside pockets while moving. This also means a late click can have a longer hand-withdrawal interval than an early one; measure and review rather than crop the settling tail or accelerate it silently. Idle-to-walk uses the existing accepted start action and must be checked separately.

Preload/readiness and missing-art handling are per pilot slot. Missing/late c05 art cannot replay a deferred turn. Action/interaction priority, scene/reset cancellation and pauses use the existing systems. Source-phase0 is deliberately narrow, not broad turning coverage.

Preservation: a new inverse restores exact PR68 source and manifest bytes before the unchanged PR68→PR67→older inverses. Protected helper changes and bootstrap test expectation are included. Fixed historical hashes are not advanced. Targeted regressions include the complete affected historical chains.

Workflow: [animation checklist](../../workflow_evidence/animation-task-checklist.md) and [retained Ludo controls](../../workflow_evidence/ludo-ui-reference/README.md) are workspace-relative supplementary evidence. Current detailed local review and test receipts are in `extraFixes/mitko-turning-pilot-20261016/`; these are outside this repository, under its parent workspace. Full Windows verification requires an exact frozen administrator runner because native file-symlink security fixtures fail with EPERM in the sandbox. No assertions or tests are skipped.

No commit, push, PR, merge, deletion, listener restart, new port, VPS work, paid retry or recurring monitoring is authorized by this local integration. Exact-head CI and postmerge verification remain later publication gates.
