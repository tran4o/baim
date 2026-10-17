import { moveToward } from "./geometry.js";
import { beginArrivalTurn, cancelArrivalTurn, updateArrivalTurn } from "./ArrivalTurn.js";

const WALK_TARGET_EPSILON = 4;
// Shorter than half the accepted 864–1088ms gait cycles. Units are seconds,
// so the ramp follows world travel/cadence rather than viewport pixels.
export const WALK_ACCELERATION_SECONDS = 0.24;
export const WALK_START_SPEED_RATIO = 0.35;
// Three complete published side cycles (16 / 20fps), measured before calibration.
// This is reachable-route cruise time, independent of viewport/window size.
export const LONG_WALK_CRUISE_SECONDS = 2.4;
export const LONG_WALK_RATIO = 1.2;

export function plannedWalkSeconds(player, path, heightAt = () => player.walkVisualHeight) {
  let previous = player.position, seconds = 0;
  const probe = { ...player };
  for (const point of path) {
    const length = pointDistance(previous, point);
    if (!length) continue;
    probe.facing = facingFromDelta(point.x - previous.x, point.y - previous.y, probe);
    const loop = walkPartsForFacing(probe)?.loop;
    const multipliers = loop?.movementSpeedMultipliers;
    const mean = multipliers?.length ? multipliers.reduce((a, b) => a + b, 0) / multipliers.length : 1;
    const samples = Math.max(1, Math.ceil(length / Math.max(1, heightAt(previous) || 300) * 4));
    for (let i = 0; i < samples; i++) {
      const t = (i + .5) / samples;
      probe.walkVisualHeight = heightAt({ x: previous.x + (point.x - previous.x) * t,
        y: previous.y + (point.y - previous.y) * t });
      seconds += length / samples / Math.max(.001, walkingTravelSpeed(probe) * mean);
    }
    previous = point;
  }
  return seconds;
}

function journeyRatioAt(player, elapsed) {
  const from = player.walkJourneyFromRatio ?? 1, to = player.walkJourneyRatio ?? 1;
  const t = Math.max(0, Math.min(1, elapsed / WALK_ACCELERATION_SECONDS));
  return from + (to - from) * t * t * (3 - 2 * t);
}

export function calibratedWalkTime(player, elapsed, dt) {
  if ((player.walkJourneyFromRatio ?? 1) === (player.walkJourneyRatio ?? 1)
    || (player.walkJourneyElapsed || 0) >= WALK_ACCELERATION_SECONDS) {
    return walkRampTime(elapsed, dt) * (player.walkJourneyRatio ?? 1);
  }
  // Four-point Gauss integration is exact for the product of the two cubic ramps.
  // Split their endpoints so frame rate/retarget timing cannot change distance.
  const boostElapsed = player.walkJourneyElapsed || 0;
  const cuts = [0, dt, WALK_ACCELERATION_SECONDS - elapsed, WALK_ACCELERATION_SECONDS - boostElapsed]
    .filter(t => t >= 0 && t <= dt).sort((a, b) => a - b);
  const nodes = [-.8611363115940526, -.3399810435848563, .3399810435848563, .8611363115940526];
  const weights = [.3478548451374538, .6521451548625461, .6521451548625461, .3478548451374538];
  let total = 0;
  for (let i = 1; i < cuts.length; i++) {
    const half = (cuts[i] - cuts[i - 1]) / 2, mid = (cuts[i] + cuts[i - 1]) / 2;
    for (let j = 0; j < nodes.length; j++) {
      const t = mid + half * nodes[j];
      total += half * weights[j] * walkSpeedRatio(elapsed + t) * journeyRatioAt(player, boostElapsed + t);
    }
  }
  return total;
}

export function walkSpeedRatio(elapsed = 0) {
  const t = Math.max(0, Math.min(1, elapsed / WALK_ACCELERATION_SECONDS));
  return WALK_START_SPEED_RATIO + (1 - WALK_START_SPEED_RATIO) * t * t * (3 - 2 * t);
}

