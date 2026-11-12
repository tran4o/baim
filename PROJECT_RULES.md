# BAIM Project Rules

This file is the central working agreement for `/home/ZeShad/baim`. Read it before changing the repository. Keep detailed workflow rules here and project-specific game direction in `AGENTS.md` and the linked design documents.

## Inventory objects — owner rule, 12 November 2026

- Every current and future collectible must retain an editable, self-contained Blender `.blend` source and a matching runtime 3D model. Inventory **View** must open that model. A static picture, image transform or text fallback does not fulfill this requirement.
- Use the shared bottle inspection controls from `InspectionControls.js`: drag pitch/yaw bounded to ±15°, no roll, automatic spin or orbit, wheel zoom from1×to1.5×, Home reset and pointer release/cancellation. Preserve inventory thumbnail sizes independently from the approved40%/-8°item cursor.
- Verify all reachable item states and replacements. Alternate diploma prints, stamps, photos, consumed/refilled bottles and posted campaign editions must inspect the correct matching artwork/model for that state.
- Keep accepted artwork, stable item IDs, quest effects and save continuity. Reuse accepted native sources first. Missing native assets require a concrete Blender workshop handoff; never disguise a flat image as a completed3D inspection. Model loading failure must remain an explicit unavailable state, not silently show a static substitute.
- Follow `docs/inventory-3d-contract.md`; verify actual inventory View, bounded drag, wheel zoom, release/reset and model/native provenance before marking an item complete. This local followup does not amend frozenPR81 or authorize publication.

## Repository Boundary

- Work only in `/home/ZeShad/baim` unless the user explicitly names another location.
- Never modify `/home/ubuntu/git/baim` unless the user explicitly approves work in Itso's live checkout.
- Treat existing tracked and untracked changes as user work. Preserve them and stop if they overlap the requested task.
- Do not alter unrelated files, generated assets, approved content, or stable IDs.

## Work Mode Permissions

When operating in Work mode:

- Work may inspect, read, and edit files and run non-destructive commands, builds, and tests inside `/home/ZeShad/baim` without asking conversationally for each small step.
- Starting a focused task authorizes creation of its task branch and reversible implementation work inside that branch. Ludo candidate integration has the additional preview authorization described below.
- Work must not touch `/home/ubuntu/git/baim`.
- Work must ask before destructive actions; deleting or overwriting user work; committing; pushing; merging; or rewriting Git history.

## Start Every Session

1. Read `PROJECT_RULES.md`, `AGENTS.md`, `00_START_SESSION.md`, and `docs/Developer-Handbook/PERSONAL_RULES.md`.
2. Run `./start-session.sh` when it is available in the personal VPS checkout. It runs the tracked workflow assistant and reports the next safe step.
3. Before editing, verify the environment: inspect `hostname`, confirm the repository root is `/home/ZeShad/baim`, confirm the `marto` remote is `https://github.com/tran4o/baim.git`, and check the current branch, upstream, working tree, and recent commits.
4. Stop if the repository path, canonical remote, or expected working copy does not match. Do not silently substitute a Windows clone, another checkout, or Itso's live checkout.
5. Confirm the task scope, affected files, likely risks, and required verification.
6. Check `docs/Developer-Handbook/13_Daily_Learning_Log.md` for relevant prior lessons.
7. Check that the work is not already owned or underway by Itso, Marto, or another contributor.

## Chat And Task Organization

- Use the BAIM development hub for planning, prioritization, and cross-task decisions.
- Use a separate focused chat for each distinct implementation outcome or pull request.
- Keep one task, one branch, and one pull request together; start a new chat when the outcome or branch changes.
- Archive completed implementation chats after their work is merged and verified.

## Scope And Implementation

- Keep each task small, focused, reviewable, and easy to revert.
- Plan before editing and explain significant changes, affected files, and risks.
- Make reasonable small implementation decisions when they preserve the approved direction.
- Prefer reusable, data-driven behavior over one-off fixes and Chapter 1 hardcoding.
- Follow the established directory structure and the domain rules in `AGENTS.md`.
- Never rename stable gameplay IDs or replace approved content without explicit approval.
- Do not expand the task, refactor neighboring code, or clean up unrelated files without approval.

## Git And Approval Gates

- `tran4o/baim` is the canonical integration repository.
- `marto/master` is the canonical development base for new work.
- Itso's fork may be used for comparison or collaboration, but do not base new feature work on it unless explicitly requested.
- Never work directly on `master`.
- Use one descriptive task branch per task, normally under `feat/` when appropriate.
- One task should produce one focused pull request.
- Show the user the diff and verification results before asking for final approval.
- Make approval requests explicit about the exact next actions. Commit, push, pull-request creation/modification, merge-if-green, synchronization, and exact task cleanup may be bundled when the user clearly approves the whole sequence.
- Never commit, push, merge, open or modify a pull request, or rewrite history without explicit human approval.
- Recheck the branch and working tree immediately before any approved commit or push.

## Ludo Animation Candidate Workflow

Follow `docs/ludo-animation-production-workflow.md` for Ludo sprite-sheet work.

