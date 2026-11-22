import { characterForegroundScale } from "./CharacterRenderMath.js";

// Optional rigid-object presentation driven by the interaction's own frame clock.
// No wall-clock animation continues while the game is paused, nor is transient
// state written into a save. Flags select exact static endpoints after reload.
export function interactionLayerPresentation(scene, player, flags = {}) {
  const config = scene?.interactionPresentation;
  if (!config) return null;
  const active = player?.animation === 'action' ? player.actionSequence?.sequence?.windowPresentation : null;
  const pending = player?.pendingInteraction?.actionSequence?.windowPresentation;
  const index = Math.max(0, Math.min(active?.frames?.length - 1 || 0, Number(player?.animator?.frameIndex) || 0));
  const frame = active ? active.frames[index] : flags[config.flag] ? config.openFrame : config.closedFrame;
  return { ...config, frame, sx: (frame % config.columns) * config.width,
    sy: Math.floor(frame / config.columns) * config.height,
    behindActor: (active || pending)?.behindActor !== false };
}

// Use the shared source registration and scale its offsets around the foot anchor.
export function scenePosePlacement(scene, player, frame, mirrored = false) {
  const p = scene?.characterPlacement;
  if (!p || player?.id !== p.characterId || frame?.frameWidth !== p.sourceWidth
    || frame?.frameHeight !== p.sourceHeight || !['east', 'west'].includes(player.facing)) return null;
  const scale = characterForegroundScale(scene, player.id, player.position);
  return { x: (mirrored ? p.westX : p.eastX) * scale, y: p.y * scale, w: p.w * scale, h: p.h * scale };
}