function rampIntegral(elapsed) {
  const time = Math.max(0, elapsed);
  const t = Math.min(1, time / WALK_ACCELERATION_SECONDS);
  return WALK_START_SPEED_RATIO * time + (1 - WALK_START_SPEED_RATIO)
    * (WALK_ACCELERATION_SECONDS * (t ** 3 - t ** 4 / 2) + Math.max(0, time - WALK_ACCELERATION_SECONDS));
}

export function walkRampTime(elapsed, dt) {
  if (elapsed >= WALK_ACCELERATION_SECONDS) return dt;
  return rampIntegral(elapsed + dt) - rampIntegral(elapsed);
}

export class MovementSystem {
  constructor(player) {
    this.player = player;
  }

  walkTo(point, facingPoint = point, path = null, options = {}) {
    const previousPart = this.player.walkPart;
    const previousParts = walkPartsForFacing(this.player);
    const previousStart = this.player.locomotionStartFrame || previousParts?.start;
    const previousStop = this.player.directionalStopFrame || previousParts?.stop;
    const previousIndex = this.player.animator?.frameIndex || 0;
    const wasTurning = this.player.arrivalTurn?.phase === "turn"
      && (!Number.isInteger(previousStop?.pocketEntryFrame) || previousIndex < previousStop.pocketEntryFrame);
    const wasStopping = this.player.animation === "walk" && previousPart === "stop";
    const wasWalking = this.player.animation === "walk" && (this.player.target || this.player.walkPart === "start" || this.player.walkPart === "loop" || this.player.walkPart === "short");
    const waypoints = Array.isArray(path) && path.length ? path.map((waypoint) => ({ ...waypoint })) : [{ ...point }];
    while (waypoints.length > 1 && pointDistance(this.player.position, waypoints[0]) <= WALK_TARGET_EPSILON) waypoints.shift();
    const firstPoint = waypoints.shift() || { ...point };
    const finalPoint = waypoints.length ? waypoints.at(-1) : firstPoint;
    const dx = finalPoint.x - this.player.position.x;
    const dy = finalPoint.y - this.player.position.y;
    // Preserve no-op state; reset acceleration only for a genuine new walk.
    if (Math.hypot(dx, dy) <= WALK_TARGET_EPSILON) return false;
    cancelArrivalTurn(this.player);
    // Choose from the whole reachable command once, never remaining distance.
    // A short retarget keeps established brisk travel until actual arrival;
    // upgrading a moving short command eases in without replaying its start.
    if (options.calibrateLongJourney) {
      const seconds = plannedWalkSeconds(this.player, [firstPoint, ...waypoints], options.heightAt);
      const requested = seconds >= LONG_WALK_CRUISE_SECONDS ? LONG_WALK_RATIO : 1;
      const previousRatio = wasWalking ? this.player.walkJourneyRatio ?? 1 : 1;
      if (!wasWalking) {
        this.player.walkJourneyRatio = requested;
        this.player.walkJourneyFromRatio = requested;
        this.player.walkJourneyElapsed = 0;
      } else if (requested > previousRatio) {
        this.player.walkJourneyFromRatio = journeyRatioAt(this.player, this.player.walkJourneyElapsed || 0);
        this.player.walkJourneyRatio = requested;
        this.player.walkJourneyElapsed = 0;
      }
      this.player.walkPlannedSeconds = seconds;
    } else if (!wasWalking) {
      this.player.walkJourneyRatio = 1;
      this.player.walkJourneyFromRatio = 1;
      this.player.walkJourneyElapsed = 0;
    }
    rememberHorizontalFacing(this.player, this.player.facing);
    this.player.arrivalSceneCentreX = options.sceneCentreX;
    this.player.lastLocomotionFacing = null;
    if (!wasWalking) this.player.walkTravelElapsed = 0;
    this.player.idleHoldFrame = null;
    this.player.directionalStopFrame = null;
    this.player.idleVariant = null;
    this.player.idleVariantQueue = [];
    this.player.facing = facingFromDelta(firstPoint.x - this.player.position.x, firstPoint.y - this.player.position.y, this.player);
    this.player.target = { ...firstPoint };
    this.player.arrivalFacing = options.arrivalFacing || null;
    this.player.walkPath = waypoints;
    this.player.animation = "walk";
    this.player.shortWalk = false;
    this.player.pendingStop = false;
    this.player.movementStopping = false;
    this.player.stopAnimationStarted = false;
    this.player.stopAnimationFinished = false;
    const parts = walkPartsForFacing(this.player);
    const pocketStart = Number.isInteger(parts?.start?.pocketExitFrame);
    if (pocketStart) this.player.shortWalk = false;
    this.player.locomotionStartFrame = null;
    this.player.walkPart = this.player.shortWalk && parts?.short ? "short" : wasWalking ? "loop" : parts?.start ? "start" : "loop";
    if (pocketStart && wasTurning) {
      this.player.walkPart = "loop"; // Pivot hands are already outside pockets.
    } else if (pocketStart && wasWalking && previousPart === "start" && Number.isInteger(previousStart?.pocketExitFrame)) {
      this.player.walkPart = "start";
      this.player.locomotionStartFrame = {
        ...(previousStart?.resumePocketExit ? previousStart : parts.start),
        initialFrame: previousIndex, facing: walkFacing(this.player), mirrored: Boolean(parts.start.mirrored)
      };
    } else if (pocketStart && wasStopping && Number.isInteger(previousStop?.pocketEntryFrame)) {
      if (previousIndex < previousStop.pocketEntryFrame) this.player.walkPart = "loop";
      else {
        this.player.locomotionStartFrame = reversePocketEntry(previousStop, previousIndex, parts.start);
        this.player.locomotionStartFrame.facing = walkFacing(this.player);
        this.player.locomotionStartFrame.mirrored = Boolean(parts.start.mirrored);
        this.player.walkPart = "start";
        syncAnimatorToWalkPartStart(this.player, this.player.locomotionStartFrame);
      }
    }
    if (!wasWalking && (this.player.walkPart === "start" || this.player.walkPart === "short")) {
      syncAnimatorToWalkPartStart(this.player, parts?.[this.player.walkPart]);
    }
    return true;
  }

