// Stopped interactions use the established horizontal rest family. Actual
// travelling and authored action poses keep their own directional policies.
export function interactionSideFacing(player, point) {
  const dx = Number(point?.x) - Number(player?.position?.x);
  if (Number.isFinite(dx) && Math.abs(dx) > 0.5) return dx < 0 ? 'west' : 'east';
  for (const facing of [player?.lastHorizontalFacing, player?.facing, player?.lastLocomotionFacing]) {
    if (facing === 'east' || facing === 'west') return facing;
  }
  return 'east';
}

export function canFaceStoppedInteraction(player, blocked = false) {
  return !blocked && !!player?.interactionFacingPoint && !player.target
    && player.animation !== 'walk' && player.animation !== 'action'
    && !player.actionSequence && !player.actionAnimation;
}

export function hasVerticalRest(player) {
  return ['north', 'south'].includes(player?.facing)
    || /_(north|south)(_|$)/.test(player?.idleHoldFrame?.slot || '')
    || ['north', 'south'].includes(player?.directionalStopFrame?.facing);
}
