// A source-reviewed arrival pilot, not a general facing/turn generator.
export function cancelArrivalTurn(player) {
  if (!player.arrivalTurn) return;
  player.arrivalTurn = null;
  player.directionalStopFrame = null;
  if (player.animation === 'walk' && player.walkPart === 'stop') {
    player.animation = player.speaking ? 'talk' : 'idle';
    player.walkPart = null;
    player.movementStopping = false;
    player.pendingStop = false;
  }
}

function priorityOwnsPose(player) {
  return player.pendingInteraction || player.pendingFacingPoint || player.speaking
    || player.actionSequence || player.actionAnimation || player.animation === 'action';
}

export function beginArrivalTurn(player, side) {
  const pilot = (player.arrivalTurnPilots || [player.arrivalTurnPilot])
    .find(candidate => candidate?.from === player.lastLocomotionFacing && candidate.to === side);
  const stop = player.walkPartsByFacing?.[side]?.stop;
  if (!pilot || !turnArtReady(player, pilot) || priorityOwnsPose(player)
    || player.lastLocomotionFacing !== pilot.from || side !== pilot.to
    || !pilot.entryFrameIndices.includes(player.animator?.frameIndex ?? -1)
    || !stop?.sourceFrameRects?.length) return false;
  player.arrivalTurn = { phase: 'turn', side, pilot };
  player.directionalStopFrame = pilot.frame;
  player.animation = 'walk';
  player.walkPart = 'stop';
  player.pendingStop = false;
  player.movementStopping = true;
  player.stopAnimationStarted = true;
  player.stopAnimationFinished = false;
  player.idleHoldFrame = null;
  return true;
}

// Return true while this controller owns the stationary stop. Complete every
// selected pivot frame at its explicit calibrated duration; AnimationPlayer's generic last-index test
// otherwise finishes phased strips one frame early.
export function updateArrivalTurn(player) {
  const state = player.arrivalTurn;
  if (!state) return false;
  if (priorityOwnsPose(player) || player.animation !== 'walk' || player.walkPart !== 'stop') {
    cancelArrivalTurn(player);
    return false;
  }
  if (!turnArtReady(player, state.pilot)) {
    const stop = player.walkPartsByFacing?.[state.side]?.stop;
    cancelArrivalTurn(player);
    player.facing = state.side;
    player.lastHorizontalFacing = state.side;
    player.idleHoldFrame = stop?.slot ? {frame:stop,slot:stop.slot,mirrored:Boolean(stop.mirrored),frameIndex:stop.frameCount-1} : null;
    return true; // Missing/late art cannot queue a delayed turn replay.
  }
  const frame = player.directionalStopFrame;
  if ((player.animator?.elapsed || 0) * frame.fps + 1e-9 < frame.frameCount) return true;
  if (state.pilot.continuous) {
    // No middle atlas or pose switch: hold the exact final source frame.
    player.facing = state.side;
    player.lastHorizontalFacing = state.side;
    player.idleHoldFrame = {frame, slot:frame.slot, mirrored:Boolean(frame.mirrored), frameIndex:frame.frameCount-1};
    player.arrivalTurn = null;
    player.directionalStopFrame = null;
    player.animation = 'idle';
    player.walkPart = null;
    player.movementStopping = false;
    player.pendingStop = false;
    player.stopAnimationFinished = true;
    return true;
  }
  if (state.phase === 'turn') {
    const stop = player.walkPartsByFacing[state.side].stop;
    const first = state.pilot.exitSourceFrame;
    const indices = Array.from({length:stop.sourceFrameRects.length-first},(_,i)=>first+i);
    const entryBounds = stop.sourceFrameContentBounds[first];
    const join = state.pilot.pocketJoin;
    player.facing = state.side;
    player.lastHorizontalFacing = state.side;
    player.directionalStopFrame = {...stop,facing:state.side,role:'stop',loop:false,frameStart:0,initialFrame:0,
      frameCount:indices.length,fps:state.pilot.pocketFps,
      frameRects:indices.map(i=>stop.sourceFrameRects[i]),
      frameContentBounds:indices.map(i=>stop.sourceFrameContentBounds[i]),
      // Register this distinct source once to the accepted turn's grounded size;
      // retain native pose variation instead of rescaling/re-anchoring each frame.
      contentBounds:entryBounds,registration:{visualHeight:join.visualHeight,baselineY:join.baselineY},
      anchor:{...stop.anchor,x:join.anchorX},
      // Original8 starts pocket entry; skip the duplicated settling step6–7.
      pocketEntryFrame:stop.frameStart+stop.pocketEntryFrame-first,
      movementSpeedMultipliers:indices.map(()=>0),stopRenderOffsetXStart:0,stopRenderOffsetYStart:0};
    state.phase = 'pocket';
    return true;
  }
  player.arrivalTurn = null;
  return false; // Existing stop completion holds the accepted final pocket pose.
}

function turnArtReady(player, pilot) {
  return player.arrivalTurnReadySlots?.[pilot.frame.slot] ?? player.arrivalTurnArtReady;
}