  update(dt) {
    if (this.player.animation === "action") { cancelArrivalTurn(this.player); return; }
    if (!this.player.target) {
      this.player.walkTravelElapsed = 0;
      this.player.walkCadenceRatio = 1;
      this.player.walkJourneyRatio = 1;
      if (updateArrivalTurn(this.player)) return;
      if (this.player.animation === "walk" && this.player.walkPart === "stop" && !this.player.animator?.isFinished()) {
        this.player.movementStopping = true;
        return;
      }
      if (this.player.animation === "walk" && this.player.walkPart === "stop") {
        this.player.locomotionStartFrame = null;
        this.player.stopAnimationFinished = true;
        this.player.movementStopping = false;
        this.player.pendingStop = false;
        this.player.animation = this.player.speaking ? "talk" : "idle";
        this.player.walkPart = null;
        this.player.shortWalk = false;
        return;
      }
      if (this.player.pendingStop) {
        this.player.animation = "walk";
        this.player.movementStopping = true;
        this.player.stopExitFrame = stopExitFrameForPlayer(this.player);
        beginWalkStop(this.player);
        return;
      }
      this.player.animation = this.player.speaking ? "talk" : "idle";
      this.player.walkPart = null;
      this.player.shortWalk = false;
      return;
    }
    if (this.player.animation === "walk" && this.player.walkPart === "start" && this.player.animator?.isFinished()) {
      this.player.walkPart = "loop";
      this.player.locomotionStartFrame = null;
      return;
    }
    const motionMultiplier = walkMotionMultiplierForFrame(this.player);
    if (motionMultiplier <= 0) return;
    const elapsed = this.player.walkTravelElapsed || 0;
    const duration = Math.max(0, Number(dt) || 0);
    const rampTime = calibratedWalkTime(this.player, elapsed, duration);
    this.player.walkTravelElapsed = elapsed + duration;
    this.player.walkJourneyElapsed = (this.player.walkJourneyElapsed || 0) + duration;
    this.player.walkCadenceRatio = duration > 0 ? rampTime / duration : walkSpeedRatio(elapsed);
    let travel = walkingTravelSpeed(this.player) * motionMultiplier * rampTime;
    // Consume the same distance budget across corners; do not lose a frame at
    // each waypoint or round the destination to an anticipatory stop radius.
    while (this.player.target) {
      const from = this.player.position;
      const segment = pointDistance(from, this.player.target);
      this.player.position = moveToward(from, this.player.target, travel);
      if (segment > 0) this.player.facing = facingFromDelta(this.player.target.x - from.x, this.player.target.y - from.y, this.player);
      if (pointDistance(from, this.player.position) > 0) {
        this.player.lastLocomotionFacing = walkFacing(this.player);
        rememberHorizontalFacing(this.player, this.player.lastLocomotionFacing);
      }
      if (travel < segment) break;
      travel = Math.max(0, travel - segment);
      if (!this.player.walkPath?.length) break;
      this.player.target = this.player.walkPath.shift();
      if (travel === 0) break;
    }
    if (this.player.position.x === this.player.target.x && this.player.position.y === this.player.target.y) {
      if (this.player.walkPath?.length) {
        this.player.target = this.player.walkPath.shift();
        return;
      }
      this.player.target = null;
      this.player.walkTravelElapsed = 0;
      this.player.walkCadenceRatio = 1;
      this.player.walkPath = [];
      const restFacing = centreFacingAtArrival(this.player);
      this.player.arrivalSceneCentreX = null;
      if (this.player.arrivalFacing) this.player.facing = this.player.arrivalFacing;
      this.player.arrivalFacing = null;
      if (restFacing) {
        if (beginArrivalTurn(this.player, restFacing)) return;
        holdSidePocketRest(this.player, restFacing);
        return;
      }
      const parts = walkPartsForFacing(this.player);
      if (parts?.loop?.settleOnStop) {
        requestWalkStop(this.player);
      } else if (this.player.shortWalk) {
        this.player.animation = this.player.speaking ? "talk" : "idle";
        this.player.walkPart = null;
        this.player.shortWalk = false;
        this.player.idleHoldFrame = null;
      } else if (parts?.stop) {
        requestWalkStop(this.player);
      } else {
        this.player.animation = "idle";
        this.player.walkPart = null;
        this.player.shortWalk = false;
      }
    }
  }
}

