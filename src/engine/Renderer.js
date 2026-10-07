import { requirementsMet } from "./EffectSystem.js";
import { clamp } from "./geometry.js";
import { characterHeight } from "./CharacterRenderMath.js";
import { canExitToStop, eastWestFallbackFacing, stopExitFrameForPlayer } from "./MovementSystem.js";
import { externalAnimationV1 } from "../content/art/externalAnimationRuntime.generated.js";
import { intoxicationSway } from "./IntoxicationSystem.js";
import { sceneZDepthT } from "./DepthMath.js";
import { drawSceneEffect } from "./SceneEffects.js";

const PLAYER_SHADOW_FULL_SIZE_Y_OFFSET = -4;

export function stopRenderOffsetX(frame, frameIndex, mirrored = false) {
  const startOffset = Number(frame?.stopRenderOffsetXStart);
  if (!Number.isFinite(startOffset) || !frame || frame.role !== "stop") return 0;
  const startFrame = Math.max(0, Math.min(Number(frame.initialFrame) || 0, Math.max(0, frame.frameCount - 1)));
  const endFrame = Math.max(startFrame + 1, startFrame + (frame.frameCount - 1 - startFrame) * 0.4);
  const progress = Math.max(0, Math.min(1, (frameIndex - startFrame) / Math.max(1, endFrame - startFrame)));
  if (progress >= 1) return 0;
  const direction = mirrored ? -1 : 1;
  const offset = direction * startOffset * (1 - progress);
  return offset === 0 ? 0 : offset;
}

export function stopRenderOffsetY(frame, frameIndex) {
  const startOffset = Number(frame?.stopRenderOffsetYStart);
  if (!Number.isFinite(startOffset) || !frame || frame.role !== "stop") return 0;
  const startFrame = Math.max(0, Math.min(Number(frame.initialFrame) || 0, Math.max(0, frame.frameCount - 1)));
  const endFrame = Math.max(startFrame + 1, startFrame + (frame.frameCount - 1 - startFrame) * 0.4);
  const progress = Math.max(0, Math.min(1, (frameIndex - startFrame) / Math.max(1, endFrame - startFrame)));
  if (progress >= 1) return 0;
  const offset = startOffset * (1 - progress);
  return offset === 0 ? 0 : offset;
}