- The optional one-animation REST API pilot follows `docs/ludo-api-pilot.md`. Setup approval is not generation/spending approval. Require an exact reviewed plan, unchanged approved references and explicit maximum credit approval before the one paid submission; never generate or retry paid work automatically.
- Keep API credentials and raw job responses in protected private state, never player-facing assets, Git, chat or logs. API source collection is not runtime approval: continue the same feature-branch integration/testing/port-5173 preview before the normal publication decision. Preserve native API outputs; do not describe derived atlas timing or packages as original website exports.

- Ludo credit spending or generation controlled by the agent always requires explicit approval. When the user generates the candidate themselves, their choice to download it is the generation decision.
- Treat controls inside or overlapping Generate/Animate as generation actions, including warning icons. Never instruct a user to tap one merely to inspect a warning. For manual phone generation, explain the displayed cost before an intentional Generate/Animate tap; inspect uncertain warnings through a screenshot or separate non-generating help surface.
- Providing an exported Ludo ZIP or its path for a focused animation task authorizes the agent to inspect it, copy the unchanged source to the VPS task branch, record provenance, derive runtime assets, integrate it as `runtime_review`, run builds/tests, and serve or refresh the candidate on port 5173. Do not stop for separate approvals between those reversible preview steps.
- Review the candidate in the real VPS runtime at 1280x720. Do not use the obsolete Windows clone as an animation staging or merge step, and never use port 5174.
- Keep the candidate uncommitted and unpublished until the user has seen it on the VPS. Do not create a source-only PR when the intended outcome is a runnable animation; source, provenance, runtime integration, and tests belong to one task branch and one PR.
- Before final approval, show the complete diff, verification results, PR scope, and exact branch/temporary-file cleanup targets.
- After VPS visual review, one explicit `approve runtime and publish` decision may authorize marking the candidate `runtime_approved`, committing, pushing to `zeshad`, creating the PR against `tran4o/baim:master`, merging after required checks pass, synchronizing `/home/ZeShad/baim` master, rebuilding ignored runtime outputs, and performing the listed task cleanup.
- That bundled approval expires if checks fail, the scope changes materially, or the branch changes after review. Stop and explain the new decision instead of merging altered work.
- Rejected or revised candidates remain on the same focused branch until accepted or explicitly abandoned. Record rejection reasons when the provenance schema supports them.

## After A Pull Request Is Merged

1. Verify the pull request is merged into `tran4o/baim:master` and record the merge commit.
2. Confirm the current working tree is safe, switch to local `master`, and fast-forward it to `marto/master`.
3. Verify local `master` exactly matches `marto/master` and the working tree is clean.
4. Identify the merged task branch and only the temporary files created for that task.
5. Before deleting branches or files, list the exact cleanup targets and obtain explicit approval unless that exact cleanup was already authorized for the task.
6. After approval, delete the merged local branch, delete the matching `zeshad` branch, remove only task-owned temporary files, and prune stale references.
7. Finish by reporting the branch, canonical commit, working-tree state, preserved services/resources, and any intentionally retained files or branches.

The message `merged` authorizes merge verification and synchronization. It does not by itself authorize deletion unless the user has already established that cleanup permission for the task.

## Collaboration

- Avoid duplicating work owned by Itso, Marto, or another contributor.
- Announce task ownership before substantial implementation when working in a shared workflow.
- Keep changes easy for another contributor to inspect, test, and revert.
- Record durable workflow lessons in `docs/Developer-Handbook/13_Daily_Learning_Log.md` only when the task calls for it.

## Verification

- Inspect the final diff for scope, accidental changes, secrets, and generated noise.
- Run `npm run workflow:review` before requesting commit approval. It performs read-only workflow and diff checks, detects visual/Ludo-sensitive files, and prints the remaining human gates.
- Run the smallest relevant checks while developing, then run `npm test` for code changes unless the task clearly does not affect code.
- Run `git diff --check` before presenting work for approval.
- Add or update tests when changing localization, save schema/defaults, geometry, quest state, inventory state, or dialogue effects.
- Verify behavior in the actual runtime when changing visuals or interaction; isolated previews are not sufficient.
- Report any check that could not be run and why.
- Quiet test output does not establish a hang. Report the active phase and elapsed time; inspect process state and the configured timeout before stopping a task-owned test process. Report interrupted runs as incomplete, never as passing.
- Before publication, reconcile approval status/date in source prompts, animation manifests, and review notes. Retain verification evidence in a durable documented location before deleting temporary review files.
- When updating generated catalogs, verify the corresponding HTML and PDF describe the same approved runtime state; HTML freshness alone does not verify the PDF.

## Art And Content Safeguards

- Generated art is a proposal, not approved production art.
- Obtain human visual approval before replacing or integrating scene art.
- Preserve approved source assets unless replacement is explicitly requested.
- Follow the art, animation, localization, humor, and satire-intake rules referenced by `AGENTS.md`.
- Keep all player-facing content naturally authored in both Bulgarian and English.

## Communication And Learning

- State assumptions and decision points clearly.
- Explain important architectural and Git choices in plain language so the project owner can learn from the work.
- End each task with the changed files, verification performed, remaining risks, and the exact approval needed for any next step.