function rememberHorizontalFacing(player, facing) {
  const horizontal = eastWestFallbackFacing(facing);
  if (horizontal) player.lastHorizontalFacing = horizontal;
}

// Only an actual final vertical locomotion segment earns this ordinary-rest
// default. Interaction/object facing and authored actions own their own stops.
export function centreFacingAtArrival(player) {
  if (!Number.isFinite(player.arrivalSceneCentreX) || player.arrivalFacing
    || player.pendingInteraction || player.pendingFacingPoint || player.speaking
    || player.actionSequence || player.actionAnimation
    || !["north", "south"].includes(player.lastLocomotionFacing)) return null;
  const delta = player.position.x - player.arrivalSceneCentreX;
  if (Math.abs(delta) <= 1e-6) return eastWestFallbackFacing(player.lastHorizontalFacing) || "east";
  return delta < 0 ? "east" : "west";
}

function holdSidePocketRest(player, facing) {
  // Honest facing/pose switch, not a turning animation. The side stop's first
  // frames still step; hold its accepted final pocketed pose at the same feet.
  const frame = player.walkPartsByFacing?.[facing]?.stop;
  player.facing = facing;
  rememberHorizontalFacing(player, facing);
  player.idleHoldFrame = frame?.slot ? {
    frame, slot: frame.slot, mirrored: Boolean(frame.mirrored),
    frameIndex: Math.max(0, frame.frameCount - 1)
  } : null;
  player.animation = "idle";
  player.walkPart = null;
  player.shortWalk = false;
  player.pendingStop = false;
  player.movementStopping = false;
  player.stopAnimationStarted = false;
  player.stopAnimationFinished = true;
  player.directionalStopFrame = null;
  player.locomotionStartFrame = null;
}