export function animationRenderScale(frame) {
  const scale = Number(frame?.scale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function animationRenderFrameIndex(frame, frameIndex) {
  const count = Math.max(1, Number(frame?.frameCount) || 1);
  const index = Math.max(0, Math.min(Number(frameIndex) || 0, count - 1));
  return frame?.reverseFrames ? count - 1 - index : index;
}

export function animationRenderOffset(frame, frameIndex, mirrored = false) {
  const globalX = Number.isFinite(Number(frame?.offsetX)) ? Number(frame.offsetX) : 0;
  const globalY = Number.isFinite(Number(frame?.offsetY)) ? Number(frame.offsetY) : 0;
  const perFrame = Array.isArray(frame?.offsets) ? frame.offsets[frameIndex] : null;
  const frameX = Number.isFinite(Number(perFrame?.x)) ? Number(perFrame.x) : 0;
  const frameY = Number.isFinite(Number(perFrame?.y)) ? Number(perFrame.y) : 0;
  const direction = mirrored ? -1 : 1;
  return {
    x: direction * (globalX + frameX),
    y: globalY + frameY
  };
}

export function animationRenderMirrored(frame, mirrored = false) {
  if (typeof frame?.flipX === "boolean") return frame.flipX;
  return Boolean(mirrored);
}

export function sceneLayerAnimationFrame(animation, timeMs = 0) {
  const frameCount = Math.max(1, Math.floor(Number(animation?.frameCount) || 1));
  const durationMs = Number(animation?.frameDurationMs) > 0
    ? Number(animation.frameDurationMs)
    : 1000 / Math.max(0.001, Number(animation?.fps) || 1);
  const elapsedFrame = Math.max(0, Math.floor((Number(timeMs) || 0) / durationMs));
  if (animation?.loop === false) return Math.min(elapsedFrame, frameCount - 1);
  const start = Math.max(0, Math.min(Number(animation?.loopStartFrame) || 0, frameCount - 1));
  const end = Math.max(start, Math.min(animation?.loopEndFrame ?? frameCount - 1, frameCount - 1));
  return elapsedFrame <= end ? elapsedFrame : start + (elapsedFrame - end - 1) % (end - start + 1);
}

// Optional intro -> sustained speech -> return playback. State belongs to the
// renderer, freezes in menus, and is discarded on scene changes, never saved.
export function npcTalkPlaybackFrame(animation, speechTime, timeMs, previous = {}, paused = false, conversation = null) {
  const state = { ...previous, lastTime: timeMs };
  if (conversation) {
    const continuing = previous.phase === "conversation" && previous.conversation === conversation;
    state.phase = "conversation";
    state.conversation = conversation;
    state.elapsed = continuing ? previous.elapsed + (paused ? 0 : Math.max(0, timeMs - previous.lastTime)) : 0;
    const duration = animation.frameDurationMs || 1000 / animation.fps;
    const turned = state.elapsed >= animation.loopStartFrame * duration;
    // Keep a quiet left-facing pose while the player reads or chooses a reply.
    return { state, frameIndex: turned && speechTime == null ? animation.loopStartFrame
      : sceneLayerAnimationFrame(animation, state.elapsed) };
  }
  if (speechTime != null) {
    state.phase = "speech";
    state.elapsed = 0;
    return { state, frameIndex: sceneLayerAnimationFrame(animation, speechTime) };
  }
  if (previous.phase === "speech" || previous.phase === "conversation") {
    state.phase = "return";
    state.elapsed = 0;
  } else if (previous.phase === "return" && !paused) {
    state.elapsed += Math.max(0, timeMs - (previous.lastTime ?? timeMs));
  }
  if (state.phase !== "return") return { state, frameIndex: null };
  const duration = animation.frameDurationMs || 1000 / animation.fps;
  const index = animation.returnStartFrame + Math.floor(state.elapsed / duration);
  if (index >= animation.frameCount) {
    state.phase = "idle";
    return { state, frameIndex: null };
  }
  return { state, frameIndex: index };
}

// Runtime-only presentation keyed by a dialogue entry object, never save flags.
// Missing assets consume the entry too, so late loading cannot replay a reaction.
export function npcReactionPlaybackFrame(animation, entry, timeMs, previous = {}, paused = false, ready = true, available = true) {
  const continuing = previous.entry === entry;
  const state = continuing ? { ...previous, lastTime: timeMs }
    : { entry, lastTime: timeMs, elapsed: 0, phase: animation && entry ? "pending" : "idle" };
  if (!animation || !entry) return { state, frameIndex: null };
  if (!available) state.phase = "done";
  if (state.phase === "pending" && ready && !paused) state.phase = "playing";
  else if (state.phase === "playing" && !paused) {
    state.elapsed += Math.max(0, timeMs - (previous.lastTime ?? timeMs));
  }
  if (state.phase !== "playing") return { state, frameIndex: null };
  const duration = animation.frameDurationMs || 1000 / animation.fps;
  const index = Math.floor(state.elapsed / duration);
  if (index >= animation.frameCount) {
    state.phase = "done";
    return { state, frameIndex: null };
  }
  return { state, frameIndex: index };
}

export function sceneLayerAnimationSourceRect(animation, frameIndex) {
  const frameWidth = Math.max(1, Math.floor(Number(animation?.frameWidth) || 1));
  const frameHeight = Math.max(1, Math.floor(Number(animation?.frameHeight) || 1));
  const columns = Math.max(1, Math.floor(Number(animation?.columns) || 1));
  const bounds = animation?.contentBounds || { x: 0, y: 0, w: frameWidth, h: frameHeight };
  const index = Math.max(0, Math.floor(Number(frameIndex) || 0));
  return {
    x: (index % columns) * frameWidth + Number(bounds.x || 0),
    y: Math.floor(index / columns) * frameHeight + Number(bounds.y || 0),
    w: Number(bounds.w || frameWidth),
    h: Number(bounds.h || frameHeight)
  };
}

export function sceneReactionBlendSamples(animation, elapsed) {
  const duration = animation.frameDurationMs || 1000 / animation.fps;
  const position = clamp(elapsed / duration, 0, animation.frameCount - 1);
  const index = Math.floor(position);
  const fraction = animation.interpolateFrames ? position - index : 0;
  const total = duration * animation.frameCount;
  const fade = Math.min(Math.max(0, animation.transitionDurationMs || 0), total / 2);
  const edge = fade ? clamp(Math.min(elapsed, total - elapsed) / fade, 0, 1) : 1;
  const weight = edge * edge * (3 - 2 * edge);
  return {
    baseWeight: 1 - weight,
    frames: [
      { frameIndex: index, weight: weight * (1 - fraction) },
      { frameIndex: Math.min(index + 1, animation.frameCount - 1), weight: weight * fraction }
    ].filter(sample => sample.weight > 0)
  };
}

function usesExternalWalkPose(player, definition) {
  return player?.id === "npc.bai_mitko" && definition?.animationSource === "external_animation_v1";
}

export function stableExternalVisualBounds(definition) {
  const bounds = [];
  for (const parts of Object.values(definition?.animations?.walk?.parts || {})) {
    for (const frame of Object.values(parts || {})) {
      if (frame?.role === "loop") continue;
      const isFullFrame = (bound) => bound && frame?.frameWidth && frame?.frameHeight
        && bound.w >= frame.frameWidth * 0.98 && bound.h >= frame.frameHeight * 0.98;
      if (frame?.contentBounds && !isFullFrame(frame.contentBounds)) bounds.push(frame.contentBounds);
      if (Array.isArray(frame?.sourceFrameContentBounds)) bounds.push(...frame.sourceFrameContentBounds.filter((bound) => !isFullFrame(bound)));
    }
  }
  if (!bounds.length) return null;
  return {
    w: Math.max(...bounds.map((bound) => bound.w || 0)),
    h: Math.max(...bounds.map((bound) => bound.h || 0)),
    baselineY: Math.max(...bounds.map((bound) => (bound.y || 0) + (bound.h || 0))) - 40
  };
}

export function externalFrameVisualBounds(frame, frameIndex, stableBounds = null) {
  if (frame?.stableVisualBounds && stableBounds) return stableBounds;
  const bounds = frame?.sourceFrameContentBounds?.[frameIndex] || frame?.contentBounds || stableBounds;
  if (!bounds || !Number.isFinite(bounds.h) || bounds.h <= 0) return stableBounds;
  return bounds;
}

export function sceneZIndexForPoint(scene, point) {
  return 100 - sceneZDepthT(scene, point) * 100;
}

export function targetZIndex(scene, target) {
  if (Number.isFinite(target?.depthY)) {
    return sceneZIndexForPoint(scene, { y: target.depthY });
  }
  const points = target?.polygon?.length
    ? target.polygon
    : target?.rect
      ? [
          { x: target.rect.x, y: target.rect.y },
          { x: target.rect.x + target.rect.w, y: target.rect.y + target.rect.h }
        ]
      : [];
  if (!points.length) return 100;
  return sceneZIndexForPoint(scene, { y: Math.max(...points.map((point) => point.y)) });
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.lastArtLogByScene = new Map();
    this.stripValidationLog = new Map();
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((clientY - rect.top) / rect.height) * this.canvas.height
    };
  }

  draw() {
    const { ctx } = this;
    if (this.game.simpleAnimTest) {
      this.drawSimpleAnimTest();
      return;
    }
    if (this.game.animLab) {
      this.drawAnimLab();
      return;
    }
    const scene = this.game.currentScene;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const hasRealBackground = this.drawBackground(scene);
    const actors = scene.playerMode !== "closeup" && (!this.game.editMode || this.game.sceneEditor?.shouldRenderPlayer())
      ? [this.game.player]
      : [];
    this.drawSceneZLayers(scene, actors);
    if (!hasRealBackground && scene.playerMode === "seated") this.drawSeatedTableFallback(scene);
    if (this.game.editMode) this.game.sceneEditor?.draw(ctx);
    else {
      if (this.game.debugSceneGeometry || !hasRealBackground) this.drawSceneGeometry(scene);
    }
  }

  drawHoveredTarget(target = this.game.hoveredTarget) {
    if (!target) return;
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = "rgba(225, 194, 100, 0.26)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(225, 194, 100, 0.68)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    if (target.polygon?.length) {
      target.polygon.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
    } else if (target.rect) {
      ctx.rect(target.rect.x, target.rect.y, target.rect.w, target.rect.h);
    } else {
      ctx.restore();
      return;
    }
    ctx.stroke();
    ctx.restore();
  }

  drawSeatedTableFallback(scene) {
    const rect = scene.seatedPresentation?.tableRect;
    if (!rect) return;
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = "#5a3521";
    ctx.strokeStyle = "#c69a56";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(246, 214, 157, 0.12)";
    ctx.fillRect(rect.x + 18, rect.y + 18, rect.w - 36, 8);
    ctx.restore();
  }

  drawSimpleAnimTest() {
    const { ctx } = this;
    const state = this.game.simpleAnim;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const backgrounds = {
      checker: "#d7d2c8",
      light: "#f2eee5",
      gray: "#8d8a82",
      dark: "#2d2b27",
      green: "#86a37e"
    };
    ctx.fillStyle = backgrounds[state.background] || backgrounds.checker;
    ctx.fillRect(0, 0, 1280, 720);
    if (state.background === "checker") {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let y = 0; y < 720; y += 32) {
        for (let x = 0; x < 1280; x += 32) {
          if ((x / 32 + y / 32) % 2 === 0) ctx.fillRect(x, y, 32, 32);
        }
      }
    }
    ctx.strokeStyle = "#736a5e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(80, state.baselineY);
    ctx.lineTo(1200, state.baselineY);
    ctx.stroke();

    const frame = this.game.simpleCurrentFrame();
    const mirrored = state.direction === "west";
    const slot = frame?.slot || "external_walk_east_start";
    const image = this.game.assets.getCharacterImage("npc.bai_mitko", slot);
    const warnings = [];
    if (!image) warnings.push(`missing asset slot: ${slot}`);
    let drawInfo = { drawX: 0, drawY: 0, sourceRect: null, baselineY: "n/a", anchor: "n/a" };

    if (image) {
      if (frame) {
        const frameIndex = state.frameIndex % Math.max(1, frame.frameCount);
        const bounds = this.frameContentBounds(frame, frameIndex);
        const scale = (500 / frame.frameHeight) * animationRenderScale(frame);
        const width = frame.frameWidth * scale;
        const height = frame.frameHeight * scale;
        const frameMirrored = animationRenderMirrored(frame, mirrored);
        const renderOffset = animationRenderOffset(frame, frameIndex, frameMirrored);
        const renderOffsetX = stopRenderOffsetX(frame, frameIndex, frameMirrored) + renderOffset.x;
        const renderOffsetY = stopRenderOffsetY(frame, frameIndex) + renderOffset.y;
        const drawX = state.x + renderOffsetX - width * (frame.anchorX ?? frame.anchor?.x ?? 0.5);
        const drawY = state.baselineY + renderOffsetY - (frame.baselineY || frame.frameHeight) * scale;
        const shadowWidth = (frame.contentBounds?.w || bounds.w) * scale;
        this.drawSimpleShadow(state.x, state.baselineY, shadowWidth);
        this.drawFrameImage(image, frameIndex, frame, bounds, drawX, drawY, width, height, frameMirrored);
        const sourceRect = this.frameSourceRect(frame, frameIndex, bounds);
        drawInfo = {
          drawX,
          drawY,
          sourceRect,
          baselineY: frame.baselineY,
          anchor: `${frame.anchorX ?? frame.anchor?.x ?? 0.5},${frame.anchorY ?? frame.anchor?.y ?? 1}`,
          width,
          height,
          renderOffsetX,
          renderOffsetY
        };
        if (state.showOverlays) this.drawSimpleOverlays(drawX, drawY, width, height, state.baselineY, sourceRect);
      } else {
        const height = 500;
        const width = height * (image.naturalWidth / image.naturalHeight);
        const drawX = state.x - width * 0.5;
        const drawY = state.baselineY - height;
        this.drawSimpleShadow(state.x, state.baselineY, width * 0.55);
        if (mirrored) {
          ctx.save();
          ctx.translate(drawX + width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(image, 0, drawY, width, height);
          ctx.restore();
        } else {
          ctx.drawImage(image, drawX, drawY, width, height);
        }
        drawInfo = { drawX, drawY, sourceRect: null, baselineY: "idle", anchor: "0.5,1", width, height };
        if (state.showOverlays) this.drawSimpleOverlays(drawX, drawY, width, height, state.baselineY, null);
      }
    }

    state.debug = { drawInfo, warnings };
    this.drawSimpleDebug(frame, slot, mirrored, drawInfo, warnings);
  }

  static resolveIdleWalkFrameForDefinition(player, definition, facing) {
    return Renderer.resolveExternalWalkStartFrameForDefinition(player, definition, facing);
  }

  static resolveExternalWalkStartFrameForDefinition(player, definition, facing) {
    const walk = definition.animations.walk;
    const partsByFacing = player.walkPartsByFacing || walk.parts || {};
    if (walk.type === "phasedStrip" && Object.keys(partsByFacing).length) {
      const direction = eastWestFallbackFacing(facing) || "east";
      const frame = partsByFacing?.[direction]?.start || partsByFacing?.east?.start;
      if (!frame?.slot) return null;
      return { facing, frameIndex: 0, frame: Renderer.holdFrameFromWalkStart(frame), slot: frame.slot, mirrored: Boolean(frame.mirrored) };
    }
    return null;
  }

  static holdFrameFromWalkStart(frame) {
    if (!frame?.sourceFrameRects?.[0]) return frame;
    return {
      ...frame,
      role: "hold",
      loop: false,
      frameCount: 1,
      initialFrame: 0,
      frameStart: 0,
      frameEndTrim: 0,
      frameRects: [frame.sourceFrameRects[0]],
      frameContentBounds: frame.sourceFrameContentBounds?.[0] ? [frame.sourceFrameContentBounds[0]] : undefined,
      contentBounds: frame.sourceFrameContentBounds?.[0] || frame.contentBounds,
      movementSpeedMultipliers: [0],
      stopRenderOffsetXStart: 0
    };
  }

  drawSimpleShadow(x, y, width) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, Math.max(40, width * 0.3), 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSimpleOverlays(drawX, drawY, width, height, baselineY, sourceRect) {
    const { ctx } = this;
    ctx.strokeStyle = "rgba(210, 50, 50, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(drawX, drawY, width, height);
    ctx.strokeStyle = "rgba(40, 105, 220, 0.9)";
    ctx.beginPath();
    ctx.moveTo(drawX - 30, baselineY);
    ctx.lineTo(drawX + width + 30, baselineY);
    ctx.stroke();
    if (sourceRect) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(drawX, drawY - 18, 150, 16);
      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.fillText(`src ${sourceRect.x},${sourceRect.y}`, drawX + 4, drawY - 6);
    }
  }

  drawSimpleDebug(frame, slot, mirrored, drawInfo, warnings) {
    const { ctx } = this;
    const state = this.game.simpleAnim;
    const sourceRect = drawInfo.sourceRect ? `${drawInfo.sourceRect.x},${drawInfo.sourceRect.y},${drawInfo.sourceRect.w},${drawInfo.sourceRect.h}` : "static";
    const lines = [
      `mode: ${state.mode}`,
      `direction: ${state.direction}`,
      `x: ${state.x.toFixed(1)}`,
      `moving: ${state.moving}`,
      `animation key: ${this.game.simpleCurrentKey()}`,
      `frame: ${state.frameIndex}/${frame?.frameCount || 1}`,
      `fps: ${this.game.simpleAnimFps(frame)}`,
      `elapsed: ${state.elapsed.toFixed(2)}`,
      `move multiplier: ${(state.lastMoveMultiplier || 0).toFixed(3)}`,
      `dx/frame: ${(state.lastMoveDx || 0).toFixed(3)}`,
      `pendingStop: ${Boolean(state.pendingStop)}`,
      `stopExitFrame: ${this.game.normalizedSimpleStopExitFrame()}`,
      `canExitToStop: ${Boolean(state.canExitToStop)}`,
      `loop: ${frame ? Boolean(frame.loop) : false}`,
      `mirrored: ${mirrored}`,
      `render offset: ${(drawInfo.renderOffsetX || 0).toFixed(1)},${(drawInfo.renderOffsetY || 0).toFixed(1)}`,
      `draw: ${drawInfo.drawX.toFixed(1)},${drawInfo.drawY.toFixed(1)}`,
      `baselineY: ${drawInfo.baselineY}`,
      `anchor: ${drawInfo.anchor}`,
      `source rect: ${sourceRect}`,
      `slot: ${slot}`
    ];
    if (state.pendingStop) lines.push(`Stop requested, waiting for loop exit frame ${this.game.normalizedSimpleStopExitFrame()}.`);
    ctx.save();
    ctx.translate(520, 8);
    ctx.scale(0.5, 0.5);
    ctx.fillStyle = "rgba(20, 18, 14, 0.78)";
    ctx.fillRect(0, 0, 430, 406 + warnings.length * 18);
    ctx.fillStyle = "#f5ead5";
    ctx.font = "14px Consolas, monospace";
    lines.forEach((line, index) => ctx.fillText(line, 12, 24 + index * 18));
    if (warnings.length) {
      ctx.fillStyle = "#ff6c5d";
      warnings.forEach((warning, index) => ctx.fillText(`warning: ${warning}`, 12, 416 + index * 18));
    }
    ctx.restore();
  }

  drawBackground(scene) {
    const { ctx } = this;
    const path = this.game.assets.getSceneAssetPath(scene.id, "background");
    const background = this.game.assets.getSceneImage(scene.id, "background");
    if (this.game.assets.isLoaded(background)) {
      this.logArtStatus(scene.id, path, "loaded", false);
      ctx.drawImage(background, 0, 0);
      return true;
    }

    const status = this.game.assets.getImageStatus(background);
    this.logArtStatus(scene.id, path, status, true);

    const gradient = ctx.createLinearGradient(0, 0, 0, 720);
    gradient.addColorStop(0, scene.palette.sky);
    gradient.addColorStop(0.55, scene.palette.wall);
    gradient.addColorStop(1, scene.palette.floor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1280, 720);

    ctx.fillStyle = "rgba(20, 18, 14, 0.5)";
    ctx.fillRect(0, 520, 1280, 200);
    ctx.fillStyle = "#efe0bd";
    ctx.font = "700 32px Arial";
    ctx.fillText(this.game.t(scene.titleKey), 36, 54);
    ctx.font = "18px Arial";
    ctx.fillText("Painted background placeholder: replace with 1280x720 runtime art", 36, 84);
    return false;
  }

  drawSceneZLayers(scene, actors) {
    const entries = [
      ...actors.map((actor) => ({ kind: "actor", actor, zIndex: sceneZIndexForPoint(scene, actor.position) })),
      ...scene.interactables
        .filter((target) => target.droppedItemsPileAsset)
        .map((target) => ({ kind: "droppedItemsPile", target, zIndex: targetZIndex(scene, target) })),
      ...[...scene.npcs, ...scene.interactables, ...scene.exits]
        .filter((target) => target.debugVisual && this.game.targetAvailable?.(target))
        .map((target) => ({ kind: "debugTarget", target, zIndex: targetZIndex(scene, target) })),
      ...(!this.game.editMode && this.game.hoveredTarget
        ? [{ kind: "hover", target: this.game.hoveredTarget, zIndex: targetZIndex(scene, this.game.hoveredTarget) }]
        : []),
      ...(scene.foregroundLayers || [])
        .filter((layer) => this.sceneLayerVisible(layer))
        .map((layer) => ({ kind: "layer", layer, zIndex: Number(layer.zIndex) })),
      ...(scene.effects || [])
        .filter((effect) => this.sceneLayerVisible(effect))
        .map((effect) => ({ kind: "effect", effect, zIndex: Number(effect.zIndex) }))
    ].sort((a, b) => {
      const az = Number.isFinite(a.zIndex) ? a.zIndex : 100;
      const bz = Number.isFinite(b.zIndex) ? b.zIndex : 100;
      return bz - az;
    });
    for (const entry of entries) {
      if (entry.kind === "actor") this.drawPlayer(entry.actor);
      else if (entry.kind === "hover") this.drawHoveredTarget(entry.target);
      else if (entry.kind === "droppedItemsPile") this.drawDroppedItemsPile(scene, entry.target);
      else if (entry.kind === "debugTarget") this.drawDebugTarget(entry.target);
      else if (entry.kind === "effect") drawSceneEffect(this.ctx, entry.effect, (this.game.lastTime || 0) / 1000);
      else this.drawSceneRasterLayer(scene, entry.layer);
    }
  }

  drawDebugTarget(target) {
    const bounds = this.targetBounds(target);
    if (!bounds) return;
    const { ctx } = this;
    const visual = target.debugVisual;
    const centerX = bounds.x + bounds.w / 2;
    ctx.save();
    if (visual.kind === "sign") {
      ctx.fillStyle = visual.fill || "#efe0bd";
      ctx.strokeStyle = visual.accent || "#9b302f";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = visual.accent || "#9b302f";
      ctx.font = "700 14px Arial";
      ctx.textAlign = "center";
      const label = this.game.t(visual.labelKey || target.nameKey);
      const words = label.split(/\s+/);
      const midpoint = Math.ceil(words.length / 2);
      ctx.fillText(words.slice(0, midpoint).join(" "), centerX, bounds.y + bounds.h / 2 - 3);
      ctx.fillText(words.slice(midpoint).join(" "), centerX, bounds.y + bounds.h / 2 + 16);
      ctx.restore();
      return;
    }
    ctx.fillStyle = visual.fill || "#714052";
    ctx.beginPath();
    ctx.ellipse(centerX, bounds.y + 37, 25, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(bounds.x + 18, bounds.y + 65, bounds.w - 36, bounds.h - 65, 18);
    ctx.fill();
    ctx.strokeStyle = visual.accent || "#d7b35f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(centerX + 20, bounds.y + 86);
    ctx.lineTo(centerX + 45, bounds.y + 47);
    ctx.stroke();
    ctx.fillStyle = visual.accent || "#d7b35f";
    ctx.beginPath();
    ctx.arc(centerX + 48, bounds.y + 42, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(22, 17, 16, 0.82)";
    ctx.fillRect(bounds.x - 12, bounds.y - 25, bounds.w + 24, 23);
    ctx.fillStyle = "#fff3cf";
    ctx.font = "700 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(this.game.t(visual.labelKey || target.nameKey), centerX, bounds.y - 9);
    ctx.restore();
  }

  drawDroppedItemsPile(scene, target) {
    const image = this.game.assets.getSceneImage(scene.id, target.droppedItemsPileAsset);
    if (!this.game.assets.isLoaded(image) || !target.rect) return;
    this.ctx.drawImage(image, target.rect.x, target.rect.y, target.rect.w, target.rect.h);
  }

  sceneLayerVisible(layer) {
    if (layer.requirements && !requirementsMet(layer.requirements, this.game.effectContext())) return false;
    if (this.game.editMode) {
      const preview = this.game.sceneEditor?.layerPreviewVisible?.(layer);
      if (typeof preview === "boolean") return preview;
    }
    if (layer?.visibleWhenTargetId) {
      const scene = this.game.currentScene;
      const target = [...(scene?.npcs || []), ...(scene?.interactables || []), ...(scene?.exits || [])]
        .find(target => target.id === layer.visibleWhenTargetId);
      if (!target || !this.game.targetAvailable(target)) return false;
    }
    if (layer?.hiddenWhenFlag && this.game.state?.flags?.[layer.hiddenWhenFlag]) return false;
    if (layer?.visibleWhenFlag && !this.game.state?.flags?.[layer.visibleWhenFlag]) return false;
    if (layer?.hiddenWhenItemOwned && this.game.inventory?.has(layer.hiddenWhenItemOwned)) return false;
    if (layer?.hiddenWhenState && this.game.state?.[layer.hiddenWhenState]) return false;
    if (layer?.visibleDuringAction) {
      const condition = layer.visibleDuringAction;
      const action = this.game.player?.actionAnimation;
      const frameIndex = Number(this.game.player?.animator?.frameIndex) || 0;
      if (this.game.player?.animation !== "action") return false;
      if (action?.actionName !== condition.actionName) return false;
      if (frameIndex < Number(condition.fromFrame || 0)) return false;
    }
    return true;
  }

  sceneLayerIdleAnimation(scene, layer) {
    const animation = layer.animation;
    if (animation?.quietOnly !== true) return animation;
    const npcId = animation.npcId;
    const game = this.game;
    if (!npcId || !scene.npcs?.some(npc => npc.id === npcId)
      || game.paused || game.menuOpen || game.devHome || game.editMode
      || game.content?.dialogues?.[game.dialogue?.current?.id]?.npcId === npcId
      || game.npcSpeechBubble?.npcId === npcId
      || game.npcSpeechAnimationTime?.(npcId) != null) return null;
    return animation;
  }

  drawSceneRasterLayer(scene, layer) {
    const idleAnimation = this.sceneLayerIdleAnimation(scene, layer);
    const fallbackImage = this.game.assets.getSceneImage(scene.id, layer.asset);
    const speechTime = layer.talkAnimation
      ? this.game.npcSpeechAnimationTime?.(layer.talkAnimation.npcId)
      : null;
    const talkImage = layer.talkAnimation
      ? this.game.assets.getSceneImage(scene.id, layer.talkAnimation.asset)
      : null;
    let talkFrame = null;
    if (this.npcTalkSceneId !== scene.id) {
      this.npcTalkSceneId = scene.id;
      this.npcTalkPlayback = new Map();
      this.npcReactionPlayback = new Map();
    }
    if (layer.talkAnimation?.returnStartFrame != null) {
      const result = npcTalkPlaybackFrame(layer.talkAnimation, speechTime, this.game.lastTime || 0,
        this.npcTalkPlayback.get(layer.id), Boolean(this.game.paused || this.game.menuOpen || this.game.devHome || this.game.editMode),
        this.game.content?.dialogues?.[this.game.dialogue?.current?.id]?.npcId === layer.talkAnimation.npcId
          ? this.game.dialogue.current : null);
      this.npcTalkPlayback.set(layer.id, result.state);
      talkFrame = result.frameIndex;
    }
    const entry = this.game.dialogue?.entry;
    const candidate = layer.reactionAnimations?.[entry?.reactionId];
    const reaction = candidate && entry.session === this.game.dialogue.current
      && entry.nodeId === this.game.dialogue.current.nodeId
      && this.game.content?.dialogues?.[entry.session.id]?.npcId === candidate.npcId ? candidate : null;
    const reactionImage = reaction ? this.game.assets.getSceneImage(scene.id, reaction.asset) : null;
    const talkState = this.npcTalkPlayback.get(layer.id);
    const turnDuration = layer.talkAnimation?.loopStartFrame * (layer.talkAnimation?.frameDurationMs || 1000 / layer.talkAnimation?.fps);
    const ready = !Number.isFinite(turnDuration) || (talkState?.phase === "conversation" && talkState.elapsed >= turnDuration);
    this.npcReactionSeenEntries ||= new WeakSet();
    const previousReaction = this.npcReactionPlayback.get(layer.id);
    const alreadyConsumed = entry && previousReaction?.entry !== entry && this.npcReactionSeenEntries.has(entry);
    const reactionResult = npcReactionPlaybackFrame(reaction, entry, this.game.lastTime || 0,
      previousReaction, Boolean(this.game.paused || this.game.menuOpen || this.game.devHome || this.game.editMode),
      ready, !alreadyConsumed && this.game.assets.isLoaded(reactionImage));
    if (reaction && entry) this.npcReactionSeenEntries.add(entry);
    this.npcReactionPlayback.set(layer.id, reactionResult.state);
    const reacting = reactionResult.frameIndex != null;
    const talking = (speechTime != null || talkFrame != null) && this.game.assets.isLoaded(talkImage);
    const stationaryImage = layer.stationaryLowerBody && layer.animation
      ? this.game.assets.getSceneImage(scene.id, layer.animation.asset) : null;
    const stationarySample = this.game.assets.isLoaded(stationaryImage)
      ? { animation: layer.animation, image: stationaryImage, frameIndex: layer.stationaryLowerBody.frameIndex } : null;
    if (reacting && (reaction.interpolateFrames || reaction.transitionDurationMs > 0)) {
      const blend = sceneReactionBlendSamples(reaction, reactionResult.state.elapsed);
      const baseAnimation = talking ? layer.talkAnimation : idleAnimation;
      const baseImage = talking ? talkImage : this.game.assets.getSceneImage(scene.id, baseAnimation?.asset);
      if (baseAnimation && this.game.assets.isLoaded(baseImage)) {
        const baseFrame = talking && talkFrame != null ? talkFrame
          : sceneLayerAnimationFrame(baseAnimation, talking ? speechTime : this.game.lastTime || 0);
        const samples = blend.frames.map(sample => ({ ...sample, animation: reaction, image: reactionImage }));
        if (blend.baseWeight > 0) samples.push({ animation: baseAnimation, image: baseImage, frameIndex: baseFrame, weight: blend.baseWeight });
        if (this.drawSceneAnimationSamples(layer, samples, stationarySample)) return;
      }
    }
    const animation = reacting ? reaction : talking ? layer.talkAnimation : idleAnimation;
    const animationImage = reacting ? reactionImage : talking ? talkImage : animation?.asset
      ? this.game.assets.getSceneImage(scene.id, animation.asset)
      : null;
    if (animation && this.game.assets.isLoaded(animationImage)) {
      const frameIndex = reacting ? reactionResult.frameIndex : talking && talkFrame != null ? talkFrame
        : sceneLayerAnimationFrame(animation, talking ? speechTime : this.game.lastTime || 0);
      if (stationarySample && this.drawSceneAnimationSamples(layer,
        [{ animation, image: animationImage, frameIndex, weight: 1 }], stationarySample)) return;
      const source = sceneLayerAnimationSourceRect(animation, frameIndex);
      const rect = this.sceneAnimationDrawRect(layer, animation, source);
      this.ctx.drawImage(
        animationImage,
        source.x,
        source.y,
        source.w,
        source.h,
        rect.x,
        rect.y,
        rect.w,
        rect.h
      );
      return;
    }
    if (!this.game.assets.isLoaded(fallbackImage)) return;
    const rect = this.sceneLayerRect(layer, fallbackImage);
    this.ctx.drawImage(fallbackImage, rect.x, rect.y, rect.w, rect.h);
  }

  sceneAnimationDrawRect(layer, animation, source) {
    const rect = this.sceneLayerRect(layer, { naturalWidth: source.w, naturalHeight: source.h });
    // All samples retain the same approved registration; interpolation never
    // changes the anchor or selects per-frame bounds.
    if (animation.registrationBounds) {
      const bounds = animation.registrationBounds;
      const reference = this.sceneLayerRect(layer, { naturalWidth: bounds.w, naturalHeight: bounds.h });
      const scaleX = reference.w / bounds.w;
      const scaleY = reference.h / bounds.h;
      rect.x = reference.x + (animation.contentBounds.x - bounds.x) * scaleX;
      rect.y = reference.y + (animation.contentBounds.y - bounds.y) * scaleY;
      rect.w = source.w * scaleX;
      rect.h = source.h * scaleY;
    }
    return rect;
  }

  drawSceneAnimationSamples(layer, samples, stationarySample = null) {
    const document = this.canvas?.ownerDocument;
    if (!document || !samples.length) return false;
    const draws = samples.map(sample => {
      const source = sceneLayerAnimationSourceRect(sample.animation, sample.frameIndex);
      return { ...sample, source, rect: this.sceneAnimationDrawRect(layer, sample.animation, source) };
    });
    const stationarySource = stationarySample && sceneLayerAnimationSourceRect(stationarySample.animation, stationarySample.frameIndex);
    const stationaryRect = stationarySample && this.sceneAnimationDrawRect(layer, stationarySample.animation, stationarySource);
    const bounds = stationaryRect ? [...draws.map(d => d.rect), stationaryRect] : draws.map(d => d.rect);
    const left = Math.floor(Math.min(...bounds.map(r => r.x)));
    const top = Math.floor(Math.min(...bounds.map(r => r.y)));
    const width = Math.ceil(Math.max(...bounds.map(r => r.x + r.w))) - left;
    const height = Math.ceil(Math.max(...bounds.map(r => r.y + r.h))) - top;
    this.sceneAnimationBlendBuffers ||= new Map();
    let buffer = this.sceneAnimationBlendBuffers.get(layer.id);
    if (!buffer) {
      buffer = document.createElement("canvas");
      this.sceneAnimationBlendBuffers.set(layer.id, buffer);
    }
    if (buffer.width !== width || buffer.height !== height) { buffer.width = width; buffer.height = height; }
    const ctx = buffer.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    // Add weighted premultiplied colors on a transparent buffer. Source-over
    // would make two half-weight opaque frames only 75% opaque and show scenery
    // through Baba; lighter preserves the weighted alpha sum instead.
    ctx.globalCompositeOperation = "lighter";
    for (const { image, source, rect, weight } of draws) {
      ctx.globalAlpha = weight;
      ctx.drawImage(image, source.x, source.y, source.w, source.h, rect.x - left, rect.y - top, rect.w, rect.h);
    }
    ctx.restore();
    if (stationarySample) {
      this.sceneAnimationStationaryBuffers ||= new Map();
      let fixed = this.sceneAnimationStationaryBuffers.get(layer.id);
      if (!fixed) { fixed = document.createElement("canvas"); this.sceneAnimationStationaryBuffers.set(layer.id, fixed); }
      if (fixed.width !== width || fixed.height !== height) { fixed.width = width; fixed.height = height; }
      const fixedCtx = fixed.getContext("2d");
      fixedCtx.clearRect(0, 0, width, height);
      fixedCtx.drawImage(stationarySample.image, stationarySource.x, stationarySource.y, stationarySource.w, stationarySource.h,
        stationaryRect.x - left, stationaryRect.y - top, stationaryRect.w, stationaryRect.h);
      const origin = this.sceneLayerRect(layer, { width: 1, height: 1 });
      const end = origin.y + layer.stationaryLowerBody.fromY - top;
      const start = end - layer.stationaryLowerBody.featherHeight;
      this.sceneAnimationStationaryMasks ||= new Map();
      let mask = this.sceneAnimationStationaryMasks.get(layer.id);
      if (!mask) { mask = document.createElement("canvas"); this.sceneAnimationStationaryMasks.set(layer.id, mask); }
      if (mask.width !== width || mask.height !== height) { mask.width = width; mask.height = height; }
      const maskCtx = mask.getContext("2d"); maskCtx.clearRect(0, 0, width, height);
      const gradient = maskCtx.createLinearGradient(0, start, 0, end);
      gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, "rgba(0,0,0,1)");
      maskCtx.fillStyle = gradient; maskCtx.fillRect(0, 0, width, height);
      maskCtx.save(); maskCtx.globalCompositeOperation = "destination-out"; maskCtx.fillStyle = "black";
      for (const polygon of layer.stationaryLowerBody.animatedCutouts || []) {
        maskCtx.beginPath();
        polygon.forEach(([x, y], i) => maskCtx[i ? "lineTo" : "moveTo"](origin.x + x - left, origin.y + y - top));
        maskCtx.closePath(); maskCtx.fill();
      }
      maskCtx.restore();
      fixedCtx.save(); fixedCtx.globalCompositeOperation = "destination-in";
      fixedCtx.drawImage(mask, 0, 0); fixedCtx.restore();
      // Remove animated pixels completely below the waist, then add the same
      // approved idle-frame pixels every time. The narrow seam alone feathers.
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(fixed, 0, 0); ctx.restore();
    }
    this.ctx.drawImage(buffer, left, top);
    return true;
  }

  sceneLayerRect(layer, image) {
    const naturalWidth = image?.naturalWidth || image?.width || 1280;
    const naturalHeight = image?.naturalHeight || image?.height || 720;
    const authoredWidth = Number(layer.width);
    const authoredHeight = Number(layer.height);
    const hasWidth = Number.isFinite(authoredWidth) && authoredWidth > 0;
    const hasHeight = Number.isFinite(authoredHeight) && authoredHeight > 0;
    const width = hasWidth ? authoredWidth : hasHeight ? naturalWidth * (authoredHeight / naturalHeight) : naturalWidth;
    const height = hasHeight ? authoredHeight : hasWidth ? naturalHeight * (authoredWidth / naturalWidth) : naturalHeight;
    const hasRight = Number.isFinite(Number(layer.right));
    const hasBottom = Number.isFinite(Number(layer.bottom));
    const left = Number.isFinite(Number(layer.left)) ? Number(layer.left) : null;
    const top = Number.isFinite(Number(layer.top)) ? Number(layer.top) : null;
    return {
      x: left ?? (hasRight ? 1280 - Number(layer.right) - width : 0),
      y: top ?? (hasBottom ? 720 - Number(layer.bottom) - height : 0),
      w: width,
      h: height,
      width,
      height
    };
  }

  logArtStatus(sceneId, path, status, usingPlaceholder) {
    if (!this.game.debugSceneGeometry) return;
    const key = `${path || "missing"}:${status}:${usingPlaceholder}`;
    if (this.lastArtLogByScene.get(sceneId) === key) return;
    this.lastArtLogByScene.set(sceneId, key);

    if (status === "true" || status === "loaded") {
      console.info(`[art] ${sceneId} background: loaded ${path}`);
      return;
    }
    if (status === "error") {
      console.warn(`[art] ${sceneId} background: missing ${path} -> using placeholder`);
      return;
    }
    if (!path) {
      console.warn(`[art] ${sceneId} background: missing manifest path -> using placeholder`);
      return;
    }
    console.info(`[art] ${sceneId} background: loading ${path} -> using placeholder`);
  }

  drawSceneGeometry(scene) {
    const { ctx } = this;
    ctx.save();
    if (scene.walkMask) {
      this.drawWalkMask(scene);
    } else {
      for (const polygon of scene.walkPolygons || []) {
        ctx.beginPath();
        polygon.points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fillStyle = polygon.debugFill || "rgba(91, 214, 120, 0.12)";
        ctx.fill();
        ctx.strokeStyle = polygon.debugStroke || "rgba(91, 214, 120, 0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (!this.game.editMode) {
      for (const hotspot of [...scene.exits, ...scene.interactables, ...scene.npcs]) {
        if (!this.game.targetAvailable?.(hotspot)) continue;
        const bounds = this.targetBounds(hotspot);
        if (!bounds) continue;
        ctx.strokeStyle = hotspot.kind === "exit" ? "rgba(114, 188, 255, 0.85)" : "rgba(255, 214, 102, 0.8)";
        ctx.lineWidth = 2;
        if (hotspot.polygon?.length) {
          ctx.beginPath();
          hotspot.polygon.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        }
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(bounds.x, bounds.y - 24, Math.max(110, bounds.w), 22);
        ctx.fillStyle = "#fff3cf";
        ctx.font = "14px Arial";
        ctx.fillText(this.game.t(hotspot.nameKey), bounds.x + 6, bounds.y - 8);
      }
    }
    this.drawInteractionDebugPoints();
    this.drawSpeechBubbleDebug();
    ctx.restore();
  }

  targetBounds(target) {
    if (target.rect) return target.rect;
    if (!target.polygon?.length) return null;
    const xs = target.polygon.map((point) => point.x);
    const ys = target.polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  drawInteractionDebugPoints() {
    const debug = this.game.player?.interactionDebug;
    if (!debug) return;
    const blink = Math.floor((performance.now ? performance.now() : Date.now()) / 260) % 2 === 0;
    const alpha = blink ? 1 : 0.35;
    if (debug.kind === "move" && debug.feet) {
      this.drawDebugPoint(debug.feet, `feet ${Math.round(debug.feet.x)},${Math.round(debug.feet.y)}`, `rgba(83, 255, 126, ${alpha})`);
      return;
    }
    if (debug.click) this.drawDebugPoint(debug.click, "click", `rgba(255, 255, 255, ${alpha * 0.85})`, 5);
    if (debug.hand) this.drawDebugPoint(debug.hand, "hand reach", `rgba(255, 214, 64, ${alpha})`, 8);
    if (debug.reachOrigin && debug.distancePoint) this.drawDebugLine(debug.reachOrigin, debug.distancePoint, `rgba(255, 108, 220, ${alpha * 0.55})`);
    if (debug.reachOrigin) this.drawDebugPoint(debug.reachOrigin, "reach origin", `rgba(255, 108, 220, ${alpha})`, 7);
    if (debug.distancePoint) {
      const suffix = Number.isFinite(debug.reachDistance) ? ` ${Math.round(debug.reachDistance)}px` : "";
      this.drawDebugPoint(debug.distancePoint, `reach target${suffix}`, `rgba(255, 108, 220, ${alpha})`, 11);
    }
    if (debug.feetGoal) this.drawDebugPoint(debug.feetGoal, "feet goal", `rgba(78, 170, 255, ${alpha * 0.55})`, 6);
    if (debug.feet) this.drawDebugPoint(debug.feet, "feet approach", `rgba(83, 255, 126, ${alpha})`, 8);
  }

  drawSpeechBubbleDebug() {
    const debug = this.game.speechBubble?.debug;
    if (!debug) return;
    const { ctx } = this;
    if (debug.bubbleRect) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 242, 112, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(debug.bubbleRect.x, debug.bubbleRect.y, debug.bubbleRect.w, debug.bubbleRect.h);
      ctx.restore();
    }
    if (debug.tailEnd) {
      const label = debug.metrics ? `speech tail ${Math.round(debug.metrics.width)}x${Math.round(debug.metrics.height)}` : "speech tail";
      this.drawDebugPoint(debug.tailEnd, label, "rgba(255, 242, 112, 0.95)", 9);
    }
  }

  drawDebugPoint(point, label, color, radius = 7) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x - radius - 4, point.y);
    ctx.lineTo(point.x + radius + 4, point.y);
    ctx.moveTo(point.x, point.y - radius - 4);
    ctx.lineTo(point.x, point.y + radius + 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(point.x + 10, point.y - 18, Math.max(64, label.length * 7 + 10), 18);
    ctx.fillStyle = "#fff3cf";
    ctx.font = "12px Arial";
    ctx.fillText(label, point.x + 15, point.y - 5);
    ctx.restore();
  }

  drawDebugLine(from, to, color) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawActors(actors) {
    for (const actor of [...actors].sort((a, b) => a.position.y - b.position.y)) {
      this.drawPlayer(actor);
    }
  }

  drawPlayer(actor = this.game.player) {
    const { ctx } = this;
    const p = actor;
    const definition = this.game.player.animator.definition;
    let spriteInfo = this.resolveCharacterSprite(p, definition);
    if (!this.game.assets.isLoaded(spriteInfo.image) && usesExternalWalkPose(p, definition)) {
      const fallback = this.resolveExternalWalkStartFrame(p, definition, p.facing || definition.render.defaultFacing);
      const fallbackImage = fallback?.slot ? this.game.assets.getCharacterImage(p.id, fallback.slot) : null;
      if (this.game.assets.isLoaded(fallbackImage)) {
        spriteInfo = { image: fallbackImage, slot: fallback.slot, frame: fallback.frame, mirrored: Boolean(fallback.mirrored), staticFrameIndex: 0 };
      }
    }
    const sprite = spriteInfo.image;
    const walkBob = p.animation === "walk" ? Math.sin(p.animationTime * 16) * 5 : 0;
    if (!this.game.assets.isLoaded(sprite)) return;
    const height = characterHeight(definition, this.game.currentScene, p.position);
    const preserveFrameLayout = Boolean(spriteInfo.frame?.usesOriginalLudoLayout || spriteInfo.frame?.frameRects?.length);
    const boundsForSize = spriteInfo.frame?.contentBounds || null;
    const sourceWidth = preserveFrameLayout && spriteInfo.frame ? spriteInfo.frame.frameWidth : boundsForSize?.w || spriteInfo.frame?.frameWidth || sprite.width;
    const sourceHeight = preserveFrameLayout && spriteInfo.frame ? spriteInfo.frame.frameHeight : boundsForSize?.h || spriteInfo.frame?.frameHeight || sprite.height;
    const stableBounds = preserveFrameLayout && usesExternalWalkPose(p, definition) ? stableExternalVisualBounds(definition) : null;
    const logicalFrameIndex = spriteInfo.frame
      ? Number.isInteger(spriteInfo.staticFrameIndex) ? spriteInfo.staticFrameIndex : this.game.player.animator.frameIndex % spriteInfo.frame.frameCount
      : 0;
    const frameIndex = animationRenderFrameIndex(spriteInfo.frame, logicalFrameIndex);
    const currentVisualBounds = stableBounds ? externalFrameVisualBounds(spriteInfo.frame, frameIndex, stableBounds) : null;
    const visualHeight = currentVisualBounds?.h || (preserveFrameLayout ? sourceHeight : boundsForSize?.h || sourceHeight);
    const animationScale = animationRenderScale(spriteInfo.frame);
    const scale = (height / visualHeight) * animationScale;
    const width = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const anchor = spriteInfo.frame?.anchor || definition.render.anchor;
    const useRealWalk = p.animation === "walk" && spriteInfo.frame;
    const verticalOffset = useRealWalk ? 0 : walkBob;
    const mirrored = animationRenderMirrored(spriteInfo.frame, spriteInfo.mirrored);
    const renderOffset = animationRenderOffset(spriteInfo.frame, frameIndex, mirrored);
    const renderOffsetX = stopRenderOffsetX(spriteInfo.frame, frameIndex, mirrored) + renderOffset.x;
    const renderOffsetY = stopRenderOffsetY(spriteInfo.frame, frameIndex) + renderOffset.y;
    const sway = intoxicationSway(this.game.state?.rakiaGlasses, p.animationTime);
    const drawX = p.position.x + renderOffsetX + sway.x - width * anchor.x;
    const baselineOffset = preserveFrameLayout && spriteInfo.frame
      ? stableBounds?.baselineY || spriteInfo.frame.baselineY || sourceHeight
      : spriteInfo.frame?.baselineY && boundsForSize ? spriteInfo.frame.baselineY - boundsForSize.y : sourceHeight * anchor.y;
    const drawY = p.position.y + renderOffsetY + sway.y - baselineOffset * scale + verticalOffset;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
    ctx.beginPath();
    const shadowWidth = (stableBounds?.w || boundsForSize?.w || sourceWidth) * scale;
    const fullSizeHeight = definition.render.sceneHeights?.[this.game.currentScene.id]?.near || definition.gameHeight || height;
    const shadowOffsetY = PLAYER_SHADOW_FULL_SIZE_Y_OFFSET * (height / Math.max(1, fullSizeHeight));
    ctx.ellipse(p.position.x, p.position.y + 2 + shadowOffsetY, shadowWidth * 0.3, Math.max(6, height * 0.035), 0, 0, Math.PI * 2);
    ctx.fill();
    if (spriteInfo.frame) {
      if (p.animation === "walk") {
        p.lastWalkFrame = {
          facing: p.facing,
          frameIndex,
          frame: spriteInfo.frame,
          slot: spriteInfo.slot,
          mirrored: Boolean(spriteInfo.mirrored)
        };
      }
      const bounds = preserveFrameLayout
        ? { x: 0, y: 0, w: spriteInfo.frame.frameWidth, h: spriteInfo.frame.frameHeight }
        : this.frameContentBounds(spriteInfo.frame, frameIndex);
      this.drawFrameImage(sprite, frameIndex, spriteInfo.frame, bounds, drawX, drawY, width, drawHeight, mirrored);
    } else if (mirrored) {
      ctx.save();
      ctx.translate(drawX + width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, drawY, width, drawHeight);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, drawX, drawY, width, drawHeight);
    }
    if (this.game.debugSceneGeometry || this.game.debugAnimation) this.drawCharacterDebug(p, drawX, drawY, width, drawHeight, visualHeight, spriteInfo.slot, spriteInfo.frame, mirrored, renderOffsetX, renderOffsetY);
    ctx.restore();
  }

  drawWalkMask(scene) {
    const mask = scene.walkMask;
    if (!mask?.rows?.length) return;
    const { ctx } = this;
    const width = Math.max(1, Number(mask.width) || 1);
    const height = Math.max(1, Number(mask.height) || 1);
    const worldWidth = Math.max(1, Number(mask.worldWidth) || 1280);
    const worldHeight = Math.max(1, Number(mask.worldHeight) || 720);
    const cellWidth = worldWidth / width;
    const cellHeight = worldHeight / height;
    for (let y = 0; y < height; y += 1) {
      const row = mask.rows[y] || "";
      for (let x = 0; x < width; x += 1) {
        const value = row[x] || ".";
        const entry = mask.legend?.[value];
        if (!entry?.walkable) continue;
        ctx.fillStyle = entry.debugFill || "rgba(91, 214, 120, 0.12)";
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
      }
    }
  }

  resolveCharacterSprite(player, definition) {
    const animation = definition.animations[player.animation] || definition.animations.idle;
    const facing = player.facing || definition.render.defaultFacing;
    if (usesExternalWalkPose(player, definition) && player.animation !== "walk") {
      if (player.actionAnimation?.slot) {
        const image = this.game.assets.getCharacterImage(player.id, player.actionAnimation.slot);
        return { image, slot: player.actionAnimation.slot, frame: player.actionAnimation, mirrored: Boolean(player.actionAnimation.mirrored) };
      }
      if (player.speechAnimation?.slot) {
        const image = this.game.assets.getCharacterImage(player.id, player.speechAnimation.slot);
        return { image, slot: player.speechAnimation.slot, frame: player.speechAnimation, mirrored: Boolean(player.speechAnimation.mirrored) };
      }
      if (player.idleVariant?.slot) {
        const image = this.game.assets.getCharacterImage(player.id, player.idleVariant.slot);
        return { image, slot: player.idleVariant.slot, frame: player.idleVariant, mirrored: Boolean(player.idleVariant.mirrored) };
      }
      if (player.idleHoldFrame?.slot) {
        const image = this.game.assets.getCharacterImage(player.id, player.idleHoldFrame.slot);
        return {
          image,
          slot: player.idleHoldFrame.slot,
          frame: player.idleHoldFrame.frame,
          mirrored: Boolean(player.idleHoldFrame.mirrored),
          staticFrameIndex: player.idleHoldFrame.frameIndex
        };
      }
      const frameInfo = this.resolveExternalWalkStartFrame(player, definition, facing);
      if (frameInfo?.slot) {
        const image = this.game.assets.getCharacterImage(player.id, frameInfo.slot);
        return { image, slot: frameInfo.slot, frame: frameInfo.frame, mirrored: Boolean(frameInfo.mirrored), staticFrameIndex: frameInfo.frameIndex };
      }
      return { image: null, slot: frameInfo?.slot || "external_walk_east_start" };
    }
    if (player.animation === "idle") {
      const frameInfo = this.resolveIdleWalkFrame(player, definition, facing);
      if (frameInfo?.slot) {
        const image = this.game.assets.getCharacterImage(player.id, frameInfo.slot);
        return { image, slot: frameInfo.slot, frame: frameInfo.frame, mirrored: Boolean(frameInfo.mirrored), staticFrameIndex: frameInfo.frameIndex };
      }
    }
    if (animation?.type === "phasedStrip" && Object.keys(player.walkPartsByFacing || {}).length) {
      const frame = this.resolveWalkPartFrame(player, definition, facing);
      if (frame?.slot) {
        const strip = this.game.assets.getCharacterImage(player.id, frame.slot);
        return { image: strip, slot: frame.slot, frame, mirrored: Boolean(frame.mirrored) };
      }
    } else if (animation?.type === "strip") {
      const frame = this.resolveStripFrame(animation, facing);
      if (frame?.slot) {
        const strip = this.game.assets.getCharacterImage(player.id, frame.slot);
        return { image: strip, slot: frame.slot, frame, mirrored: Boolean(frame.mirrored) };
      }
    } else {
      const preferredSlot = animation?.directions?.[facing];
      const preferredInfo = this.resolveDirectionalImage(preferredSlot);
      const preferred = this.game.assets.getCharacterImage(player.id, preferredInfo?.slot);
      if (preferredInfo?.slot) return { image: preferred, slot: preferredInfo.slot, mirrored: preferredInfo.mirrored };
    }

    const idleSlot = this.resolveIdleSlot(definition, facing);
    const idle = this.game.assets.getCharacterImage(player.id, idleSlot?.slot);
    if (idleSlot?.slot) return { image: idle, slot: idleSlot.slot, mirrored: idleSlot.mirrored };

    const fallback = this.game.assets.getCharacterImage(player.id, "idle");
    return { image: fallback, slot: "idle" };
  }

  resolveIdleWalkFrame(player, definition, facing) {
    const externalIdle = Renderer.resolveIdleWalkFrameForDefinition(player, definition, facing);
    if (externalIdle) return externalIdle;
    const walk = definition.animations.walk;
    const frame = walk.type === "phasedStrip" && Object.keys(player.walkPartsByFacing || {}).length
      ? this.resolveWalkPartFrame({ ...player, walkPart: "start" }, definition, facing) || this.resolveWalkPartFrame({ ...player, walkPart: "start" }, definition, "east")
      : this.resolveStripFrame(walk, facing) || this.resolveStripFrame(walk, definition.render.defaultFacing) || this.resolveStripFrame(walk, "east");
    if (!frame?.slot) return null;
    const frameIndex = Math.min(0, Math.max(0, frame.frameCount - 1));
    return { facing, frameIndex, frame, slot: frame.slot, mirrored: Boolean(frame.mirrored) };
  }

  resolveExternalWalkStartFrame(player, definition, facing) {
    return Renderer.resolveExternalWalkStartFrameForDefinition(player, definition, facing);
  }

  resolveWalkPartFrame(player, definition, facing) {
    const direction = eastWestFallbackFacing(facing);
    if (!direction) return null;
    const part = player.walkPart || "loop";
    const frame = definition.animations.walk.parts?.[direction]?.[part] || definition.animations.walk.parts?.[direction]?.loop;
    if (!frame?.slot) return null;
    return { ...frame, loop: Boolean(frame.loop), resolvedFrom: `${direction}.${part}`, mirrored: Boolean(frame.mirrored) };
  }

  resolveStripFrame(animation, facing) {
    const frame = animation.directions?.[facing];
    if (!frame) return null;
    if (frame.slot) return { ...frame, fps: frame.fps || animation.fps, loop: animation.loop, resolvedFrom: facing, mirrored: Boolean(frame.mirrored) };
    if (frame.fallback) {
      const fallback = this.resolveStripFrame(animation, frame.fallback);
      return fallback ? { ...fallback, requestedFacing: facing } : null;
    }
    return null;
  }

  resolveIdleSlot(definition, facing) {
    const directions = definition.animations.idle.directions;
    if (directions[facing]) return this.resolveDirectionalImage(directions[facing]);
    const fallbackFacing = {
      south_east: "east",
      north_east: "east",
      south_west: "west",
      north_west: "west"
    }[facing] || definition.render.defaultFacing;
    return this.resolveDirectionalImage(directions[fallbackFacing] || directions[definition.render.defaultFacing]);
  }

  resolveDirectionalImage(entry) {
    if (!entry) return null;
    if (typeof entry === "string") return { slot: entry, mirrored: false };
    if (entry.slot) return { slot: entry.slot, mirrored: Boolean(entry.mirrored) };
    return null;
  }

  drawFrameImage(image, frameIndex, frame, bounds, drawX, drawY, width, height, mirrored = false) {
    const { ctx } = this;
    const sourceRect = this.frameSourceRect(frame, frameIndex, bounds);
    if (mirrored) {
      ctx.save();
      ctx.translate(drawX + width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        image,
        sourceRect.x,
        sourceRect.y,
        sourceRect.w,
        sourceRect.h,
        0,
        drawY,
        width,
        height
      );
      ctx.restore();
      return;
    }
    ctx.drawImage(
      image,
      sourceRect.x,
      sourceRect.y,
      sourceRect.w,
      sourceRect.h,
      drawX,
      drawY,
      width,
      height
    );
  }

  frameSourceRect(frame, frameIndex, bounds = null) {
    const rect = frame.frameRects?.[frameIndex];
    if (rect) {
      const b = bounds || { x: 0, y: 0, w: rect.w, h: rect.h };
      return { x: rect.x + b.x, y: rect.y + b.y, w: b.w, h: b.h };
    }
    const b = bounds || frame.contentBounds || { x: 0, y: 0, w: frame.frameWidth, h: frame.frameHeight };
    return { x: frameIndex * frame.frameWidth + b.x, y: b.y, w: b.w, h: b.h };
  }

  frameContentBounds(frame, frameIndex) {
    if (frame.frameRects?.[frameIndex]) return { x: 0, y: 0, w: frame.frameRects[frameIndex].w, h: frame.frameRects[frameIndex].h };
    return frame.contentBounds || { x: 0, y: 0, w: frame.frameWidth, h: frame.frameHeight };
  }

  drawCharacterDebug(player, drawX, drawY, width, height, sourceHeight, slot, frame, mirrored = false, renderOffsetX = 0, renderOffsetY = 0) {
    const { ctx } = this;
    ctx.strokeStyle = "rgba(255, 80, 80, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(drawX, drawY, width, height);
    ctx.fillStyle = "rgba(255, 40, 40, 0.95)";
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff3cf";
    ctx.font = "12px Arial";
    const renderedHeight = height.toFixed(1);
    const scale = (height / sourceHeight).toFixed(3);
    const frameIndex = frame ? this.game.player.animator.frameIndex : 0;
    const fallback = frame?.resolvedFrom && frame.resolvedFrom !== player.facing ? `->${frame.resolvedFrom}` : "";
    const debugRect = frame ? this.frameSourceRect(frame, frameIndex, this.frameContentBounds(frame, frameIndex)) : null;
    const sourceRect = debugRect ? `${debugRect.x},${debugRect.y},${debugRect.w},${debugRect.h}` : "static";
    const animator = this.game.player.animator;
    const frameCount = frame?.frameCount || 1;
    const fps = animator.fpsOverride || frame?.fps || "n/a";
    const elapsed = animator.elapsed?.toFixed ? animator.elapsed.toFixed(2) : "0.00";
    const reset = animator.resetThisTick ? animator.resetReason || "yes" : "no";
    const pendingStop = Boolean(player.pendingStop);
    const stopExitFrame = stopExitFrameForPlayer(player);
    const canExit = canExitToStop(player);
    ctx.fillText(`${this.game.currentScene.id} key:${animator.currentKey} prev:${animator.previousKey || "n/a"}`, drawX, drawY - 86);
    ctx.fillText(`${player.animation}:${player.walkPart || "idle"}/${player.facing}${fallback}/${slot} mirrored:${mirrored} frame:${frameIndex}/${frameCount} fps:${fps}`, drawX, drawY - 73);
    ctx.fillText(`elapsed:${elapsed} loop:${frame ? Boolean(frame.loop) : "n/a"} finished:${animator.isFinished()} reset:${reset}`, drawX, drawY - 60);
    ctx.fillText(`pendingStop:${pendingStop} stopExitFrame:${stopExitFrame} canExitToStop:${canExit} stopping:${Boolean(player.movementStopping)} mirrored:${mirrored}`, drawX, drawY - 47);
    ctx.fillText(`moving:${Boolean(player.target)} stopStarted:${Boolean(player.stopAnimationStarted)} stopFinished:${Boolean(player.stopAnimationFinished)}`, drawX, drawY - 34);
    ctx.fillText(`feet:${Math.round(player.position.x)},${Math.round(player.position.y)} h:${renderedHeight} scale:${scale} baseline:${frame?.baselineY || "n/a"} offset:${renderOffsetX.toFixed(1)},${renderOffsetY.toFixed(1)}`, drawX, drawY - 21);
    ctx.fillText(`src:${sourceRect}`, drawX, drawY - 8);
    if (player.facingDebug) {
      const d = player.facingDebug;
      ctx.fillText(`dx:${d.dx.toFixed(1)} dy:${d.dy.toFixed(1)} adj:${d.adjustedDx.toFixed(1)},${d.adjustedDy.toFixed(1)} angle:${d.angle.toFixed(1)}`, drawX, drawY - 99);
    }
  }

  validateStrip(characterId, slot, image, frame) {
    const path = this.game.assets.getCharacterAssetPath(characterId, slot);
    const expectedWidth = frame.frameWidth * frame.frameCount;
    const duplicateLoopCheckWidth = frame.frameWidth * (frame.frameCount + 1);
    const key = `${characterId}:${slot}`;
    const usesRects = Array.isArray(frame.frameRects) && frame.frameRects.length >= frame.frameCount;
    const valid = usesRects
      ? frame.frameRects.slice(0, frame.frameCount).every((rect) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= image.naturalWidth && rect.y + rect.h <= image.naturalHeight)
      : image.naturalWidth === expectedWidth && image.naturalHeight === frame.frameHeight && frame.frameCount > 1;
    const expected = usesRects ? `${image.naturalWidth}x${image.naturalHeight} rects:${frame.frameRects.length}` : `${expectedWidth}x${frame.frameHeight}`;
    const logKey = `${valid}:${image.naturalWidth}x${image.naturalHeight}:${expected}`;
    if (this.stripValidationLog.get(key) !== logKey && (this.game.debugSceneGeometry || this.game.animLab)) {
      this.stripValidationLog.set(key, logKey);
      if (valid) {
        console.info(`[anim] ${characterId} ${slot} loaded ${usesRects ? "sheet" : "strip"} src=${path} natural=${image.naturalWidth}x${image.naturalHeight} frame=${frame.frameWidth}x${frame.frameHeight} count=${frame.frameCount} fps=${frame.fps}`);
      } else if (image.naturalWidth === duplicateLoopCheckWidth && image.naturalHeight === frame.frameHeight) {
        console.warn(`[anim] ${characterId} ${slot} appears to include duplicate loop-check frame. Runtime should use ${frame.frameCount} frames or playback must skip the duplicate. src=${path}`);
      } else {
        console.warn(`[anim] ${characterId} ${slot} invalid: expected ${expected} but got ${image.naturalWidth}x${image.naturalHeight}`);
      }
    }
    return valid;
  }

  drawAnimLab() {
    const { ctx } = this;
    const definition = this.game.player.animator.definition;
    const characterId = this.game.player.id;
    ctx.fillStyle = "#2a2824";
    ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = "#efe5d2";
    ctx.font = "700 24px Arial";
    ctx.fillText("Bai Mitko Animation Lab", 28, 36);
    ctx.font = "14px Arial";
    ctx.fillText("External Animation v1 - east start/loop/stop only. West mirrors east. North/south deferred.", 28, 58);

    const entries = this.externalAnimLabEntries();

    entries.forEach((entry, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = 28 + col * 310;
      const y = 88 + row * 205;
      this.drawAnimLabEntry(characterId, entry, x, y);
    });
  }

  externalAnimLabEntries() {
    const entries = [];
    for (const direction of ["east", "west"]) {
      const parts = externalAnimationV1.walkParts?.[direction] || {};
      for (const part of ["start", "loop", "stop"]) {
        if (parts[part]) entries.push({ key: `external walk_${direction}_${part}${direction === "west" ? " mirrored" : ""}`, type: "walk", frame: parts[part] });
      }
    }
    return entries;
  }

  drawAnimLabEntry(characterId, entry, x, y) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x, y, 286, 196);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(x, y, 286, 196);
    ctx.fillStyle = "#f4ead8";
    ctx.font = "700 14px Arial";
    ctx.fillText(entry.key, x + 10, y + 20);

    if (entry.type === "walk") {
      const frame = { ...entry.frame, fps: entry.frame.fps || this.game.player.animator.definition.animations.walk.fps };
      const image = this.game.assets.getCharacterImage(characterId, frame.slot);
      const loaded = this.game.assets.isLoaded(image);
      const valid = loaded && this.validateStrip(characterId, frame.slot, image, frame);
      const frameIndex = valid ? this.animLabFrameIndex(frame) : 0;
      ctx.font = "12px Arial";
      ctx.fillText(`${loaded ? "loaded" : "missing"} ${image?.naturalWidth || 0}x${image?.naturalHeight || 0}`, x + 10, y + 40);
      ctx.fillText(`frame ${frame.frameWidth}x${frame.frameHeight} count ${frame.frameCount} fps ${frame.fps} loop ${frame.loop}`, x + 10, y + 56);
      const bounds = this.frameContentBounds(frame, frameIndex);
      const rect = this.frameSourceRect(frame, frameIndex, bounds);
      const sourceRect = `${rect.x},${rect.y},${rect.w},${rect.h}`;
      const duplicateWidth = frame.frameWidth * (frame.frameCount + 1);
      const warnings = [];
      if (loaded && !frame.frameRects && image.naturalWidth !== frame.frameWidth * frame.frameCount) warnings.push(image.naturalWidth === duplicateWidth ? "extra duplicate frame" : "size mismatch");
      if (!frame.frameRects) warnings.push("missing frameRects");
      if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.w > frame.frameWidth || bounds.y + bounds.h > frame.frameHeight) warnings.push("content clips");
      ctx.fillText(`index ${frameIndex} loop ${frame.loopStartFrame || 0} move ${frame.movementStartFrame || 0} baseline ${frame.baselineY}`, x + 10, y + 72);
      ctx.fillText(`src ${sourceRect}`, x + 10, y + 88);
      ctx.fillText(`bounds ${bounds.x},${bounds.y},${bounds.w},${bounds.h}`, x + 10, y + 104);
      if (warnings.length) {
        ctx.fillStyle = "#ffb36b";
        ctx.fillText(`warn: ${warnings.join(", ")}`, x + 10, y + 122);
        ctx.fillStyle = "#f4ead8";
      }
      if (valid) {
        const h = 76;
        const w = h * (bounds.w / bounds.h);
        const drawX = x + 143 - w / 2;
        const drawY = y + 184 - h;
        this.drawFrameImage(image, frameIndex, frame, bounds, drawX, drawY, w, h, Boolean(frame.mirrored));
        ctx.strokeStyle = "rgba(100, 170, 255, 0.9)";
        ctx.strokeRect(drawX, drawY, w, h);
        const baselineInBounds = frame.baselineY - bounds.y;
        const baselineY = drawY + (baselineInBounds / bounds.h) * h;
        ctx.strokeStyle = "rgba(255, 70, 70, 0.95)";
        ctx.beginPath();
        ctx.moveTo(x + 54, baselineY);
        ctx.lineTo(x + 232, baselineY);
        ctx.stroke();
      }
      return;
    }

    ctx.font = "12px Arial";
    ctx.fillText("no animation entry", x + 10, y + 40);
  }

  animLabFrameIndex(frame) {
    const frameCount = frame.frameCount || 1;
    const next = Math.floor(this.game.player.animationTime * (frame.fps || 8));
    const loopStartFrame = Math.max(0, Math.min(frame.loopStartFrame || 0, frameCount - 1));
    if (next < frameCount) return next;
    const loopLength = Math.max(1, frameCount - loopStartFrame);
    return loopStartFrame + ((next - loopStartFrame) % loopLength);
  }

}
