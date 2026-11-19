# Collectible inspection contract

Every collectible in chapter content, including legacy-save items and every reachable replacement/print state, needs an editable Blender native source and a matching GLB. The native file must be self-contained; accepted artwork must remain unchanged and textures must be embedded in the GLB. Keep provenance hashes and the exact source-to-export relationship with the item assets.

An item manifest entry uses `model`, `nativeSource` (a repository-relative `.blend` path), and the existing `inspection` viewer profile. Distinct icon states use `inspectionModels` keyed by the exact `iconRules` slot, for example `pepaIcon`, `childIcon` or `stampedIcon`. Each state supplies its own matching model/native source. An absent state must not silently reuse another edition.

Both existing model viewers use `mountInspectionControls` from `InspectionControls.js`: pitch/yaw ±15°, zero roll, no automatic animation/spin, wheel zoom1–1.5, Home reset, and pointer release/cancel/lost capture. Model materials and authored resting camera direction remain independent of these shared controls. The inventory icon and item cursor are separate presentations; changing inspection never scales or tilts the thumbnail/cursor.

Model absence or load failure is an explicit unavailable state. Static image/text inspection is not a production substitute. Preserve the original icon for the inventory, not as a claim of a functioning3D model.

Before completing a new collectible or edition:

1. Verify native `.blend`, runtime GLB, embedded textures, artwork identity and provenance.
2. Acquire or construct the correct reachable state in a private gameplay context; open actual inventory **View**.
3. Exercise drag in both directions to the limits, wheel to both zoom limits, Home reset, pointer release/cancel and a pause at rest without drift.
4. Verify close/reopen, replacement/save-state selection, no page errors, and unchanged quest/item identity.
5. Register actual review stills in flat `baim/Previews`; retain the per-item matrix. Shared review/Telegram and publication gates remain separate.

Current R56 audit evidence lives under `.workspace/extraFixes/apartment-two-photo-20261024/interaction-review-r52/inventory-3d-audit-r56-20261112/`. Apartment owns runtime integration; the existing Blender workshop owns missing native asset work. Frozen PR81 remains distinct from these local changes.