function pointDistance(a, b) {
  return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
}

function syncAnimatorToWalkPartStart(player, frame) {
  if (!player.animator || !frame) return;
  const frameCount = Math.max(1, Number(frame.frameCount) || 1);
  const initialFrame = Math.max(0, Math.min(Number(frame.initialFrame) || 0, frameCount - 1));
  const fps = Number(frame.fps) || 1;
  player.animator.frameIndex = initialFrame;
  player.animator.elapsed = initialFrame / fps;
}

export function requestWalkStop(player) {
  player.walkTravelElapsed = 0;
  player.walkCadenceRatio = 1;
  const parts = walkPartsForFacing(player);
  const start = player.locomotionStartFrame || parts?.start;
  if (player.walkPart === "start" && !start?.resumePocketExit && Number.isInteger(start?.pocketExitFrame)
    && (player.animator?.frameIndex || 0) < start.pocketExitFrame) {
    const sourceIndex = start.frameRects[player.animator?.frameIndex || 0].sourceFrameIndex;
    const indices = Array.from({ length: sourceIndex + 1 }, (_, i) => sourceIndex - i);
    player.directionalStopFrame = pocketFrameRange(start, indices, "stop", true);
    player.directionalStopFrame.facing = walkFacing(player);
    player.directionalStopFrame.pocketEntryFrame = 0;
    player.directionalStopFrame.pocketCancellation = true;
    player.locomotionStartFrame = null;
    player.target = null;
    player.walkPath = [];
    player.shortWalk = false;
    beginWalkStop(player);
    return;
  }
  if (parts?.loop?.settleOnStop) {
    player.directionalStopFrame = directionalSettleFrame(parts.loop, player.animator?.frameIndex || 0);
    player.target = null;
    player.walkPath = [];
    player.shortWalk = false;
    beginWalkStop(player);
    return;
  }
  if (!parts?.stop) {
    player.target = null;
    player.walkPath = [];
    player.animation = player.speaking ? "talk" : "idle";
    player.walkPart = null;
    player.shortWalk = false;
    player.pendingStop = false;
    return;
  }
  player.target = null;
  player.walkPath = [];
  player.animation = "walk";
  player.shortWalk = false;
  player.walkPart = player.walkPart === "start" ? "start" : "loop";
  player.pendingStop = true;
  player.movementStopping = true;
  player.stopAnimationStarted = false;
  player.stopAnimationFinished = false;
  player.stopExitFrame = stopExitFrameForPlayer(player);
  beginWalkStop(player);
}

export function beginWalkStop(player) {
  player.animation = "walk";
  player.walkPart = "stop";
  player.pendingStop = false;
  player.movementStopping = true;
  player.stopAnimationStarted = true;
  player.stopAnimationFinished = false;
  player.canExitToStop = false;
}

export function canExitToStop(player) {
  if (!player.pendingStop || player.animation !== "walk" || player.walkPart !== "loop") return false;
  const parts = walkPartsForFacing(player);
  const loop = parts?.loop;
  if (!loop?.frameCount) return true;
  const frameIndex = ((player.animator?.frameIndex ?? 0) % loop.frameCount + loop.frameCount) % loop.frameCount;
  return frameIndex === stopExitFrameForPlayer(player);
}

export function stopExitFrameForPlayer(player) {
  const parts = walkPartsForFacing(player);
  const loop = parts?.loop;
  const configured = Number(loop?.stopExitFrame ?? parts?.stopExitFrame ?? 0);
  const frameCount = Math.max(1, Number(loop?.frameCount) || 1);
  return Number.isFinite(configured) ? ((Math.trunc(configured) % frameCount) + frameCount) % frameCount : 0;
}

export function walkPartsForFacing(player) {
  const facing = walkFacing(player, player.facing);
  return facing ? player.walkPartsByFacing?.[facing] : null;
}

export function walkFacing(player, facing = player.facing) {
  if (player.walkPartsByFacing?.[facing]?.loop) return facing;
  return eastWestFallbackFacing(facing);
}

export function walkingTravelSpeed(player) {
  const loop = walkPartsForFacing(player)?.loop;
  if (loop?.gaitSpeedPerVisualHeight && player.walkVisualHeight > 0) {
    return loop.gaitSpeedPerVisualHeight * player.walkVisualHeight * (player.directionalSpeedScale || 1);
  }
  return player.speed;
}

// Settle through the remaining native half-stride, never through a side-facing clip.
export function directionalSettleFrame(loop, frameIndex) {
  const count = loop.frameCount;
  const start = ((Math.trunc(frameIndex) % count) + count) % count;
  const rests = loop.restFrames || [0];
  let end = start;
  while (!rests.includes(end % count) && end - start < count) end++;
  const indices = Array.from({ length: end - start + 1 }, (_, i) => (start + i) % count);
  const bounds = indices.map(i => loop.frameContentBounds[i]);
  return { ...loop, role: "stop", loop: false, initialFrame: 0, frameStart: 0,
    frameCount: indices.length, frameRects: indices.map(i => loop.frameRects[i]),
    frameContentBounds: bounds, movementSpeedMultipliers: indices.map(() => 0),
    nativeSettleIndices: indices };
}

export function eastWestFallbackFacing(facing) {
  if (facing === "east" || facing === "north_east" || facing === "south_east") return "east";
  if (facing === "west" || facing === "north_west" || facing === "south_west") return "west";
  return null;
}

export function walkMotionMultiplierForFrame(player) {
  if (player.animation === "walk" && player.walkPart === "start" && player.locomotionStartFrame) {
    return motionMultiplierAtFrame(player.locomotionStartFrame.movementSpeedMultipliers, player.animator?.frameIndex || 0, 0);
  }
  const facing = player.facing || "south";
  const fallbackFacing = walkFacing(player, facing) || {
    south_east: "south",
    south_west: "south",
    north_east: "north",
    north_west: "north"
  }[facing] || facing;
  const movementStartFrame = player.walkMovementStartFrameByFacing?.[fallbackFacing] || 0;
  const index = player.animator?.frameIndex ?? 0;
  if (player.animation === "walk" && index < movementStartFrame) return 0;
  const part = player.walkPart || "loop";
  const multipliers = player.walkMotionMultipliersByFacing?.[fallbackFacing]?.[part] || player.walkMotionMultipliersByFacing?.[fallbackFacing] || player.walkMotionMultipliers;
  if (!Array.isArray(multipliers) || !multipliers.length || player.animation !== "walk") return 1;
  return motionMultiplierAtFrame(multipliers, index, 0);
}

export function motionMultiplierAtFrame(multipliers, frameIndex, missingFrameFallback = 1) {
  if (!Array.isArray(multipliers) || !multipliers.length) return missingFrameFallback;
  const index = ((Math.trunc(Number(frameIndex) || 0) % multipliers.length) + multipliers.length) % multipliers.length;
  const value = Number(multipliers[index]);
  return Number.isFinite(value) && value >= 0 ? value : missingFrameFallback;
}

export function facingFromDelta(dx, dy, player) {
  const fallback = player.facing || "south";
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  const bias = player.verticalDirectionBias || 1;
  const adjustedDy = dy * bias;
  const degrees = (Math.atan2(adjustedDy, dx) * 180) / Math.PI;
  let facing;
  if (degrees >= -22.5 && degrees < 22.5) facing = "east";
  else if (degrees >= 22.5 && degrees < 67.5) facing = "south_east";
  else if (degrees >= 67.5 && degrees < 112.5) facing = "south";
  else if (degrees >= 112.5 && degrees < 157.5) facing = "south_west";
  else if (degrees >= 157.5 || degrees < -157.5) facing = "west";
  else if (degrees >= -157.5 && degrees < -112.5) facing = "north_west";
  else if (degrees >= -112.5 && degrees < -67.5) facing = "north";
  else facing = "north_east";

  if (Math.abs(dy) >= Math.abs(dx) * 0.35) {
    if (dy > 0 && facing === "east") facing = "south_east";
    if (dy < 0 && facing === "east") facing = "north_east";
    if (dy > 0 && facing === "west") facing = "south_west";
    if (dy < 0 && facing === "west") facing = "north_west";
  }
  if (hasEastWestWalkOnly(player)) {
    if (dx > 0.01) facing = "east";
    else if (dx < -0.01) facing = "west";
    else facing = eastWestFallbackFacing(player.facing) || "east";
  } else if (player.walkPartsByFacing?.north?.loop && player.walkPartsByFacing?.south?.loop) {
    // Preserve side-facing diagonals with a small dead band at vertical sector edges.
    const vertical = degrees < 0 ? "north" : "south";
    const center = degrees < 0 ? -90 : 90;
    const distance = Math.abs(degrees - center);
    if (player.facing === vertical && distance < 27.5) facing = vertical;
    else if (facing === vertical && player.facing && player.facing !== vertical && distance > 17.5) facing = player.facing;
  }
  player.facingDebug = { dx, dy, adjustedDx: dx, adjustedDy, angle: degrees, selectedFacing: facing };
  return facing;
}

export function hasEastWestWalkOnly(player) {
  const parts = player.walkPartsByFacing || {};
  return Boolean(parts.east && parts.west && !parts.north && !parts.south);
}

// Reverse only existing approved hand-entry frames when a stop is interrupted.
function reversePocketEntry(stop, index, start) {
  if (stop.pocketCancellation) {
    const first = Math.max(start.frameStart, stop.frameRects[Math.min(index, stop.frameCount - 1)].sourceFrameIndex);
    const last = start.frameStart + start.pocketExitFrame;
    const indices = Array.from({ length: Math.max(1, last - first + 1) }, (_, i) => first + i);
    const frame = pocketFrameRange(start, indices, "start", true);
    return { ...frame, pocketExitFrame: indices.length - 1, resumePocketExit: true };
  }
  const end = Math.max(0, stop.pocketEntryFrame - 1);
  const first = Math.min(index, stop.frameCount - 1);
  const indices = Array.from({ length: first - end + 1 }, (_, i) => first - i);
  const frame = pocketFrameRange(stop, indices, "start");
  return { ...frame, pocketExitFrame: indices.length - 1, resumePocketExit: true };
}

export function walkCommandHasDistance(distance) {
  return Number.isFinite(distance) && distance > WALK_TARGET_EPSILON;
}

function pocketFrameRange(frame, indices, role, original = false) {
  const rects = original ? frame.sourceFrameRects : frame.frameRects;
  const bounds = original ? frame.sourceFrameContentBounds : frame.frameContentBounds;
  return { ...frame, role, loop: false, initialFrame: 0, frameStart: 0,
    frameCount: indices.length, frameRects: indices.map(i => rects[i]),
    frameContentBounds: indices.map(i => bounds[i]), movementSpeedMultipliers: indices.map(() => 0),
    nativePocketIndices: indices };
}
