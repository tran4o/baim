import { createReviewSaveSystem } from "./ReviewState.js";
import { AudioSystem } from "./AudioSystem.js";
import { DialogueSystem } from "./DialogueSystem.js";
import { applyEffects, firstMatchingRule, requirementsMet } from "./EffectSystem.js";
import { resolveEnding } from "./EndingSystem.js";
import { InventorySystem } from "./InventorySystem.js";
import { Localization } from "./Localization.js";
import { eastWestFallbackFacing, facingFromDelta, motionMultiplierAtFrame, MovementSystem } from "./MovementSystem.js";
import { QuestSystem } from "./QuestSystem.js";
import { Renderer } from "./Renderer.js";
import { SceneIdleVariations, sceneIdleVariationsBlocked } from "./SceneIdleVariations.js";
import { SceneNpcSpeech } from "./SceneNpcSpeech.js";
import { SaveSystem } from "./SaveSystem.js";
import { SceneEditor } from "./SceneEditor.js";
import { AnimationPlayer } from "./AnimationPlayer.js";
import { AssetLoader } from "./AssetLoader.js";
import { characterHeight } from "./CharacterRenderMath.js";
import { DEFAULT_SAVE, LANGUAGES, VERBS } from "./ids.js";
import { findTargetAt, findWalkPath, isWalkable, nearestReachableWalkablePoint, nearestWalkablePoint, walkPathDistance } from "./SceneGeometry.js";
import { distance } from "./geometry.js";
import { strings } from "../content/localization/index.js";
import { chapter1 } from "../content/chapter1/index.js";
import { characterDefinitions } from "../content/art/characters.js";
import { assetManifest } from "../content/art/assetManifest.js";
import { externalAnimationV1 } from "../content/art/externalAnimationRuntime.generated.js";
import {
  applyTimedSobering,
  intoxicationBandKey,
  intoxicationColor,
  intoxicationMovementMultiplier,
  RAKIA_MAX_GLASSES
} from "./IntoxicationSystem.js";

const verbs = [VERBS.LOOK, VERBS.TALK, VERBS.USE, VERBS.TAKE];
const CHARACTER_DISTANCE_SPEED_MULTIPLIER = 1.5625;
const IDLE_VARIANT_DELAY_MIN = 1;
const IDLE_VARIANT_DELAY_MAX = 3;
const IDLE_VARIANT_COMBO_PROBABILITY = 0.35;
const IDLE_VARIANT_FOLLOWUP_IDLE5_PROBABILITY = 0.7;
const TARGET_INTERACTION_DISTANCE = 100;
const TARGET_APPROACH_FEET_CANCEL_DISTANCE = 80;
const EXACT_ACTION_APPROACH_EPSILON = 4;
const TARGET_HAND_TO_FEET_X = 90;
const TARGET_HAND_TO_FEET_Y = 155;
const TARGET_REACH_ORIGIN_HEIGHT_RATIO = 0.58;
const TARGET_REACH_ORIGIN_SIDE_RATIO = 0.14;
export const SHORT_WALK_PATH_DISTANCE = 400;
const TALK_SINGLE_WORD_MAX_CHARS = 18;
const TALK_LONG_SENTENCE_MIN_CHARS = 72;
const SPEECH_BUBBLE_MAX_WIDTH_PX = 350;
const SPEECH_BUBBLE_MAX_HEIGHT_PX = 190;
const SPEECH_BUBBLE_MAX_TEXT_HEIGHT_PX = 150;
const SPEECH_BUBBLE_WEST_OFFSET_X_FULL_SIZE = 40;
const SPEECH_BUBBLE_WEST_OFFSET_Y_FULL_SIZE = -75;
const SPEECH_BUBBLE_WEST_TAIL_END_FROM_RIGHT_PX = 72;
const SPEECH_BUBBLE_TAIL_END_FROM_BOTTOM_PX = 26;
const SPEECH_BUBBLE_FADE_SECONDS = 0.3;
const SPEECH_BUBBLE_BEAT_PAUSE_SECONDS = 0.35;
const SPEECH_BUBBLE_BEAT_TEXT_FADE_SECONDS = 0.2;
const SPEECH_BUBBLE_BEAT_RESIZE_SECONDS = SPEECH_BUBBLE_BEAT_TEXT_FADE_SECONDS * 2;
const SPEECH_BUBBLE_MIN_VISIBLE_SECONDS = 1.4;
const SPEECH_BUBBLE_MAX_VISIBLE_SECONDS = 6;
const SPEECH_BUBBLE_CHARS_PER_SECOND = 18;

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    const reviewId = new URLSearchParams(globalThis.location?.search || "").get("review");
    const preset = chapter1.reviewPresets?.[reviewId];
    this.reviewId = preset ? reviewId : null;
    this.saveSystem = preset ? createReviewSaveSystem(DEFAULT_SAVE, preset, chapter1) : new SaveSystem();
    this.state = this.saveSystem.load();
    this.audio = new AudioSystem();
    this.audio.setVolume(this.state.audioVolume);
    this.localization = new Localization(strings, this.state.language);
    this.content = buildContentIndex(chapter1);
    this.debugSceneGeometry = this.readDebugGeometrySetting();
    this.animLab = this.readBooleanParam("animLab");
    this.simpleAnimTest = this.readBooleanParam("simpleAnimTest");
    this.editMode = this.readBooleanParam("edit");
    this.debugAnimation = this.readBooleanParam("debugAnimation");
    this.characterVariant = this.readCharacterVariant();
    this.characterDefinitions = characterDefinitions;
    this.assets = new AssetLoader(assetManifest);
    this.devHome = this.shouldShowDevHome();
    this.walkSpeedMultiplier = this.readNumberParam("walkSpeed", 1);
    this.selectedVerb = VERBS.LOOK;
    this.selectedInventoryItemId = null;
    this.inventoryUseItemId = null;
    this.questListTab = "outstanding";
    this.message = this.t("ui.hint");
    this.speechBubble = null;
    this.pendingSpeechBubble = null;
    this.speechBubbleQueue = [];
    this.speechBubblePauseRemaining = 0;
    this.speechBubbleSequence = 0;
    this.npcSpeechBubble = null;
    this.npcDialogueSpeech = null;
    this.currentScene = this.resolveInitialScene();
    this.player = {
      id: "npc.bai_mitko",
      position: { ...(this.content.endings.find(ending => ending.id === this.state.endingId)?.presentation?.playerPosition || this.currentScene.playerStart) },
      target: null,
      walkPath: [],
      shortWalk: false,
      pendingInteraction: null,
      pendingFacingPoint: null,
      interactionDebug: null,
      speed: this.sceneMovementSpeed(this.currentScene),
      animation: "idle",
      facing: this.content.endings.find(ending => ending.id === this.state.endingId)?.presentation?.facing || this.characterDefinitions["npc.bai_mitko"].render.defaultFacing,
      verticalDirectionBias: this.characterDefinitions["npc.bai_mitko"].render.verticalDirectionBias,
      animationTime: 0,
      facingDebug: null,
      walkMotionMultipliersByFacing: this.usesExternalCharacterAnimation() ? this.defaultWalkMotionMultipliersByFacing() : {},
      walkMovementStartFrameByFacing: this.defaultWalkMovementStartFrameByFacing(),
      animationFpsByFacing: this.usesExternalCharacterAnimation() ? this.defaultAnimationFpsByFacing() : {},
      walkPartsByFacing: this.usesExternalCharacterAnimation() ? this.defaultWalkPartsByFacing() : {},
      walkPart: null,
      pendingStop: false,
      stopExitFrame: 0,
      canExitToStop: false,
      movementStopping: false,
      stopAnimationStarted: false,
      stopAnimationFinished: false,
      idleVariant: null,
      idleVariantQueue: [],
      idleHoldFrame: null,
      idleVariantTimer: this.randomIdleVariantDelay(),
      actionAnimation: null,
      actionSequence: null,
      speechAnimation: null,
      speaking: false,
      animator: new AnimationPlayer(this.characterDefinitions["npc.bai_mitko"])
    };
    this.simpleAnim = this.createSimpleAnimState();
    if (this.usesExternalCharacterAnimation()) console.info("[characterVariant] using external_animation_v1 east/west only");
    this.inventory = new InventorySystem(this.content.items, this.state);
    this.quests = new QuestSystem(this.content.quests, this.state);
    this.dialogue = new DialogueSystem(this.content.dialogues, this.localization, (effect) => this.applyDialogueEffect(effect));
    this.movement = new MovementSystem(this.player);
    this.renderer = new Renderer(canvas, this);
    this.sceneIdleVariations = new SceneIdleVariations();
    this.sceneNpcSpeech = new SceneNpcSpeech();
    this.sceneEditor = this.editMode ? new SceneEditor(this) : null;
    const params = new URLSearchParams(globalThis.location?.search || "");
    this.menuOpen = !this.editMode && !this.simpleAnimTest && !this.animLab && !this.devHome && params.get("play") !== "1" && !params.has("scene") && !params.has("debugGeometry");
    this.paused = false;
    this.sceneTransitionPending = false;
    this.hoveredTarget = null;
    this.dialogueChoicePointerLock = null;
    this.lastTime = 0;
    this.inputBound = false;
    this.renderUi();
  }

  t(key, replacements) {
    return this.localization.t(key, replacements);
  }

  async start() {
    await this.assets.loadRuntimeManifest?.();
    this.protectCurrentAssetWorkingSet();
    await Promise.all([
      this.assets.preloadCharacterSlots(this.player.id, this.bootstrapCharacterSlots()),
      this.assets.preloadSceneAssets(this.currentScene.id),
      this.assets.preloadOwnedItemAssets(this.state.inventory || [])
    ]);
    if (!this.inputBound) {
      this.bindInput();
      this.inputBound = true;
    }
    requestAnimationFrame((time) => this.tick(time));
    this.scheduleAdjacentScenePrefetch(this.currentScene);
  }

  bootstrapCharacterSlots() {
    const parts = externalAnimationV1.walkParts?.east || {};
    return [...new Set([parts.start?.slot, parts.loop?.slot, parts.short?.slot, parts.stop?.slot].filter(Boolean))];
  }

  protectCurrentAssetWorkingSet() {
    this.assets.protectWorkingSet?.({
      sceneIds: [this.currentScene.id],
      characterId: this.player.id,
      characterSlots: this.bootstrapCharacterSlots(),
      itemIds: this.state.inventory || []
    });
  }

  scheduleAdjacentScenePrefetch(scene = this.currentScene) {
    const sceneIds = [...new Set((scene?.exits || []).map((exit) => exit.targetSceneId).filter(Boolean))];
    if (!sceneIds.length || typeof this.assets?.preloadSceneAssets !== "function") return;
    const prefetch = () => Promise.all(sceneIds.map((sceneId) => this.assets.preloadSceneAssets(sceneId))).catch(() => {});
    if (typeof globalThis.requestIdleCallback === "function") {
      globalThis.requestIdleCallback(prefetch, { timeout: 4000 });
    } else if (typeof globalThis.window !== "undefined") {
      globalThis.setTimeout(prefetch, 250);
    }
  }

  tick(time) {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0);
    this.lastTime = time;
    this.updateTimedIntoxication();
    if (this.paused || this.menuOpen || this.dialogue.current || this.devHome || this.editMode || this.state.chapter1Completed) this.audio.resetFootsteps();
    if (this.simpleAnimTest) {
      this.updateSimpleAnim(dt);
    } else if (this.animLab) {
      this.player.animationTime += dt;
    } else if (!this.paused && !this.menuOpen && !this.dialogue.current) {
      this.player.animator.beginTick();
      const finishingStopFrame = this.finishingStopFrame();
      const feetBefore = { ...this.player.position };
      const wasWalking = this.player.animation === "walk";
      this.movement.update(dt);
      const walked = Math.hypot(this.player.position.x - feetBefore.x, this.player.position.y - feetBefore.y);
      const height = characterHeight(this.characterDefinitions[this.player.id], this.currentScene, this.player.position);
      this.audio.updateFootsteps(walked, height, this.currentScene.footsteps,
        wasWalking && !this.sceneTransitionPending && !this.state.chapter1Completed);
      if (finishingStopFrame && this.player.animation === "idle") this.setIdleHoldFrame(finishingStopFrame.frame, finishingStopFrame.frameIndex);
      this.resolvePendingFacingPoint();
      this.resolvePendingInteraction();
      this.updateIdleVariants(dt);
      this.player.animationTime += dt;
      this.player.animator.fpsOverride = this.currentAnimationFps();
      this.player.animator.frameCountOverride = this.currentAnimationFrameCount();
      this.player.animator.loopStartFrameOverride = this.currentAnimationLoopStartFrame();
      this.player.animator.initialFrameOverride = this.currentAnimationInitialFrame();
      this.player.animator.loopOverride = this.currentAnimationLoop();
      this.player.animator.pingPongOverride = this.currentAnimationPingPong();
      this.player.animator.play(this.player.animation, this.currentAnimationKey());
      this.player.animator.update(dt);
      this.updateActionSequence();
      this.updateSpeechAnimationHold();
      this.updateSpeechBubble(dt);
      this.updateNpcSpeechBubble(dt);
    }
    this.updateNpcDialogueSpeech(dt);
    this.updateSceneNpcSpeech(dt);
    this.updateSceneIdleVariations(dt);
    this.renderer.draw();
    requestAnimationFrame((next) => this.tick(next));
  }

  updateSceneIdleVariations(dt) {
    this.sceneIdleVariations?.update(this.currentScene, dt * 1000, {
      paused: Boolean(this.paused || this.menuOpen),
      blocked: sceneIdleVariationsBlocked(this),
      visible: layer => this.renderer.sceneLayerVisible(layer),
      available: animation => Boolean(animation && this.assets.isLoaded(this.assets.getSceneImage(this.currentScene.id, animation.asset)))
    });
  }

  sceneIdleVariationPresentation(scene, layer) {
    if (sceneIdleVariationsBlocked(this)) return null;
    return this.sceneIdleVariations?.presentation(scene.id, layer) || null;
  }

  updateSceneNpcSpeech(dt) {
    this.sceneNpcSpeech?.update(this.currentScene, dt * 1000, {
      paused: Boolean(this.paused || this.menuOpen),
      canceled: Boolean(this.devHome || this.editMode || this.animLab || this.simpleAnimTest
        || this.sceneTransitionPending || this.state?.chapter1Completed || this.player?.actionSequence),
      visible: layer => this.renderer.sceneLayerVisible(layer),
      available: animation => Boolean(animation && this.assets.isLoaded(this.assets.getSceneImage(this.currentScene.id, animation.asset))),
      conversation: npcId => this.content.dialogues[this.dialogue.current?.id]?.npcId === npcId,
      idleSamples: layer => this.renderer.sceneNpcSpeechIdleSamples?.(this.currentScene, layer),
      speech: npcId => {
        const elapsed = this.npcSpeechAnimationTime(npcId);
        if (elapsed == null) return null;
        const token = this.dialogue.current ? this.npcDialogueSpeech : this.npcSpeechBubble;
        return token ? { token, elapsed } : null;
      }
    });
  }

  bindInput() {
    const resumeAudio = async () => {
      if (this.state.audioEnabled && !this.audio.enabled) {
        await this.audio.setEnabled(true);
        this.audio.setAmbience(this.currentScene?.ambience);
      }
    };
    window.addEventListener("pointerdown", resumeAudio);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.audio.setEnabled(false);
    });
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.editMode) return;
      this.cycleVerb();
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.simpleAnimTest) return;
      if (this.editMode) {
        this.sceneEditor?.handlePointerDown(event, this.renderer.screenToWorld(event.clientX, event.clientY));
        return;
      }
      if (event.button !== 0 || this.menuOpen || this.paused || this.dialogue.current) return;
      const dialogueWasOpen = Boolean(this.dialogue.current);
      this.handleWorldClick(this.renderer.screenToWorld(event.clientX, event.clientY));
      if (!dialogueWasOpen && this.dialogue.current) {
        this.dialogueChoicePointerLock = event.pointerId;
      }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      const point = this.renderer.screenToWorld(event.clientX, event.clientY);
      if (this.editMode) {
        this.sceneEditor?.handlePointerMove(event, point);
        return;
      }
      this.updateHoveredTarget(point);
    });
    this.canvas.addEventListener("pointerleave", () => {
      if (this.editMode) this.sceneEditor?.handlePointerLeave();
      else this.updateHoveredTarget(null);
    });
    window.addEventListener("pointerup", (event) => {
      if (this.editMode) this.sceneEditor?.handlePointerUp();
      this.releaseDialogueChoicePointerLock(event.pointerId);
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.selectedInventoryItemId || this.inventoryUseItemId) {
          this.clearInventoryInteraction();
          this.renderUi();
          return;
        }
        this.paused = !this.paused;
        this.menuOpen = false;
        this.hoveredTarget = null;
        if (this.canvas?.style) this.canvas.style.cursor = "default";
        this.renderUi();
      }
      if (event.key.toLowerCase() === "v") this.cycleVerb();
      if (event.shiftKey && event.key.toLowerCase() === "g") {
        this.debugSceneGeometry = !this.debugSceneGeometry;
      }
    });
  }

  resolveInitialScene() {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const requestedSceneId = params.get("scene");
    if (requestedSceneId && this.content.scenes[requestedSceneId]) {
      return this.sceneWithDroppedItems(this.content.scenes[requestedSceneId]);
    }
    const scene = this.content.scenes[this.state.currentSceneId] || this.content.scenes[DEFAULT_SAVE.currentSceneId];
    return this.sceneWithDroppedItems(scene);
  }

  droppedItemsInScene(sceneId = this.currentScene?.id) {
    return (this.state.droppedItems || []).filter((record) => (
      record.sceneId === sceneId && !this.itemRestoresToScene(record.itemId, sceneId)
    ));
  }

  itemRestoresToScene(itemId, sceneId = this.currentScene?.id) {
    const scene = this.currentScene?.id === sceneId
      ? this.currentScene
      : this.content?.scenes?.[sceneId];
    return Boolean(scene?.interactables?.some((target) => (
      target.restoreOnDrop && target.takeItemId === itemId
    )));
  }

  sceneWithDroppedItems(scene) {
    if (!scene) return scene;
    const droppedItems = this.droppedItemsInScene(scene.id);
    if (!droppedItems.length) return scene;
    const position = droppedItems[0].position || scene.playerStart;
    const width = 112;
    const height = 75;
    const pile = {
      id: `hotspot.dropped_items.${scene.id}`,
      kind: "hotspot",
      nameKey: "hotspot.dropped_items.name",
      lookKey: "look.dropped_items",
      droppedItemsPile: true,
      droppedItemsPileAsset: "droppedBelongingsPile",
      rect: { x: position.x - width / 2, y: position.y - height, w: width, h: height }
    };
    return { ...scene, interactables: [...scene.interactables, pile] };
  }

  refreshCurrentSceneDroppedItems() {
    const baseScene = this.content.scenes[this.currentScene.id];
    this.currentScene = this.sceneWithDroppedItems(baseScene);
  }

  readDebugGeometrySetting() {
    if (this.readBooleanParam("edit")) return true;
    return this.readBooleanParam("debugGeometry");
  }

  defaultWalkMotionMultipliers() {
    return null;
  }

  defaultWalkMotionMultipliersByFacing() {
    const parts = this.defaultWalkPartsByFacing();
    return Object.fromEntries(Object.entries(parts).map(([facing, value]) => [facing, Object.fromEntries(Object.entries(value).filter(([, frame]) => frame?.movementSpeedMultipliers).map(([part, frame]) => [part, frame.movementSpeedMultipliers]))]));
  }

  defaultAnimationFpsByFacing() {
    return Object.fromEntries(Object.entries(this.defaultWalkPartsByFacing()).map(([facing, value]) => [facing, Object.fromEntries(Object.entries(value).filter(([, frame]) => frame?.fps).map(([part, frame]) => [part, frame.fps]))]));
  }

  defaultWalkMovementStartFrameByFacing() {
    return Object.fromEntries(Object.entries(this.characterDefinitions["npc.bai_mitko"].animations.walk.directions).filter(([, frame]) => Number.isInteger(frame?.movementStartFrame)).map(([facing, frame]) => [facing, frame.movementStartFrame]));
  }

  defaultWalkPartsByFacing() {
    return this.characterDefinitions["npc.bai_mitko"].animations.walk.parts || {};
  }

  idleVariantsForFacing(facing = this.player.facing) {
    const fallbackFacing = eastWestFallbackFacing(facing) || "east";
    return externalAnimationV1.idleVariants?.[fallbackFacing] || externalAnimationV1.idleVariants?.east || [];
  }

  currentIdleVariantFrame() {
    if (this.player.animation !== "idle" || !this.player.idleVariant) return null;
    return this.player.idleVariant;
  }

  setIdleHoldFrame(frame, frameIndex = null) {
    if (!frame?.slot) return;
    this.player.idleHoldFrame = {
      frame,
      slot: frame.slot,
      mirrored: Boolean(frame.mirrored),
      frameIndex: Number.isInteger(frameIndex) ? frameIndex : Math.max(0, (frame.frameCount || 1) - 1)
    };
  }

  finishingStopFrame() {
    if (this.player.animation !== "walk" || this.player.walkPart !== "stop" || !this.player.animator?.isFinished()) return null;
    const frame = this.currentAnimationFrame();
    if (!frame?.slot) return null;
    return { frame, frameIndex: Math.max(0, (frame.frameCount || 1) - 1) };
  }

  randomIdleVariantDelay() {
    return IDLE_VARIANT_DELAY_MIN + Math.random() * (IDLE_VARIANT_DELAY_MAX - IDLE_VARIANT_DELAY_MIN);
  }

  updateIdleVariants(dt) {
    if (!this.usesExternalCharacterAnimation()) return;
    if (this.player.animation !== "idle" || this.player.target || this.player.speaking) {
      this.player.idleVariant = null;
      this.player.idleVariantQueue = [];
      this.player.idleVariantTimer = this.randomIdleVariantDelay();
      return;
    }
    if (this.player.idleVariant) {
      if (this.player.animator?.isFinished()) {
        this.setIdleHoldFrame(this.player.idleVariant, Math.max(0, (this.player.idleVariant.frameCount || 1) - 1));
        const nextVariant = this.player.idleVariantQueue?.shift() || null;
        this.player.idleVariant = nextVariant;
        if (!nextVariant) this.player.idleVariantTimer = this.randomIdleVariantDelay();
      }
      return;
    }
    this.player.idleVariantTimer = Math.max(0, Number(this.player.idleVariantTimer || 0) - dt);
    if (this.player.idleVariantTimer > 0) return;
    const variants = this.idleVariantsForFacing();
    if (!variants.length) {
      this.player.idleVariantTimer = this.randomIdleVariantDelay();
      return;
    }
    const sequence = this.randomIdleVariantSequence(variants);
    this.assets?.preloadCharacterSlots?.(this.player.id, sequence.map((variant) => variant.slot));
    this.player.idleVariant = sequence.shift() || null;
    this.player.idleVariantQueue = sequence;
  }

  randomIdleVariant(variants, excludedSlot = null) {
    const pool = variants.filter((variant) => variant?.slot && variant.slot !== excludedSlot);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  randomIdleVariantSequence(variants) {
    const first = this.randomIdleVariant(variants);
    if (!first) return [];
    const sequence = [first];
    if (variants.length < 2 || Math.random() >= IDLE_VARIANT_COMBO_PROBABILITY) return sequence;
    const idle5 = variants.find((variant) => variant.slot === "external_idle_east_5");
    const followup = idle5 && idle5.slot !== first.slot && Math.random() < IDLE_VARIANT_FOLLOWUP_IDLE5_PROBABILITY
      ? idle5
      : this.randomIdleVariant(variants, first.slot);
    if (followup) sequence.push(followup);
    return sequence;
  }

  currentSpeechAnimationFrame() {
    return this.player.speechAnimation || null;
  }

  currentActionAnimationFrame() {
    return this.player.actionAnimation || null;
  }

  currentAnimationFps() {
    const action = this.currentActionAnimationFrame();
    if (action) return action.fps;
    const speech = this.currentSpeechAnimationFrame();
    if (speech) return speech.fps;
    const idleVariant = this.currentIdleVariantFrame();
    if (idleVariant) return idleVariant.fps;
    if (this.player.animation !== "walk") return null;
    const frame = this.currentAnimationFrame();
    if (!frame) return null;
    return frame.fps;
  }

  currentAnimationFrame() {
    const facing = this.player.facing || "south";
    const fallbackFacing = eastWestFallbackFacing(facing);
    if (fallbackFacing) {
      const parts = this.player.walkPartsByFacing?.[fallbackFacing];
      const part = this.player.walkPart || "loop";
      return parts?.[part] || parts?.loop || null;
    }
    return this.characterDefinitions["npc.bai_mitko"].animations.walk.directions[fallbackFacing] || null;
  }

  currentAnimationKey() {
    if (this.player.animation === "action") {
      const action = this.currentActionAnimationFrame();
      return `${action?.slot || "action"}:action:${this.player.facing || "east"}`;
    }
    if (this.player.animation === "walk") {
      const facing = eastWestFallbackFacing(this.player.facing) || this.player.facing || "south";
      const part = this.player.walkPart || "loop";
      const frame = this.currentAnimationFrame();
      return `${frame?.slot || "walk"}:${facing}:${part}`;
    }
    if (this.player.animation === "idle") {
      const idleVariant = this.currentIdleVariantFrame();
      if (idleVariant) return `${idleVariant.slot}:idle:${this.player.facing || "east"}`;
      return `idle:${this.player.facing || "south"}`;
    }
    const speech = this.currentSpeechAnimationFrame();
    if (speech) return `${speech.slot}:${this.player.animation}:${this.player.facing || "east"}`;
    return this.player.animation;
  }

  currentAnimationFrameCount() {
    const action = this.currentActionAnimationFrame();
    if (action) return action.frameCount || null;
    const speech = this.currentSpeechAnimationFrame();
    if (speech) return speech.frameCount || null;
    const idleVariant = this.currentIdleVariantFrame();
    if (idleVariant) return idleVariant.frameCount || null;
    if (this.player.animation !== "walk") return null;
    return this.currentAnimationFrame()?.frameCount || null;
  }

  currentAnimationLoopStartFrame() {
    const action = this.currentActionAnimationFrame();
    if (action) return action.loopStartFrame ?? null;
    const speech = this.currentSpeechAnimationFrame();
    if (speech) return speech.loopStartFrame ?? null;
    const idleVariant = this.currentIdleVariantFrame();
    if (idleVariant) return idleVariant.loopStartFrame ?? null;
    if (this.player.animation !== "walk") return null;
    return this.currentAnimationFrame()?.loopStartFrame ?? null;
  }

  currentAnimationInitialFrame() {
    const action = this.currentActionAnimationFrame();
    if (action) return action.initialFrame ?? null;
    const speech = this.currentSpeechAnimationFrame();
    if (speech) return speech.initialFrame ?? null;
    const idleVariant = this.currentIdleVariantFrame();
    if (idleVariant) return idleVariant.initialFrame ?? null;
    if (this.player.animation !== "walk") return null;
    return this.currentAnimationFrame()?.initialFrame ?? null;
  }

  currentAnimationLoop() {
    const action = this.currentActionAnimationFrame();
    if (action) return Boolean(action.loop);
    const speech = this.currentSpeechAnimationFrame();
    if (speech) return Boolean(speech.loop);
    const idleVariant = this.currentIdleVariantFrame();
    if (idleVariant) return Boolean(idleVariant.loop);
    if (this.player.animation !== "walk") return null;
    const frame = this.currentAnimationFrame();
    return frame ? Boolean(frame.loop) : null;
  }

  currentAnimationPingPong() {
    const action = this.currentActionAnimationFrame();
    if (action) return Boolean(action.pingPong);
    const speech = this.currentSpeechAnimationFrame();
    if (speech) return Boolean(speech.pingPong);
    const idleVariant = this.currentIdleVariantFrame();
    if (idleVariant) return Boolean(idleVariant.pingPong);
    return null;
  }

  readBooleanParam(name) {
    const params = new URLSearchParams(globalThis.location?.search || "");
    return params.get(name) === "1";
  }

  readCharacterVariant() {
    const params = new URLSearchParams(globalThis.location?.search || "");
    return params.get("characterVariant") || "external_animation_v1";
  }

  usesExternalCharacterAnimation() {
    return this.characterVariant === "external_animation_v1";
  }

  shouldShowDevHome() {
    const params = new URLSearchParams(globalThis.location?.search || "");
    if (params.get("play") === "1") return false;
    if (params.get("dev") === "0") return false;
    if (params.get("dev") === "1") return true;
    if (params.has("simpleAnimTest") || params.has("animLab") || params.has("edit") || params.has("scene") || params.has("debugGeometry") || params.has("characterVariant")) return false;
    return true;
  }

  readNumberParam(name, fallback) {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const value = Number(params.get(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  sceneMovementSpeed(scene) {
    return (scene.movementSpeed || 100)
      * CHARACTER_DISTANCE_SPEED_MULTIPLIER
      * this.walkSpeedMultiplier
      * intoxicationMovementMultiplier(this.state?.rakiaGlasses);
  }

  updateTimedIntoxication(now = Date.now()) {
    const reduction = applyTimedSobering(this.state, now);
    if (!reduction) return false;
    this.player.speed = this.sceneMovementSpeed(this.currentScene);
    this.save();
    this.renderUi();
    return true;
  }

  cycleVerb() {
    this.clearInventoryInteraction();
    const index = verbs.indexOf(this.selectedVerb);
    this.selectedVerb = verbs[(index + 1) % verbs.length];
    this.renderUi();
  }

  clearStatusMessage() {
    this.message = "";
    this.pendingSpeechBubble = null;
    this.speechBubbleQueue = [];
    this.speechBubblePauseRemaining = 0;
    this.npcSpeechBubble = null;
    if (this.speechBubble) this.hideSpeechBubble(true);
    else if (this.uiRoot) this.renderUi();
  }

  setStatusMessage(message, options = {}) {
    const authoredBeats = (Array.isArray(message) ? message : [message])
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    const beats = authoredBeats.flatMap((part) => this.speechBubblePages(part));
    if (this.speechBubble) this.hideSpeechBubble(true);
    this.speechBubbleQueue = beats.slice(1).map((part) => ({ message: part, options: { ...options } }));
    this.speechBubblePauseRemaining = 0;
    const firstBeat = beats[0] || "";
    if (this.player.target || this.player.animation === "walk" || this.player.animation === "action") {
      this.pendingSpeechBubble = firstBeat ? { message: firstBeat, options: { ...options } } : null;
      if (this.pendingSpeechBubble && this.speechBubbleQueue.length) {
        this.pendingSpeechBubble.remaining = [...this.speechBubbleQueue];
      }
      this.speechBubbleQueue = [];
      return;
    }
    this.showSpeechBubbleBeat(firstBeat, options);
  }

  speechBubblePages(message) {
    const normalized = String(message || "").trim();
    if (!normalized || this.speechBubbleTextFits(normalized)) return normalized ? [normalized] : [];

    const words = normalized.split(/\s+/u);
    const pages = [];
    let pageWords = [];
    for (const word of words) {
      const candidate = [...pageWords, word].join(" ");
      if (!pageWords.length || this.speechBubbleTextFits(candidate)) {
        pageWords.push(word);
        continue;
      }
      pages.push(pageWords.join(" "));
      pageWords = [word];
    }
    if (pageWords.length) pages.push(pageWords.join(" "));
    return pages;
  }

  speechBubbleTextFits(text) {
    if (typeof document === "undefined" || !this.uiRoot) return true;
    const probe = element("div", "speech-text speech-text-measure");
    probe.style.width = `${SPEECH_BUBBLE_MAX_WIDTH_PX - 32}px`;
    probe.textContent = text;
    this.uiRoot.appendChild(probe);
    const fits = probe.scrollHeight <= SPEECH_BUBBLE_MAX_TEXT_HEIGHT_PX;
    probe.remove();
    return fits;
  }

  showSpeechBubbleBeat(message, options = {}) {
    this.pendingSpeechBubble = null;
    this.message = message;
    this.speechBubble = message
      ? {
          id: `speech-${++this.speechBubbleSequence}`,
          text: message,
          tone: options.reject ? "reject" : "talk",
          metrics: null,
          debug: null,
          elapsed: 0,
          visibleSeconds: this.speechBubbleVisibleSeconds(message),
          phase: "in"
        }
      : null;
    if (this.speechBubble) this.speechBubble.metrics = this.measureSpeechBubble(message);
    this.startSpeechAnimationForMessage(message, options);
    if (this.uiRoot) this.renderUi();
  }

  replaceSpeechBubbleBeat(message, options = {}) {
    if (!this.speechBubble) {
      this.showSpeechBubbleBeat(message, options);
      return;
    }
    this.message = message;
    this.speechBubble.text = message;
    this.speechBubble.tone = options.reject ? "reject" : "talk";
    this.speechBubble.metrics = this.measureSpeechBubble(message);
    this.speechBubble.debug = null;
    this.speechBubble.elapsed = 0;
    this.speechBubble.visibleSeconds = this.speechBubbleVisibleSeconds(message);
    this.speechBubble.phase = "visible";
    this.speechBubble.waitingForNextBeat = false;
    this.speechBubblePauseRemaining = 0;
    this.startSpeechAnimationForMessage(message, options);
    if (this.uiRoot) this.renderUi();
  }

  beginSpeechBubbleBeatTransition(message, options = {}) {
    if (!this.speechBubble) {
      this.showSpeechBubbleBeat(message, options);
      return;
    }
    const nextMetrics = this.measureSpeechBubble(message);
    this.speechBubble.beatTransition = {
      elapsed: 0,
      swapped: false,
      message,
      options: { ...options },
      metrics: nextMetrics
    };
    this.speechBubble.phase = "beat-out";
    this.speechBubble.waitingForNextBeat = false;
    this.speechBubblePauseRemaining = 0;
    const bubble = this.speechBubbleElement();
    if (!bubble) return;
    bubble.classList.remove("phase-in", "phase-out", "phase-visible", "phase-beat-in");
    bubble.classList.add("beat-resizing", "phase-beat-out");
    this.applySpeechBubbleLayout(bubble, this.speechBubblePosition(nextMetrics), nextMetrics);
  }

  updateSpeechBubbleBeatTransition(dt) {
    const transition = this.speechBubble?.beatTransition;
    if (!transition) return false;
    transition.elapsed += dt;
    if (!transition.swapped && transition.elapsed >= SPEECH_BUBBLE_BEAT_TEXT_FADE_SECONDS) {
      transition.swapped = true;
      this.message = transition.message;
      this.speechBubble.text = transition.message;
      this.speechBubble.tone = transition.options.reject ? "reject" : "talk";
      this.speechBubble.metrics = transition.metrics;
      this.speechBubble.debug = null;
      this.speechBubble.visibleSeconds = this.speechBubbleVisibleSeconds(transition.message);
      this.speechBubble.phase = "beat-in";
      const bubble = this.speechBubbleElement();
      if (bubble) {
        bubble.classList.remove("phase-beat-out");
        bubble.classList.add("phase-beat-in");
        bubble.classList.toggle("reject", this.speechBubble.tone === "reject");
        const textNode = bubble.querySelector(".speech-text");
        if (textNode) textNode.textContent = transition.message;
      }
      this.startSpeechAnimationForMessage(transition.message, transition.options);
    }
    if (transition.elapsed < SPEECH_BUBBLE_BEAT_RESIZE_SECONDS) return true;
    this.speechBubble.beatTransition = null;
    this.speechBubble.phase = "visible";
    this.speechBubble.elapsed = 0;
    const bubble = this.speechBubbleElement();
    if (bubble) {
      bubble.classList.remove("beat-resizing", "phase-in", "phase-out", "phase-beat-in", "phase-beat-out");
      bubble.classList.add("phase-visible");
    }
    return true;
  }

  speechBubbleVisibleSeconds(message) {
    const normalized = String(message || "").trim();
    const punctuationBonus = (normalized.match(/[.!?…]/g)?.length || 0) * 0.18;
    const readingSeconds = normalized.length / SPEECH_BUBBLE_CHARS_PER_SECOND + punctuationBonus;
    return clampNumber(readingSeconds, SPEECH_BUBBLE_MIN_VISIBLE_SECONDS, SPEECH_BUBBLE_MAX_VISIBLE_SECONDS);
  }

  setNpcSpeechMessage(target, message) {
    const text = String(message || "").trim();
    if (!target?.id || target.kind !== "npc" || !text) return false;
    if (this.speechBubble) this.hideSpeechBubble(true);
    this.pendingSpeechBubble = null;
    this.speechBubbleQueue = [];
    this.npcSpeechBubble = {
      id: `npc-speech-${++this.speechBubbleSequence}`,
      npcId: target.id,
      text,
      elapsed: 0,
      visibleSeconds: this.speechBubbleVisibleSeconds(text),
      phase: "in"
    };
    if (this.uiRoot) this.renderUi();
    return true;
  }

  updateNpcSpeechBubble(dt) {
    if (!this.npcSpeechBubble) return;
    this.npcSpeechBubble.elapsed += dt;
    if (this.npcSpeechBubble.phase === "in" && this.npcSpeechBubble.elapsed >= SPEECH_BUBBLE_FADE_SECONDS) {
      this.npcSpeechBubble.phase = "visible";
      this.renderUi();
    }
    if (
      this.npcSpeechBubble.phase !== "out"
      && this.npcSpeechBubble.elapsed >= this.npcSpeechBubble.visibleSeconds
    ) {
      this.npcSpeechBubble.phase = "out";
      this.renderUi();
    }
    if (
      this.npcSpeechBubble?.phase === "out"
      && this.npcSpeechBubble.elapsed >= this.npcSpeechBubble.visibleSeconds + SPEECH_BUBBLE_FADE_SECONDS
    ) {
      this.npcSpeechBubble = null;
      this.renderUi();
    }
  }

  updateSpeechBubble(dt) {
    if (!this.speechBubble && this.pendingSpeechBubble && !this.player.target && this.player.animation === "idle") {
      const pending = this.pendingSpeechBubble;
      this.pendingSpeechBubble = null;
      this.speechBubbleQueue = pending.remaining || [];
      this.showSpeechBubbleBeat(pending.message, pending.options);
      return;
    }
    if (!this.speechBubble) return;
    if (this.player.target || this.player.animation === "walk" || this.player.animation === "action") {
      this.hideSpeechBubble(true);
      return;
    }
    if (this.updateSpeechBubbleBeatTransition(dt)) return;
    this.speechBubble.elapsed += dt;
    if (this.speechBubble.phase === "in" && this.speechBubble.elapsed >= SPEECH_BUBBLE_FADE_SECONDS) {
      this.speechBubble.phase = "visible";
    }
    if (
      this.speechBubble.phase !== "out"
      && this.speechBubble.elapsed >= this.speechBubble.visibleSeconds
      && !this.speechAnimationInProgress()
    ) {
      if (this.speechBubbleQueue?.length) {
        if (!this.speechBubble.waitingForNextBeat) {
          this.speechBubble.waitingForNextBeat = true;
          this.speechBubblePauseRemaining = SPEECH_BUBBLE_BEAT_PAUSE_SECONDS;
        } else {
          this.speechBubblePauseRemaining = Math.max(0, this.speechBubblePauseRemaining - dt);
          if (this.speechBubblePauseRemaining <= 0) {
            const next = this.speechBubbleQueue.shift();
            this.beginSpeechBubbleBeatTransition(next.message, next.options);
          }
        }
      } else {
        this.hideSpeechBubble();
      }
    }
    if (this.speechBubble?.phase === "out" && this.speechBubble.elapsed >= this.speechBubble.visibleSeconds + SPEECH_BUBBLE_FADE_SECONDS) {
      this.speechBubble = null;
      this.message = "";
      this.renderUi();
    }
  }

  speechAnimationInProgress() {
    const animator = this.player?.animator;
    return Boolean(
      this.player?.speechAnimation
      && typeof animator?.isFinished === "function"
      && !animator.isFinished()
    );
  }

  hideSpeechBubble(immediate = false) {
    if (!this.speechBubble) return;
    if (immediate) {
      this.speechBubble = null;
      this.pendingSpeechBubble = null;
      this.speechBubbleQueue = [];
      this.speechBubblePauseRemaining = 0;
      this.message = "";
      this.player.speaking = false;
      this.player.speechAnimation = null;
      if (!this.player.target && this.player.animation !== "walk") {
        this.player.animation = "idle";
      }
      if (this.uiRoot) this.renderUi();
      return;
    }
    if (this.speechBubble.phase !== "out") {
      this.speechBubble.elapsed = Math.min(this.speechBubble.elapsed, this.speechBubble.visibleSeconds);
      this.speechBubble.phase = "out";
      this.renderUi();
    }
  }

  startSpeechAnimationForMessage(message, options = {}) {
    if (!this.usesExternalCharacterAnimation() || !message || this.player.target || this.player.animation === "walk" || this.player.animation === "action") return;
    const frame = options.reject ? this.randomRejectAnimation() : this.talkAnimationForMessage(message);
    if (!frame) return;
    this.assets?.preloadCharacterSlot?.(this.player.id, frame.slot);
    this.player.speechAnimation = frame;
    this.player.idleVariant = null;
    this.player.idleVariantQueue = [];
    this.player.speaking = true;
    this.player.animation = frame.role === "reject" ? "reject" : "talk";
    this.player.animator?.play(this.player.animation, `${frame.slot}:${this.player.animation}:${this.player.facing || "east"}`);
  }

  updateSpeechAnimationHold() {
    const frame = this.player.speechAnimation;
    if (!frame || !this.player.animator?.isFinished()) return;
    this.setIdleHoldFrame(frame, Math.max(0, (frame.frameCount || 1) - 1));
    this.player.speechAnimation = null;
    this.player.speaking = false;
    if (!this.player.target) this.player.animation = "idle";
  }

  talkAnimationForMessage(message) {
    const semantic = this.talkSemanticForMessage(message);
    const facing = eastWestFallbackFacing(this.player.facing) || "east";
    const byFacing = externalAnimationV1.talkAnimations?.[facing] || externalAnimationV1.talkAnimations?.east || {};
    const pool = byFacing[semantic] || [];
    return this.randomAnimationFrame(pool);
  }

  talkSemanticForMessage(message) {
    const text = String(message || "").trim();
    const words = text.match(/[\p{L}\p{N}]+/gu) || [];
    const sentenceBreaks = text.match(/[.!?…]+/g) || [];
    const sentenceCount = Math.max(1, sentenceBreaks.length || (text ? 1 : 0));
    if (sentenceCount <= 1 && words.length <= 2 && text.length <= TALK_SINGLE_WORD_MAX_CHARS) return "singleWord";
    if (sentenceCount <= 1 && text.length < TALK_LONG_SENTENCE_MIN_CHARS) return "singleShortSentence";
    return "singleLongSentence";
  }

  randomRejectAnimation() {
    const facing = eastWestFallbackFacing(this.player.facing) || "east";
    const pool = externalAnimationV1.rejectAnimations?.[facing] || externalAnimationV1.rejectAnimations?.east || [];
    return this.randomAnimationFrame(pool);
  }

  randomAnimationFrame(pool) {
    if (!Array.isArray(pool) || !pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  actionSequenceForTarget(target, verb) {
    const configured = target?.actions?.[verb];
    if (Array.isArray(configured)) return firstMatchingRule(configured, this.effectContext()) || null;
    return configured || null;
  }

  actionSequenceSkipsAnimation(sequence) {
    const flag = sequence?.skipAnimationWhenFlag;
    return Boolean(flag && this.state?.flags?.[flag]);
  }

  actionAnimationForSequence(sequence) {
    const actionName = sequence?.animation || sequence?.action;
    if (!actionName) return null;
    const facing = eastWestFallbackFacing(sequence.facing || this.player.facing) || "east";
    const byFacing = externalAnimationV1.actionAnimations?.[facing] || externalAnimationV1.actionAnimations?.east || {};
    const frame = this.randomAnimationFrame(byFacing[actionName] || []);
    return frame && sequence?.reverseAnimation ? { ...frame, reverseFrames: true } : frame;
  }

  actionSequenceApproachPoint(sequence) {
    if (sequence?.approach) return { ...sequence.approach };
    if (!sequence?.approachCell) return null;
    const mask = this.currentScene?.walkMask;
    if (!mask) return null;
    const width = Math.max(1, Number(mask.width) || 1);
    const height = Math.max(1, Number(mask.height) || 1);
    const worldWidth = Math.max(1, Number(mask.worldWidth) || 1280);
    const worldHeight = Math.max(1, Number(mask.worldHeight) || 720);
    const x = Math.max(0, Math.min(width - 1, Math.floor(Number(sequence.approachCell.x) || 0)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(Number(sequence.approachCell.y) || 0)));
    return {
      x: (x + 0.5) * (worldWidth / width),
      y: (y + 0.5) * (worldHeight / height)
    };
  }

  startInteractionActionSequence(target, verb, sequence) {
    if (verb === VERBS.TAKE && target.takeItemId && this.inventory.has(target.takeItemId)) {
      this.setStatusMessage(this.t("msg.already_taken"), { reject: true });
      return true;
    }
    if (sequence.facing) this.player.facing = sequence.facing;
    else if (sequence.facingPoint) this.facePoint(sequence.facingPoint);
    if (this.actionSequenceSkipsAnimation(sequence)) {
      const messageKey = sequence?.messageKey;
      if (messageKey) this.setStatusMessage(this.t(messageKey));
      return true;
    }
    const frame = this.actionAnimationForSequence(sequence);
    if (!frame) {
      this.completeInteractionActionSequence({ target, verb, sequence, frame: null });
      return true;
    }
    this.assets?.preloadCharacterSlot?.(this.player.id, frame.slot);
    this.hideSpeechBubble(true);
    this.player.actionSequence = { target, verb, sequence, frame };
    this.player.actionAnimation = frame;
    this.player.speechAnimation = null;
    this.player.speaking = false;
    this.player.idleVariant = null;
    this.player.idleVariantQueue = [];
    this.player.idleHoldFrame = null;
    this.player.animation = "action";
    this.syncAnimatorToAnimationFrame(frame);
    return true;
  }

  updateActionSequence() {
    if (!this.player.actionSequence || this.player.animation !== "action") return;
    const effectFrame = Number(this.player.actionSequence.sequence?.effectFrame);
    if (
      Number.isFinite(effectFrame)
      && (Number(this.player.animator?.frameIndex) || 0) >= effectFrame
    ) {
      this.applyInteractionActionSequenceEffect(this.player.actionSequence);
    }
    if (!this.player.animator?.isFinished()) return;
    this.completeInteractionActionSequence();
  }

  applyInteractionActionSequenceEffect(actionSequence = this.player.actionSequence) {
    if (!actionSequence || actionSequence.effectApplied) return;
    actionSequence.effectApplied = true;
    if (actionSequence.verb !== VERBS.TAKE || !actionSequence.target?.takeItemId) return;
    if (!this.inventory.has(actionSequence.target.takeItemId)) {
      this.inventory.add(actionSequence.target.takeItemId);
    }
    if (actionSequence.target.flagOnTake) this.state[actionSequence.target.flagOnTake] = true;
    if (actionSequence.target.takeEffects?.length) {
      applyEffects(actionSequence.target.takeEffects, this.effectContext());
    }
    this.save();
    if (this.uiRoot) this.renderUi();
  }

  completeInteractionActionSequence(actionSequence = this.player.actionSequence) {
    if (!actionSequence) return;
    const frame = this.player.actionAnimation || actionSequence.frame;
    this.player.actionSequence = null;
    this.player.actionAnimation = null;
    if (frame && actionSequence.sequence?.holdFinalFrame !== false) {
      this.setIdleHoldFrame(frame, Math.max(0, (frame.frameCount || 1) - 1));
    }
    this.player.animation = "idle";
    let stateChanged = false;
    const flagOnComplete = actionSequence.sequence?.flagOnComplete;
    if (flagOnComplete) {
      this.state.flags ||= {};
      this.state.flags[flagOnComplete] = true;
      stateChanged = true;
    }
    if (actionSequence.sequence?.effectsOnComplete?.length) {
      applyEffects(actionSequence.sequence.effectsOnComplete, this.effectContext());
      stateChanged = true;
    }
    if (stateChanged) this.save();
    if (actionSequence.verb === VERBS.TAKE && actionSequence.target?.takeItemId) {
      if (!actionSequence.effectApplied) {
        this.takeTarget(actionSequence.target, { messageKey: actionSequence.sequence?.messageKey });
        return;
      }
      const messageKey = actionSequence.sequence?.messageKey;
      if (messageKey) this.setStatusMessage(this.t(messageKey));
      return;
    }
    const messageKey = actionSequence.sequence?.messageKey;
    if (actionSequence.verb === VERBS.LOOK && actionSequence.target?.lookRules?.length) {
      this.lookTarget(actionSequence.target);
      return;
    }
    if (messageKey) this.setStatusMessage(this.t(messageKey));
  }

  syncAnimatorToAnimationFrame(frame) {
    if (!this.player.animator || !frame) return;
    const frameCount = Math.max(1, Number(frame.frameCount) || 1);
    const initialFrame = Math.max(0, Math.min(Number(frame.initialFrame) || 0, frameCount - 1));
    const fps = Number(frame.fps) || 1;
    this.player.animator.frameIndex = initialFrame;
    this.player.animator.elapsed = initialFrame / fps;
  }

  handleWorldClick(point) {
    if (this.sceneTransitionPending || this.player?.actionSequence || this.player?.animation === "action") return;
    if (this.selectedInventoryItemId && !this.inventoryUseItemId) {
      this.selectedInventoryItemId = null;
      this.renderUi();
    }
    const target = findTargetAt(this.currentScene, point, (candidate) => this.targetAvailable(candidate));
    if (target) {
      this.handleTarget(target, point);
      return;
    }
    if (this.inventoryUseItemId) {
      this.clearInventoryInteraction();
      this.renderUi();
    }
    if (this.currentScene?.playerMode === "closeup") return;
    this.player.pendingInteraction = null;
    const destination = isWalkable(this.currentScene, point)
      ? point
      : nearestReachableWalkablePoint(this.currentScene, this.player.position, point);
    if (destination) {
      this.facePoint(point);
      this.player.pendingFacingPoint = { ...point };
      this.player.interactionDebug = {
        kind: "move",
        click: { ...point },
        feet: { ...destination }
      };
      this.walkToPoint(destination, point);
      this.clearStatusMessage();
    }
  }

  updateHoveredTarget(point) {
    const blocked = this.menuOpen || this.paused || this.dialogue.current
      || this.sceneTransitionPending || this.player?.actionSequence || this.player?.animation === "action";
    const previousTargetId = this.hoveredTarget?.id || null;
    this.hoveredTarget = !blocked && point
      ? findTargetAt(this.currentScene, point, (candidate) => this.targetAvailable(candidate))
      : null;
    if (this.canvas?.style) this.canvas.style.cursor = this.hoveredTarget ? "pointer" : "default";
    if (this.inventoryUseItemId && previousTargetId !== (this.hoveredTarget?.id || null)) this.renderUi();
    return this.hoveredTarget;
  }

  targetAvailable(target) {
    if (target?.hiddenWhenItemOwned && this.inventory?.has(target.hiddenWhenItemOwned)) return false;
    if (target?.requirements && !requirementsMet(target.requirements, this.effectContext())) return false;
    return true;
  }

  handleTarget(target, clickPoint = null) {
    if (this.shouldApproachTargetBeforeAction(target, clickPoint)) return;
    this.performTargetAction(target);
  }

  shouldApproachTargetBeforeAction(target, clickPoint = null) {
    if (target.kind === "exit") return false;
    if (["seated", "closeup"].includes(this.currentScene?.playerMode)) return false;
    const actionSequence = this.actionSequenceForTarget(target, this.selectedVerb);
    const actionApproach = this.actionSequenceApproachPoint(actionSequence);
    if (actionApproach) {
      const rawApproach = actionApproach;
      const approach = this.reachableTargetApproachPoint(rawApproach);
      const reachPoint = actionSequence.facingPoint || clickPoint || this.targetReachPoint(target, clickPoint) || rawApproach;
      if (actionSequence.facing) this.player.facing = actionSequence.facing;
      else this.facePoint(reachPoint);
      this.player.interactionDebug = {
        kind: "target",
        targetId: target.id,
        click: clickPoint ? { ...clickPoint } : null,
        hand: { ...reachPoint },
        reachOrigin: this.playerReachOriginPoint(),
        distancePoint: { ...reachPoint },
        reachDistance: distance(this.playerReachOriginPoint(), reachPoint),
        feetGoal: rawApproach,
        feet: approach ? { ...approach } : null
      };
      if (!approach) return false;
      const approachDistance = distance(this.player.position, approach);
      if (actionSequence.requireExactApproach && approachDistance <= EXACT_ACTION_APPROACH_EPSILON) {
        this.player.position = { ...approach };
        return false;
      }
      if (!actionSequence.requireExactApproach && approachDistance <= TARGET_APPROACH_FEET_CANCEL_DISTANCE) return false;
      this.player.pendingFacingPoint = { ...reachPoint };
      this.player.pendingInteraction = {
        target,
        verb: this.selectedVerb,
        hand: reachPoint,
        approach,
        actionSequence,
        inventoryUseItemId: this.inventoryUseItemId
      };
      this.walkToPoint(approach, reachPoint);
      this.clearStatusMessage();
      return true;
    }
    if (target.interactionApproach) {
      const rawApproach = target.interactionApproach;
      const approach = this.reachableTargetApproachPoint(rawApproach);
      const reachPoint = target.interactionFacingPoint || clickPoint || this.targetReachPoint(target, clickPoint) || rawApproach;
      this.facePoint(reachPoint);
      this.player.interactionDebug = {
        kind: "target",
        targetId: target.id,
        click: clickPoint ? { ...clickPoint } : null,
        hand: { ...reachPoint },
        reachOrigin: this.playerReachOriginPoint(),
        distancePoint: { ...reachPoint },
        reachDistance: distance(this.playerReachOriginPoint(), reachPoint),
        feetGoal: { ...rawApproach },
        feet: approach ? { ...approach } : null
      };
      if (!approach || distance(this.player.position, approach) <= TARGET_APPROACH_FEET_CANCEL_DISTANCE) return false;
      this.player.pendingFacingPoint = { ...reachPoint };
      this.player.pendingInteraction = {
        target,
        verb: this.selectedVerb,
        hand: reachPoint,
        approach,
        inventoryUseItemId: this.inventoryUseItemId
      };
      this.walkToPoint(approach, reachPoint);
      this.clearStatusMessage();
      return true;
    }
    const reachPoint = this.targetReachPoint(target, clickPoint);
    if (!reachPoint) return false;
    this.facePoint(reachPoint);
    const feetGoal = this.targetFeetApproachPoint(reachPoint);
    const approach = this.reachableTargetApproachPoint(feetGoal)
      || this.reachableTargetApproachPoint(reachPoint);
    const reachOrigin = this.playerReachOriginPoint();
    const distancePoint = reachPoint;
    const reachDistance = distance(reachOrigin, distancePoint);
    this.player.interactionDebug = {
      kind: "target",
      targetId: target.id,
      click: clickPoint ? { ...clickPoint } : null,
      hand: { ...reachPoint },
      reachOrigin,
      distancePoint: { ...distancePoint },
      reachDistance,
      feetGoal,
      feet: approach ? { ...approach } : null
    };
    if (reachDistance <= TARGET_INTERACTION_DISTANCE) {
      return false;
    }
    if (!approach || distance(this.player.position, approach) <= TARGET_APPROACH_FEET_CANCEL_DISTANCE) {
      return false;
    }
    this.player.pendingFacingPoint = { ...reachPoint };
    this.player.pendingInteraction = {
      target,
      verb: this.selectedVerb,
      hand: reachPoint,
      approach,
      inventoryUseItemId: this.inventoryUseItemId
    };
    this.walkToPoint(approach, reachPoint);
    this.clearStatusMessage();
    return true;
  }

  resolvePendingFacingPoint() {
    const point = this.player.pendingFacingPoint;
    if (!point || this.player.target || this.player.animation === "walk") return;
    this.player.pendingFacingPoint = null;
    this.facePoint(point);
  }

  resolvePendingInteraction() {
    const pending = this.player.pendingInteraction;
    if (!pending || this.player.target || this.player.animation === "walk") return;
    this.player.pendingInteraction = null;
    if (pending.hand) this.facePoint(pending.hand);
    const previousVerb = this.selectedVerb;
    this.selectedVerb = pending.verb;
    if (pending.inventoryUseItemId) this.inventoryUseItemId = pending.inventoryUseItemId;
    this.performTargetAction(pending.target, pending.actionSequence);
    this.selectedVerb = previousVerb;
  }

  targetCenter(target) {
    if (target.rect) return { x: target.rect.x + target.rect.w * 0.5, y: target.rect.y + target.rect.h * 0.5 };
    if (target.polygon?.length) {
      const sum = target.polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
      return { x: sum.x / target.polygon.length, y: sum.y / target.polygon.length };
    }
    return null;
  }

  targetReachPoint(target, clickPoint = null) {
    if (clickPoint) return { ...clickPoint };
    if (target.rect) {
      return {
        x: target.rect.x + target.rect.w * 0.3,
        y: target.rect.y + target.rect.h * 0.5
      };
    }
    return clickPoint || this.targetCenter(target);
  }

  targetFeetApproachPoint(handPoint) {
    const side = this.player.position.x >= handPoint.x ? 1 : -1;
    return {
      x: handPoint.x + side * TARGET_HAND_TO_FEET_X,
      y: handPoint.y + TARGET_HAND_TO_FEET_Y
    };
  }

  reachableTargetApproachPoint(point) {
    const nearest = nearestWalkablePoint(this.currentScene, point);
    if (!nearest) {
      return nearestReachableWalkablePoint(this.currentScene, this.player.position, point);
    }
    if (distance(this.player.position, nearest) <= TARGET_APPROACH_FEET_CANCEL_DISTANCE) return nearest;
    if (findWalkPath(this.currentScene, this.player.position, nearest).length) return nearest;
    return nearestReachableWalkablePoint(this.currentScene, this.player.position, point) || nearest;
  }

  playerReachOriginPoint() {
    const definition = this.characterDefinitions?.["npc.bai_mitko"] || characterDefinitions["npc.bai_mitko"];
    const height = characterHeight(definition, this.currentScene, this.player.position);
    const facing = eastWestFallbackFacing(this.player.facing) || this.player.facing || "east";
    const side = facing === "west" ? -1 : 1;
    return {
      x: this.player.position.x + side * height * TARGET_REACH_ORIGIN_SIDE_RATIO,
      y: this.player.position.y - height * TARGET_REACH_ORIGIN_HEIGHT_RATIO
    };
  }

  facePoint(point) {
    if (!point) return;
    this.player.facing = facingFromDelta(point.x - this.player.position.x, point.y - this.player.position.y, this.player);
  }

  walkToPoint(point, facingPoint = point) {
    const path = findWalkPath(this.currentScene, this.player.position, point);
    const route = path.length ? path : [{ ...point }];
    const routeDistance = walkPathDistance(this.player.position, route);
    const shortWalk = routeDistance > 0 && routeDistance <= SHORT_WALK_PATH_DISTANCE;
    this.hideSpeechBubble(true);
    this.npcSpeechBubble = null;
    this.player.actionSequence = null;
    this.player.actionAnimation = null;
    this.movement.walkTo(point, facingPoint, route, { shortWalk });
  }

  performTargetAction(target, forcedActionSequence = null) {
    if (this.inventoryUseItemId) {
      this.useInventoryItemOnTarget(this.inventoryUseItemId, target);
      return;
    }
    if (target.kind === "exit") {
      if (!requirementsMet(target.accessRequirements, this.effectContext())) {
        this.setStatusMessage(this.t(target.blockedMessageKey), { reject: true });
        return;
      }
      this.changeScene(target.targetSceneId, target.targetPosition);
      return;
    }
    if (target.droppedItemsPile) {
      if (this.selectedVerb === VERBS.LOOK) {
        this.setStatusMessage(this.t("look.dropped_items", { count: this.droppedItemsInScene().length }));
      } else if (this.selectedVerb === VERBS.USE || this.selectedVerb === VERBS.TAKE) {
        this.droppedItemsOpen = true;
        this.renderUi();
      } else {
        this.setStatusMessage(this.t("msg.need_talk"), { reject: true });
      }
      return;
    }
    const actionSequence = forcedActionSequence || this.actionSequenceForTarget(target, this.selectedVerb);
    if (actionSequence && this.startInteractionActionSequence(target, this.selectedVerb, actionSequence)) return;
    if (this.selectedVerb === VERBS.LOOK) {
      this.lookTarget(target);
      return;
    }
    if (this.selectedVerb === VERBS.TALK) {
      const rule = firstMatchingRule(target.talkRules, this.effectContext());
      if (rule) return this.applyContentEffect(rule, { speakerTarget: target.kind === "npc" ? target : null });
      if (target.talkKey && this.setNpcSpeechMessage(target, this.t(target.talkKey))) return;
      if (target.dialogueId) {
        this.dialogue.start(target.dialogueId);
        this.player.speaking = true;
        this.renderUi();
      } else {
        this.setStatusMessage(this.t("msg.need_talk"), { reject: true });
      }
      return;
    }
    if (this.selectedVerb === VERBS.TAKE && target.takeItemId) {
      this.takeTarget(target);
      return;
    }
    if (this.selectedVerb === VERBS.USE) {
      this.useTarget(target);
      return;
    }
    this.setStatusMessage(this.t("msg.no_use"), { reject: true });
  }

  lookTarget(target) {
    const rule = firstMatchingRule(target.lookRules, this.effectContext());
    if (rule) return this.applyContentEffect(rule);
    this.setStatusMessage(this.t(target.lookKey || target.nameKey));
  }

  takeTarget(target, options = {}) {
    if (!this.targetAvailable(target)) return false;
    const rule = firstMatchingRule(target.takeRules, this.effectContext());
    if (rule) return this.applyContentEffect(rule);
    if (this.inventory.has(target.takeItemId)) {
      this.setStatusMessage(this.t("msg.already_taken"), { reject: true });
      return;
    }
    this.inventory.add(target.takeItemId);
    if (target.flagOnTake) this.state[target.flagOnTake] = true;
    if (target.takeEffects?.length) applyEffects(target.takeEffects, this.effectContext());
    this.setStatusMessage(this.t(options.messageKey || target.takeMessageKey || "msg.taken"));
    this.save();
  }

  useTarget(target) {
    if (target.endingTrigger) return this.requestEnding(target.endingTrigger);
    if (target.useDialogueId) {
      this.clearStatusMessage();
      this.dialogue.start(target.useDialogueId);
      this.player.speaking = false;
      this.renderUi();
      return;
    }
    const rule = firstMatchingRule(target.useRules, this.effectContext());
    if (rule) return this.applyContentEffect(rule);
    this.setStatusMessage(this.t("msg.no_use"), { reject: true });
  }

  beginInventoryItemUse(itemId) {
    if (!itemId || !this.inventory.has(itemId)) return false;
    this.selectedInventoryItemId = null;
    this.inventoryUseItemId = itemId;
    this.selectedVerb = VERBS.USE;
    this.clearStatusMessage();
    this.renderUi();
    return true;
  }

  clearInventoryInteraction() {
    if (this.player?.pendingInteraction?.inventoryUseItemId) this.player.pendingInteraction = null;
    this.selectedInventoryItemId = null;
    this.inventoryUseItemId = null;
  }

  useInventoryItemOnTarget(itemId, target) {
    const item = this.content.items[itemId];
    const explicitRule = firstMatchingRule(
      (target.itemUseRules || []).filter((candidate) => candidate.itemId === itemId),
      this.effectContext()
    );
    const fallbackRule = firstMatchingRule(
      (item?.targetUseRules || []).filter((candidate) => this.itemTargetRuleMatches(candidate, target)),
      this.effectContext()
    );
    const rule = explicitRule || fallbackRule;
    this.clearInventoryInteraction();
    if (rule) return this.applyContentEffect(rule, { speakerTarget: target.kind === "npc" ? target : null });
    if (target.kind === "npc") {
      this.setNpcSpeechMessage(target, this.t(target.itemRejectKey || "msg.inventory.npc_reject_generic"));
      return false;
    }
    this.setStatusMessage(this.t("msg.inventory.cannot_use_with", {
      item: this.t(item?.nameKey || itemId),
      target: this.t(target.nameKey || target.lookKey || target.id)
    }), { reject: true });
    this.renderUi();
    return false;
  }

  itemTargetRuleMatches(rule, target) {
    if (rule.targetIds?.length && !rule.targetIds.includes(target?.id)) return false;
    if (rule.targetKinds?.length && !rule.targetKinds.includes(target?.kind)) return false;
    if (rule.targetTags?.length && !rule.targetTags.some((tag) => target?.tags?.includes(tag))) return false;
    return Boolean(rule.targetIds?.length || rule.targetKinds?.length || rule.targetTags?.length);
  }

  useInventoryItemOnSelf(itemId) {
    const item = this.content.items[itemId];
    const rule = firstMatchingRule(item?.selfUseRules, this.effectContext());
    this.clearInventoryInteraction();
    if (rule) return this.applyContentEffect(rule);
    this.setStatusMessage(this.t("msg.inventory.cannot_use_on_self", {
      item: this.t(item?.nameKey || itemId)
    }), { reject: true });
    this.renderUi();
    return false;
  }

  useInventoryItemOnItem(sourceItemId, targetItemId) {
    if (sourceItemId === targetItemId) {
      this.clearInventoryInteraction();
      this.renderUi();
      return false;
    }
    const source = this.content.items[sourceItemId];
    const target = this.content.items[targetItemId];
    const directRule = firstMatchingRule(
      (source?.itemUseRules || []).filter((candidate) => candidate.itemId === targetItemId),
      this.effectContext()
    );
    const reverseRule = firstMatchingRule(
      (target?.itemUseRules || []).filter((candidate) => candidate.itemId === sourceItemId),
      this.effectContext()
    );
    this.clearInventoryInteraction();
    if (directRule || reverseRule) return this.applyContentEffect(directRule || reverseRule);
    this.setStatusMessage(this.t("msg.inventory.cannot_combine", {
      item: this.t(source?.nameKey || sourceItemId),
      target: this.t(target?.nameKey || targetItemId)
    }), { reject: true });
    this.renderUi();
    return false;
  }

  applyDialogueEffect(effect) {
    this.applyContentEffect(effect, { render: false });
    this.player.speaking = false;
  }

  effectContext() {
    return { state: this.state, inventory: this.inventory, quests: this.quests, now: () => Date.now() };
  }

  applyContentEffect(definition = {}, options = {}) {
    if (definition.endingTrigger) return this.requestEnding(definition.endingTrigger);
    applyEffects(definition.effects, this.effectContext());
    this.audio?.play(definition.soundCue);
    const stateMessage = definition.messageByState;
    const stateValue = Number(this.state[stateMessage?.key]);
    const matchingMessage = stateMessage?.ranges?.find((range) => (
      (!Number.isFinite(Number(range.min)) || stateValue >= Number(range.min))
      && (!Number.isFinite(Number(range.max)) || stateValue <= Number(range.max))
    ));
    const messageKey = matchingMessage?.messageKey || definition.messageKey;
    if (messageKey) {
      const message = this.t(messageKey);
      if (options.speakerTarget?.kind === "npc") this.setNpcSpeechMessage(options.speakerTarget, message);
      else this.setStatusMessage(message, { reject: Boolean(definition.reject) });
    }
    this.player.speed = this.sceneMovementSpeed(this.currentScene);
    this.save();
    if (options.render !== false) this.renderUi();
    if (definition.sceneTransition) return this.changeScene(definition.sceneTransition.sceneId, definition.sceneTransition.position);
    return true;
  }

  requestEnding(trigger = {}) {
    if (this.state.chapter1Completed) return false;
    if (!requirementsMet(trigger.requirements, this.effectContext())) {
      this.setStatusMessage(this.t("msg.election.not_ready"), { reject: true });
      return false;
    }
    this.save();
    const confirmed = globalThis.confirm?.(this.t(trigger.confirmKey || "ui.election.commit_confirm")) ?? false;
    if (!confirmed) {
      this.setStatusMessage(this.t(trigger.cancelledMessageKey || "msg.election.deferred"));
      return false;
    }
    const candidates = (this.content.endings || []).filter((ending) => ending.groupId === trigger.groupId);
    const ending = resolveEnding(candidates, this.effectContext());
    if (!ending) {
      this.setStatusMessage(this.t("msg.election.not_ready"), { reject: true });
      return false;
    }
    this.audio?.setAmbience(null);
    this.audio?.play(ending.soundCue);
    if (ending.presentation?.playerPosition) this.player.position = { ...ending.presentation.playerPosition };
    if (ending.presentation?.facing) this.player.facing = ending.presentation.facing;
    this.player.target = null;
    this.player.walkPath = [];
    this.player.animation = "idle";
    this.dialogue.close();
    this.clearInventoryInteraction();
    this.state.currentSceneId = this.currentScene.id;
    this.menuOpen = false;
    this.paused = false;
    this.hoveredTarget = null;
    this.save();
    this.renderUi();
    return true;
  }

  async changeScene(sceneId, position) {
    if (!this.content.scenes[sceneId]) {
      this.message = this.t("msg.scene_not_ready");
      return;
    }
    const sceneLoadToken = Symbol(sceneId);
    this.sceneLoadToken = sceneLoadToken;
    this.sceneTransitionPending = true;
    this.sceneIdleVariations?.reset();
    this.sceneNpcSpeech?.reset();
    this.audio.resetFootsteps();
    try {
      await this.assets.preloadSceneAssets(sceneId);
      if (this.sceneLoadToken !== sceneLoadToken) return;
      this.currentScene = this.sceneWithDroppedItems(this.content.scenes[sceneId]);
      this.audio?.setAmbience(this.currentScene.ambience);
      this.droppedItemsOpen = false;
      this.clearInventoryInteraction();
      this.state.currentSceneId = sceneId;
      this.player.position = { ...(position || this.currentScene.playerStart) };
      this.player.target = null;
      this.player.walkPath = [];
      this.player.shortWalk = false;
      this.player.pendingInteraction = null;
      this.player.pendingFacingPoint = null;
      this.player.interactionDebug = null;
      this.hoveredTarget = null;
      this.player.actionSequence = null;
      this.player.actionAnimation = null;
      this.player.animation = "idle";
      this.player.speed = this.sceneMovementSpeed(this.currentScene);
      this.protectCurrentAssetWorkingSet();
      this.save();
      this.scheduleAdjacentScenePrefetch(this.currentScene);
    } finally {
      if (this.sceneLoadToken === sceneLoadToken) this.sceneTransitionPending = false;
    }
  }

  setLanguage(language) {
    if (!LANGUAGES.includes(language)) return;
    this.clearInventoryInteraction();
    this.state.language = language;
    this.localization.setLanguage(language);
    this.message = this.t("ui.hint");
    this.save();
    this.renderUi();
  }

  save() {
    this.saveSystem.save(this.state);
  }

  reset() {
    this.state = this.saveSystem.reset();
    this.localization.setLanguage(this.state.language);
    this.currentScene = this.sceneWithDroppedItems(this.content.scenes[this.state.currentSceneId]);
    this.audio?.setAmbience(null);
    this.audio?.setVolume(this.state.audioVolume);
    this.audio?.setEnabled(Boolean(this.state.audioEnabled));
    this.droppedItemsOpen = false;
    this.clearInventoryInteraction();
    this.questListTab = "outstanding";
    this.inventory = new InventorySystem(this.content.items, this.state);
    this.quests = new QuestSystem(this.content.quests, this.state);
    this.player.position = { ...this.currentScene.playerStart };
    this.player.target = null;
    this.player.walkPath = [];
    this.player.shortWalk = false;
    this.player.pendingInteraction = null;
    this.player.pendingFacingPoint = null;
    this.player.interactionDebug = null;
    this.player.actionSequence = null;
    this.player.actionAnimation = null;
    this.player.animation = "idle";
    this.hoveredTarget = null;
    this.message = this.t("ui.hint");
    this.menuOpen = true;
    this.paused = false;
    this.renderUi();
  }

  confirmResetAndReload() {
    const confirmed = globalThis.confirm?.(this.t("ui.reset_confirm")) ?? false;
    if (!confirmed) return;
    this.reset();
    globalThis.location?.reload();
  }

  restartGame() {
    const confirmed = globalThis.confirm?.(this.t("ui.restart_confirm")) ?? false;
    if (!confirmed) return;
    const language = this.state.language;
    this.reset();
    this.state.language = language;
    this.localization.setLanguage(language);
    this.menuOpen = false;
    this.paused = false;
    this.save();
    this.renderUi();
  }

  returnToMainMenu() {
    this.save();
    this.clearInventoryInteraction();
    this.menuOpen = true;
    this.paused = false;
    this.hoveredTarget = null;
    this.renderUi();
  }

  renderUi() {
    if (this.simpleAnimTest) {
      this.renderSimpleAnimControls();
      return;
    }
    if (this.animLab) {
      this.uiRoot.innerHTML = "";
      return;
    }
    const dialogueNode = this.dialogue.getNode();
    this.updateNpcDialogueSpeech();
    this.uiRoot.innerHTML = "";
    if (this.editMode) {
      if (this.sceneEditor) this.uiRoot.appendChild(this.sceneEditor.createPanel());
      return;
    }
    if (this.state.chapter1Completed && !this.menuOpen && !this.devHome) {
      this.uiRoot.appendChild(this.createEnding());
      return;
    }
    if (this.devHome) this.uiRoot.appendChild(this.createDevHome());
    if (this.menuOpen) this.uiRoot.appendChild(this.createMenu());
    if (this.paused) this.uiRoot.appendChild(this.createPause());
    if (dialogueNode) {
      const npcSpeech = this.createDialogueSpeechBubble(dialogueNode);
      if (npcSpeech) this.uiRoot.appendChild(npcSpeech);
      this.uiRoot.appendChild(this.createDialogue(dialogueNode));
    }
    if (this.npcSpeechBubble && !this.menuOpen && !this.paused && !dialogueNode) {
      const reaction = this.createNpcReactionBubble();
      if (reaction) this.uiRoot.appendChild(reaction);
    }
    if (this.speechBubble && !this.menuOpen && !this.paused && !dialogueNode) this.uiRoot.appendChild(this.createSpeechBubble());
    if (!this.editMode && !this.devHome && !this.menuOpen && !this.paused && !dialogueNode) this.uiRoot.appendChild(this.createHud());
    if (this.droppedItemsOpen && !this.menuOpen && !this.paused && !dialogueNode) {
      this.uiRoot.appendChild(this.createDroppedItemsPanel());
    }
    this.uiRoot.appendChild(this.createTopBar());
  }

  createHud() {
    const hud = element("section", "game-hud");
    hud.setAttribute("aria-label", this.t("ui.hud"));

    const meters = element("div", "hud-meters");
    meters.append(
      this.createIntoxicationMeter(),
      this.createHudMeter("ui.meter.influence", this.state.influence, "influence"),
      this.createHudMeter("ui.meter.suspicion", this.state.suspicion, "suspicion"),
      this.createHudMeter("ui.meter.public_mood", this.state.publicMood, "public-mood")
    );

    const verb = element("button", "hud-verb");
    verb.type = "button";
    verb.textContent = this.t(`verb.${this.selectedVerb}`);
    verb.setAttribute("aria-label", `${this.t("ui.verb")}: ${this.t(`verb.${this.selectedVerb}`)}`);
    verb.addEventListener("pointerdown", (event) => event.stopPropagation());
    verb.addEventListener("click", (event) => {
      event.stopPropagation();
      this.cycleVerb();
    });
    verb.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cycleVerb();
    });

    hud.append(meters, verb);
    const items = this.inventory.list();
    if (items.length) hud.appendChild(this.createInventoryDock(items));
    if (this.inventoryUseItemId) hud.appendChild(this.createInventoryUseIndicator());
    return hud;
  }

  createHudMeter(labelKey, value, tone) {
    const meter = element("div", `hud-meter ${tone}`);
    const normalized = clampNumber(Number(value) || 0, 0, 100);
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-label", this.t(labelKey));
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(normalized));
    meter.innerHTML = `
      <span class="hud-meter-label">${escapeHtml(this.t(labelKey))}</span>
      <span class="hud-meter-track"><span class="hud-meter-fill" style="width:${normalized}%"></span></span>
    `;
    return meter;
  }

  createIntoxicationMeter() {
    const glasses = Math.max(0, Math.min(RAKIA_MAX_GLASSES, Math.round(Number(this.state.rakiaGlasses) || 0)));
    const labelKey = `ui.intoxication.${intoxicationBandKey(glasses)}`;
    const color = intoxicationColor(glasses);
    const meter = element("div", "hud-meter intoxication");
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-label", `${this.t("ui.meter.rakia")}: ${this.t(labelKey)}`);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", String(RAKIA_MAX_GLASSES));
    meter.setAttribute("aria-valuenow", String(glasses));
    meter.innerHTML = `
      <span class="hud-meter-label">${escapeHtml(this.t(labelKey))}</span>
      <span class="hud-meter-track"><span class="hud-meter-fill" style="width:${glasses * 10}%;background:${color}"></span><span class="hud-meter-glass">🥃 ${glasses}/${RAKIA_MAX_GLASSES}</span></span>
    `;
    return meter;
  }

  createInventoryDock(items) {
    const panel = element("div", "inventory-dock-panel");
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("pointerup", (event) => event.stopPropagation());
    panel.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    const dock = element("div", "inventory-dock");
    dock.setAttribute("role", "toolbar");
    dock.setAttribute("aria-label", this.t("ui.inventory"));
    items.forEach((item, index) => {
      const itemName = this.t(item.nameKey);
      const tooltipId = `inventory-tooltip-${item.id.replaceAll(".", "-")}`;
      const itemButton = element("button", "inventory-item");
      itemButton.type = "button";
      itemButton.tabIndex = index === 0 ? 0 : -1;
      itemButton.setAttribute("aria-label", itemName);
      itemButton.setAttribute("aria-describedby", tooltipId);
      itemButton.dataset.itemId = item.id;
      const iconRule = firstMatchingRule(item.iconRules, this.effectContext());
      const iconPath = this.assets.getItemAssetPath(item.id, iconRule?.slot || "icon");
      if (iconPath) {
        const icon = document.createElement("img");
        icon.src = iconPath;
        icon.alt = "";
        icon.draggable = false;
        itemButton.appendChild(icon);
      } else {
        const label = element("span", "inventory-item-label");
        label.textContent = itemName;
        itemButton.appendChild(label);
      }
      const tooltip = element("span", "inventory-tooltip");
      tooltip.id = tooltipId;
      tooltip.setAttribute("role", "tooltip");
      tooltip.textContent = itemName;
      itemButton.appendChild(tooltip);
      const selected = this.selectedInventoryItemId === item.id;
      const using = this.inventoryUseItemId === item.id;
      itemButton.classList.toggle("selected", selected);
      itemButton.classList.toggle("using", using);
      itemButton.setAttribute("aria-pressed", String(selected || using));
      itemButton.addEventListener("click", () => {
        if (this.inventoryUseItemId) {
          this.useInventoryItemOnItem(this.inventoryUseItemId, item.id);
          return;
        }
        this.selectedInventoryItemId = this.selectedInventoryItemId === item.id ? null : item.id;
        this.renderUi();
      });
      dock.appendChild(itemButton);
    });
    dock.addEventListener("keydown", (event) => this.handleInventoryDockKeydown(event, dock));
    panel.appendChild(dock);
    const selectedItem = items.find((item) => item.id === this.selectedInventoryItemId);
    if (selectedItem) {
      const actions = element("div", "inventory-item-actions");
      const name = element("span", "inventory-item-actions-name");
      name.textContent = this.t(selectedItem.nameKey);
      actions.append(
        name,
        button(this.t("ui.inventory.use"), () => this.beginInventoryItemUse(selectedItem.id)),
        ...(selectedItem.selfUseRules?.length
          ? [button(this.t("ui.inventory.use_on_self"), () => this.useInventoryItemOnSelf(selectedItem.id))]
          : []),
        button(this.t("ui.inventory.inspect"), () => {
          this.clearInventoryInteraction();
          this.setStatusMessage(this.t(selectedItem.descriptionKey));
        }),
        button(this.t("ui.inventory.drop"), () => this.dropInventoryItem(selectedItem)),
        button(this.t("ui.inventory.close"), () => {
          this.clearInventoryInteraction();
          this.renderUi();
        })
      );
      panel.appendChild(actions);
    }
    return panel;
  }

  createInventoryUseIndicator() {
    const item = this.content.items[this.inventoryUseItemId];
    const target = this.hoveredTarget;
    const indicator = element("div", "inventory-use-indicator");
    const instruction = element("span", "inventory-use-instruction");
    instruction.textContent = target
      ? this.t("ui.inventory.use_with_target", {
          item: this.t(item?.nameKey || this.inventoryUseItemId),
          target: this.t(target.nameKey || target.lookKey || target.id)
        })
      : this.t("ui.inventory.use_prompt", { item: this.t(item?.nameKey || this.inventoryUseItemId) });
    indicator.append(
      instruction,
      button(this.t("ui.inventory.cancel"), () => {
        this.clearInventoryInteraction();
        this.renderUi();
      })
    );
    return indicator;
  }

  dropInventoryItem(item) {
    if (!item?.id || !this.inventory.has(item.id)) return false;
    if (this.currentScene.allowItemDrop === false) {
      this.setStatusMessage(this.t(this.currentScene.dropBlockedMessageKey));
      return false;
    }
    this.state.droppedItems ||= [];
    const restoresToScene = this.itemRestoresToScene(item.id);
    if (restoresToScene) {
      this.state.droppedItems = this.state.droppedItems.filter((record) => (
        record.itemId !== item.id || record.sceneId !== this.currentScene.id
      ));
    } else {
      const existingPile = this.droppedItemsInScene()[0];
      const requestedPosition = { x: this.player.position.x + 54, y: this.player.position.y };
      const position = existingPile?.position
        || nearestWalkablePoint(this.currentScene, requestedPosition)
        || { ...this.player.position };
      this.state.droppedItems.push({ itemId: item.id, sceneId: this.currentScene.id, position });
    }
    this.inventory.remove(item.id);
    this.selectedInventoryItemId = null;
    this.refreshCurrentSceneDroppedItems();
    this.droppedItemsOpen = !restoresToScene;
    this.save();
    this.setStatusMessage(this.t("msg.inventory.dropped_nearby", { item: this.t(item.nameKey) }));
    this.renderUi();
    return true;
  }

  pickUpDroppedItem(itemId) {
    const recordIndex = (this.state.droppedItems || []).findIndex((record) => (
      record.sceneId === this.currentScene.id && record.itemId === itemId
    ));
    if (recordIndex < 0 || this.inventory.has(itemId)) return false;
    const item = this.content.items[itemId];
    this.state.droppedItems.splice(recordIndex, 1);
    this.inventory.add(itemId);
    this.refreshCurrentSceneDroppedItems();
    if (!this.droppedItemsInScene().length) this.droppedItemsOpen = false;
    this.save();
    this.setStatusMessage(this.t("msg.inventory.picked_up_again", { item: this.t(item?.nameKey || itemId) }));
    this.renderUi();
    return true;
  }

  handleInventoryDockKeydown(event, dock) {
    const items = [...dock.querySelectorAll(".inventory-item")];
    const currentIndex = items.indexOf(document.activeElement);
    if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    items.forEach((item, index) => { item.tabIndex = index === nextIndex ? 0 : -1; });
    items[nextIndex]?.focus();
  }

  createTopBar() {
    const bar = element("div", "top-bar");
    const left = element("div", "top-bar-left");
    const right = element("div", "top-bar-right");
    const menuButton = button(this.t("ui.menu"), () => {
        this.clearInventoryInteraction();
        this.paused = !this.paused;
        this.hoveredTarget = null;
        this.renderUi();
      });
    menuButton.classList.toggle("active", this.paused);
    menuButton.setAttribute("aria-pressed", String(this.paused));
    left.append(menuButton);
    const returnExit = this.currentScene.exits.find(exit => exit.id === this.currentScene.returnExitId);
    if (returnExit) left.append(button(this.t(returnExit.nameKey), () => {
      this.clearStatusMessage();
      this.clearInventoryInteraction();
      this.performTargetAction(returnExit);
    }));
    right.append(
      button(this.t("verb.look"), () => this.selectVerb(VERBS.LOOK)),
      button(this.t("verb.talk"), () => this.selectVerb(VERBS.TALK)),
      button(this.t("verb.use"), () => this.selectVerb(VERBS.USE)),
      button(this.t("verb.take"), () => this.selectVerb(VERBS.TAKE)),
      button("BG", () => this.setLanguage("bg")),
      button("EN", () => this.setLanguage("en"))
    );
    bar.append(left, right);
    return bar;
  }

  selectVerb(verb) {
    this.clearInventoryInteraction();
    this.selectedVerb = verb;
    this.renderUi();
  }

  createSpeechBubble() {
    if (!this.speechBubble.metrics) this.speechBubble.metrics = this.measureSpeechBubble(this.speechBubble.text);
    const position = this.speechBubblePosition();
    const bubble = element("div", `speech-bubble tail-${position.tailSide} phase-${this.speechBubble.phase} ${this.speechBubble.tone === "reject" ? "reject" : ""}`);
    bubble.dataset.speechId = this.speechBubble.id;
    this.applySpeechBubbleLayout(bubble, position, this.speechBubble.metrics);
    bubble.style.maxWidth = `${position.maxWidth}px`;
    bubble.style.maxHeight = `${position.maxHeight}px`;
    bubble.innerHTML = `
      <div class="speech-blobs">
        <div class="speech-blob-top"></div>
        <div class="speech-blob-bottom"></div>
        <svg class="speech-tail" viewBox="0 0 132 82" aria-hidden="true" focusable="false">
          <path d="M130 7 C105 10 85 19 68 34 C49 51 31 65 0 82 C19 57 27 38 34 16 C51 26 73 27 96 18 C110 13 121 9 130 7 Z"></path>
        </svg>
        <div class="speech-text"></div>
      </div>
      <div class="speech-speaker">${escapeHtml(this.t("npc.bai_mitko.name"))}</div>
    `;
    bubble.querySelector(".speech-text").textContent = this.speechBubble.text;
    return bubble;
  }

  speechBubbleElement() {
    if (!this.uiRoot || !this.speechBubble) return null;
    return this.uiRoot.querySelector(`.speech-bubble[data-speech-id="${this.speechBubble.id}"]`);
  }

  applySpeechBubbleLayout(bubble, position, metrics = this.speechBubble?.metrics) {
    if (!bubble || !position) return;
    if (position.right != null) {
      bubble.style.left = "auto";
      bubble.style.right = `${position.right}%`;
    } else {
      bubble.style.right = "auto";
      bubble.style.left = `${position.left}%`;
    }
    bubble.style.bottom = `${position.bottom}%`;
    bubble.style.width = `${position.width}px`;
    if (metrics?.height) bubble.style.height = `${metrics.height}px`;
  }

  measureSpeechBubble(text) {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return { width: SPEECH_BUBBLE_MAX_WIDTH_PX, height: 120, maxWidth: SPEECH_BUBBLE_MAX_WIDTH_PX, maxHeight: SPEECH_BUBBLE_MAX_HEIGHT_PX };
    }
    const maxWidth = SPEECH_BUBBLE_MAX_WIDTH_PX;
    const maxHeight = SPEECH_BUBBLE_MAX_HEIGHT_PX;
    if (!this.uiRoot) return { width: maxWidth, height: 120, maxWidth, maxHeight };
    const probe = element("div", "speech-bubble speech-measure tail-right");
    probe.style.width = `${maxWidth}px`;
    probe.style.maxWidth = `${maxWidth}px`;
    probe.style.maxHeight = `${maxHeight}px`;
    probe.innerHTML = `
      <div class="speech-blobs">
        <div class="speech-blob-top"></div>
        <div class="speech-blob-bottom"></div>
        <svg class="speech-tail" viewBox="0 0 132 82" aria-hidden="true" focusable="false">
          <path d="M130 7 C105 10 85 19 68 34 C49 51 31 65 0 82 C19 57 27 38 34 16 C51 26 73 27 96 18 C110 13 121 9 130 7 Z"></path>
        </svg>
        <div class="speech-text"></div>
      </div>
    `;
    probe.querySelector(".speech-text").textContent = text;
    this.uiRoot.appendChild(probe);
    const measuredWidth = probe.offsetWidth;
    const measuredHeight = probe.offsetHeight;
    probe.remove();
    return {
      width: Math.ceil(Math.min(maxWidth, Math.max(1, measuredWidth))),
      height: Math.ceil(Math.min(maxHeight, Math.max(1, measuredHeight))),
      maxWidth,
      maxHeight
    };
  }

  speechBubblePosition(metricsOverride = null) {
    const definition = this.characterDefinitions?.["npc.bai_mitko"] || characterDefinitions["npc.bai_mitko"];
    const height = characterHeight(definition, this.currentScene, this.player.position);
    const facing = eastWestFallbackFacing(this.player.facing) || "east";
    const side = facing === "west" ? -1 : 1;
    const mouth = {
      x: this.player.position.x + side * height * 0.18,
      y: this.player.position.y - height * 0.68
    };
    const fullSizeHeight =
      definition.render.sceneHeights?.[this.currentScene.id]?.near || definition.gameHeight || height;
    const renderScale = height / Math.max(1, fullSizeHeight);
    const speechOffsetX = SPEECH_BUBBLE_WEST_OFFSET_X_FULL_SIZE * renderScale * (facing === "west" ? 1 : -1);
    const speechOffsetY = SPEECH_BUBBLE_WEST_OFFSET_Y_FULL_SIZE * renderScale;
    const metrics = metricsOverride || this.speechBubble?.metrics || { width: 350, height: 120, maxWidth: SPEECH_BUBBLE_MAX_WIDTH_PX, maxHeight: SPEECH_BUBBLE_MAX_HEIGHT_PX };
    const bubbleWidthWorld = metrics.width;
    const bubbleHeightWorld = metrics.height;
    const tailEnd = {
      x: mouth.x + speechOffsetX,
      y: mouth.y + speechOffsetY
    };
    const tailOffsetXWorld = SPEECH_BUBBLE_WEST_TAIL_END_FROM_RIGHT_PX;
    const tailOffsetYWorld = SPEECH_BUBBLE_TAIL_END_FROM_BOTTOM_PX;
    const bottomWorld = 720 - tailEnd.y + tailOffsetYWorld;
    if (facing === "west") {
      const leftWorld = tailEnd.x - bubbleWidthWorld + tailOffsetXWorld;
      const rightWorld = 1280 - (leftWorld + bubbleWidthWorld);
      const topWorld = 720 - bottomWorld - bubbleHeightWorld;
      this.speechBubble.debug = {
        tailEnd,
        bubbleRect: { x: leftWorld, y: topWorld, w: bubbleWidthWorld, h: bubbleHeightWorld },
        metrics
      };
      return {
        right: (rightWorld / 1280) * 100,
        bottom: (bottomWorld / 720) * 100,
        width: metrics.width,
        maxWidth: metrics.maxWidth,
        maxHeight: metrics.maxHeight,
        tailSide: "right"
      };
    }
    const leftWorld = tailEnd.x - tailOffsetXWorld;
    const topWorld = 720 - bottomWorld - bubbleHeightWorld;
    this.speechBubble.debug = {
      tailEnd,
      bubbleRect: { x: leftWorld, y: topWorld, w: bubbleWidthWorld, h: bubbleHeightWorld },
      metrics
    };
    return {
      left: (leftWorld / 1280) * 100,
      bottom: (bottomWorld / 720) * 100,
      width: metrics.width,
      maxWidth: metrics.maxWidth,
      maxHeight: metrics.maxHeight,
      tailSide: "left"
    };
  }

  createMenu() {
    const menu = element("section", "panel main-menu");
    menu.innerHTML = `<h1>${this.t("game.title")}</h1><p>${this.t("chapter1.title")}</p>`;
    menu.append(
      button(this.t("ui.continue"), () => {
        this.menuOpen = false;
        this.renderUi();
      }),
      button("BG", () => this.setLanguage("bg")),
      button("EN", () => this.setLanguage("en"))
    );
    return menu;
  }

  createEnding() {
    const ending = this.content.endings.find((candidate) => candidate.id === this.state.endingId)
      || this.content.endings.find((candidate) => candidate.id === "ending.chapter1.loss");
    const panel = element("section", "panel ending-panel");
    panel.dataset.endingId = ending?.id || "ending.chapter1.loss";
    panel.innerHTML = `
      <p class="ending-kicker">${escapeHtml(this.t("ending.chapter1.complete"))}</p>
      <h1>${escapeHtml(this.t(ending?.titleKey || "ending.chapter1.loss.title"))}</h1>
      <p class="ending-body">${escapeHtml(this.t(ending?.bodyKey || "ending.chapter1.loss.body"))}</p>
      <dl class="ending-results">
        <div><dt>${escapeHtml(this.t("ui.meter.influence"))}</dt><dd>${Number(this.state.influence) || 0}</dd></div>
        <div><dt>${escapeHtml(this.t("ui.meter.suspicion"))}</dt><dd>${Number(this.state.suspicion) || 0}</dd></div>
        <div><dt>${escapeHtml(this.t("ui.meter.public_mood"))}</dt><dd>${Number(this.state.publicMood) || 0}</dd></div>
      </dl>
    `;
    const report = element("ul", "ending-report");
    const reportKeys = this.state.endingReportKeys || (ending?.reportRules || [])
      .filter(rule => requirementsMet(rule.requirements, this.effectContext())).map(rule => rule.textKey);
    for (const key of reportKeys) {
      const line = element("li");
      line.textContent = this.t(key);
      report.appendChild(line);
    }
    panel.appendChild(report);
    const epilogueKeys = this.state.endingEpilogueKeys || (ending?.epilogue || [])
      .filter(rule => requirementsMet(rule.requirements, this.effectContext())).map(rule => rule.textKey);
    const index = Math.max(0, Math.min(Number(this.state.endingPresentationIndex) || 0, epilogueKeys.length - 1));
    if (epilogueKeys.length) {
      const epilogue = element("p", "ending-epilogue");
      epilogue.setAttribute("aria-live", "polite");
      epilogue.textContent = this.t(epilogueKeys[index]);
      panel.appendChild(epilogue);
      if (index < epilogueKeys.length - 1) panel.appendChild(button(this.t("election.continue"), () => {
        this.state.endingPresentationIndex = index + 1;
        this.save();
        this.renderUi();
      }));
    }
    const actions = element("div", "ending-actions");
    actions.append(
      button(this.t("ui.restart"), () => this.restartGame()),
      button(this.t("ui.main_menu"), () => this.returnToMainMenu())
    );
    panel.appendChild(actions);
    const languages = element("div", "ending-languages");
    languages.append(button("BG", () => this.setLanguage("bg")), button("EN", () => this.setLanguage("en")));
    panel.appendChild(languages);
    return panel;
  }

  createDevHome() {
    const panel = element("section", "panel dev-home");
    panel.innerHTML = `
      <h1>Comrade Candidate Dev</h1>
      <p>Internal development links for runtime art and animation testing.</p>
      <a class="play-link" href="./?play=1">Play Animated East/West</a>
      <div class="dev-links">
        <a href="./docs/chapter1-storyboard.html">Chapter 1 Storyboard / Сториборд — Глава 1</a>
      </div>
      <h2>Chapter 1 visual review</h2>
      <p>These previews use temporary saves. Reload resets the preview; your normal game is untouched.</p>
      <div class="dev-links">
        <a href="./?play=1&review=election">Election room and objections</a>
        <a href="./?play=1&review=convincing_win">Convincing victory</a>
        <a href="./?play=1&review=narrow_win">Narrow victory</a>
        <a href="./?play=1&review=loss">Loss</a>
      </div>
      <h2>Scene Editors</h2>
      <div class="dev-links dev-scene-editors">
        <a href="./?edit=1&scene=scene.chapter1.apartment">Bai Mitko's Room Editor</a>
        <a href="./?edit=1&scene=scene.chapter1.village_square">Village Square Editor</a>
        <a href="./?edit=1&scene=scene.chapter1.mehana">Mehana Editor</a>
        <a href="./?edit=1&scene=scene.chapter1.municipality">Municipality Editor</a>
        <a href="./?edit=1&scene=scene.chapter1.mayor_office">Mayor’s Office Editor</a>
        <a href="./?edit=1&scene=scene.chapter1.archive">Archive Editor</a>
        <a href="./?edit=1&scene=scene.chapter1.election_booth">Election Room Editor</a>
      </div>
      <div class="dev-status-list">
        <div class="dev-status">
          <strong>External Animation v1</strong>
          <span>active Bai Mitko animation import path. East start/loop/short/stop only; west mirrors east. North/south/diagonals deferred.</span>
          <a href="./?animLab=1">Open animLab external section</a>
          <a href="./?simpleAnimTest=1">Open simple animation test</a>
          <a href="./?play=1">Play with External Animation v1</a>
        </div>
      </div>
      <pre class="dev-command">node tools/unpack-external-animation-zips.js
node tools/inspect-external-animation-metadata.js
node tools/preview-external-animations.js
node tools/build-external-runtime-staging.js</pre>
      <div class="dev-links">
        <a href="./?animLab=1">Animation Lab</a>
        <a href="./?simpleAnimTest=1">Simple Animation Test</a>
        <a href="./?play=1">Play External Animation v1</a>
        <a href="./target/external_animation_v1/previews/walk_east_start.gif">Walk East Start GIF</a>
        <a href="./target/external_animation_v1/previews/walk_east_loop.gif">Walk East Loop GIF</a>
        <a href="./target/external_animation_v1/previews/walk_east_stop.gif">Walk East Stop GIF</a>
        <a href="./target/external_animation_v1/previews/walk_east_full_sequence.gif">Full East Sequence GIF</a>
        <a href="./target/external_animation_v1/previews/walk_west_FULL_MIRRORED_FROM_EAST.gif">Mirrored West Sequence GIF</a>
        <a href="./target/external_animation_v1/reports/runtime-staging-report.json">Runtime Staging Report</a>
        <a href="./target/external_animation_v1/reports/metadata-inspection-report.json">Metadata Report</a>
        <a href="./docs/bai-mitko-external-animation-v1-benchmark.md">External Animation Benchmark</a>
      </div>
    `;
    return panel;
  }

  createSimpleAnimState() {
    return {
      x: 180,
      baselineY: 550,
      direction: "east",
      mode: "idle",
      moving: false,
      elapsed: 0,
      frameIndex: 0,
      speed: 60,
      fpsOverride: 0,
      background: "checker",
      showOverlays: this.readSimpleAnimOverlaySetting(),
      pendingStop: false,
      stopExitFrame: this.readSimpleStopExitFrame(),
      canExitToStop: false,
      sequence: null,
      debug: {},
      warnings: []
    };
  }

  readSimpleAnimOverlaySetting() {
    try {
      const value = localStorage.getItem("baimitko.simpleAnim.showOverlays");
      return value === "1";
    } catch {
      return false;
    }
  }

  writeSimpleAnimOverlaySetting(value) {
    try {
      localStorage.setItem("baimitko.simpleAnim.showOverlays", value ? "1" : "0");
    } catch {
      // localStorage is optional in test and privacy-restricted browser contexts.
    }
  }

  readSimpleStopExitFrame() {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const value = Number(params.get("stopExitFrame"));
    if (Number.isInteger(value) && value >= 0) return value;
    return externalAnimationV1.walkParts?.east?.loop?.stopExitFrame ?? 0;
  }

  normalizedSimpleStopExitFrame(frame = this.simpleWalkPart("loop")) {
    const frameCount = Math.max(1, Number(frame?.frameCount) || 1);
    const value = Number(this.simpleAnim.stopExitFrame);
    if (!Number.isFinite(value)) return 0;
    return ((Math.trunc(value) % frameCount) + frameCount) % frameCount;
  }

  simpleWalkPart(part) {
    return externalAnimationV1.walkParts?.east?.[part] || null;
  }

  simpleIdleFrame() {
    const start = this.simpleWalkPart("start");
    return Renderer.holdFrameFromWalkStart(start);
  }

  simpleActionFrame(key) {
    const frame = externalAnimationV1.animations?.[key];
    return frame ? { ...frame, slot: `external_${key}` } : null;
  }

  simpleCurrentFrame() {
    if (this.simpleAnim.mode === "start") return this.simpleWalkPart("start");
    if (this.simpleAnim.mode === "loop") return this.simpleWalkPart("loop");
    if (this.simpleAnim.mode === "short") return this.simpleWalkPart("short");
    if (this.simpleAnim.mode === "stop") return this.simpleWalkPart("stop");
    if (this.simpleAnim.mode === "idle") return this.simpleIdleFrame();
    if (this.simpleAnim.mode?.startsWith("talk_")
      || this.simpleAnim.mode?.startsWith("reject_")
      || this.simpleAnim.mode?.startsWith("look_into_distance_")) return this.simpleActionFrame(this.simpleAnim.mode);
    return null;
  }

  simpleCurrentKey() {
    const frame = this.simpleCurrentFrame();
    if (frame?.slot) return `${frame.slot}:${this.simpleAnim.direction}:${this.simpleAnim.mode}`;
    return `external_walk_east_start:${this.simpleAnim.direction}:${this.simpleAnim.mode}`;
  }

  setSimpleAnimMode(mode, options = {}) {
    this.simpleAnim.mode = mode;
    if (options.direction) this.simpleAnim.direction = options.direction;
    if (typeof options.moving === "boolean") this.simpleAnim.moving = options.moving;
    this.simpleAnim.sequence = options.sequence || null;
    const frame = this.simpleCurrentFrame();
    const fps = this.simpleAnimFps(frame);
    const initialFrame = options.reset === false ? this.simpleAnim.frameIndex : frame?.initialFrame ?? 0;
    this.simpleAnim.frameIndex = initialFrame;
    this.simpleAnim.elapsed = initialFrame / Math.max(1, fps);
    this.simpleAnim.canExitToStop = false;
  }

  resetSimpleAnim() {
    this.simpleAnim.x = this.createSimpleAnimState().x;
    this.renderUi();
  }

  startSimpleWalk(direction) {
    this.simpleAnim.pendingStop = false;
    this.simpleAnim.canExitToStop = false;
    if (this.simpleAnim.moving && (this.simpleAnim.mode === "start" || this.simpleAnim.mode === "loop")) {
      this.simpleAnim.direction = direction;
      this.simpleAnim.sequence = null;
      if (this.simpleAnim.mode === "start") this.setSimpleAnimMode("loop", { direction, moving: true, reset: false });
      return;
    }
    const start = this.simpleWalkPart("start");
    this.setSimpleAnimMode(start ? "start" : "loop", { direction, moving: true });
  }

  stopSimpleWalk() {
    const stop = this.simpleWalkPart("stop");
    if (!stop || this.simpleAnim.mode === "idle") {
      this.setSimpleAnimMode("idle", { moving: false });
      return;
    }
    if (this.simpleAnim.mode === "stop") return;
    this.simpleAnim.pendingStop = false;
    this.simpleAnim.canExitToStop = false;
    this.simpleAnim.moving = false;
    this.simpleAnim.sequence = null;
    this.simpleAnim.lastMoveMultiplier = 0;
    this.simpleAnim.lastMoveDx = 0;
    this.setSimpleAnimMode("stop", { direction: this.simpleAnim.direction, moving: false });
  }

  playSimplePart(part) {
    this.simpleAnim.pendingStop = false;
    this.simpleAnim.canExitToStop = false;
    this.setSimpleAnimMode(part, { direction: "east", moving: false });
  }

  playSimpleFullSequence(direction) {
    this.simpleAnim.direction = direction;
    this.simpleAnim.moving = false;
    this.simpleAnim.pendingStop = false;
    this.simpleAnim.canExitToStop = false;
    this.simpleAnim.sequence = {
      steps: [
        { mode: "idle", duration: 0.45 },
        { mode: "start" },
        { mode: "loop", loops: 3 },
        { mode: "stop" },
        { mode: "idle", duration: 0.45 }
      ],
      index: 0,
      loopFramesRemaining: 0
    };
    this.startSimpleSequenceStep();
  }

  startSimpleSequenceStep() {
    const sequence = this.simpleAnim.sequence;
    if (!sequence) return;
    const step = sequence.steps[sequence.index];
    if (!step) {
      this.setSimpleAnimMode("idle", { moving: false, direction: this.simpleAnim.direction });
      return;
    }
    this.simpleAnim.mode = step.mode;
    this.simpleAnim.moving = false;
    const frame = this.simpleCurrentFrame();
    const fps = this.simpleAnimFps(frame);
    const initialFrame = frame?.initialFrame ?? 0;
    this.simpleAnim.elapsed = initialFrame / Math.max(1, fps);
    this.simpleAnim.frameIndex = initialFrame;
    if (step.mode === "loop") {
      sequence.loopFramesRemaining = (frame?.frameCount || 1) * (step.loops || 1);
    }
  }

  advanceSimpleSequence() {
    const sequence = this.simpleAnim.sequence;
    if (!sequence) return;
    sequence.index += 1;
    this.startSimpleSequenceStep();
  }

  simpleAnimFps(frame) {
    return Number(this.simpleAnim.fpsOverride) > 0 ? Number(this.simpleAnim.fpsOverride) : frame?.fps || 16;
  }

  updateSimpleAnim(dt) {
    const state = this.simpleAnim;
    const frame = this.simpleCurrentFrame();
    const fps = this.simpleAnimFps(frame);
    let finished = false;
    if (frame) {
      state.elapsed += dt;
      const rawIndex = Math.floor(state.elapsed * fps);
      if (frame.loop) {
        state.frameIndex = rawIndex % Math.max(1, frame.frameCount);
      } else {
        state.frameIndex = Math.min(rawIndex, frame.frameCount - 1);
        finished = rawIndex >= frame.frameCount;
      }
    } else {
      state.elapsed += dt;
      state.frameIndex = 0;
    }

    if (state.moving) {
      if (state.mode === "start" && finished) {
        state.lastMoveMultiplier = 0;
        state.lastMoveDx = 0;
        this.setSimpleAnimMode("loop", { direction: state.direction, moving: true });
        return;
      }
      const activeFrame = this.simpleCurrentFrame();
      const multiplier = motionMultiplierAtFrame(activeFrame?.movementSpeedMultipliers, state.frameIndex, 1);
      if (multiplier <= 0) {
        state.lastMoveMultiplier = multiplier;
        state.lastMoveDx = 0;
        return;
      }
      const direction = state.direction === "west" ? -1 : 1;
      const dx = direction * state.speed * multiplier * dt;
      state.lastMoveMultiplier = multiplier;
      state.lastMoveDx = dx;
      state.x += dx;
      state.x = Math.max(180, Math.min(1100, state.x));
    } else {
      state.lastMoveMultiplier = 0;
      state.lastMoveDx = 0;
    }
    if (!state.moving && state.mode === "stop" && finished) {
      this.setSimpleAnimMode("idle", { direction: state.direction, moving: false });
    }

    if (state.sequence) this.updateSimpleSequence(finished, frame, dt);
  }

  updateSimpleSequence(finished, frame, dt) {
    const sequence = this.simpleAnim.sequence;
    const step = sequence.steps[sequence.index];
    if (!step) return;
    if (step.duration && this.simpleAnim.elapsed >= step.duration) {
      this.advanceSimpleSequence();
      return;
    }
    if (step.mode === "loop" && frame) {
      sequence.loopFramesRemaining -= dt * this.simpleAnimFps(frame);
      if (sequence.loopFramesRemaining <= 0) this.advanceSimpleSequence();
      return;
    }
    if (frame && !frame.loop && finished) this.advanceSimpleSequence();
  }

  renderSimpleAnimControls() {
    const start = this.simpleWalkPart("start");
    const loop = this.simpleWalkPart("loop");
    const short = this.simpleWalkPart("short");
    const stop = this.simpleWalkPart("stop");
    const talkShort = this.simpleActionFrame("talk_east_short_1");
    const talkLong1 = this.simpleActionFrame("talk_east_long_1");
    const talkLong2 = this.simpleActionFrame("talk_east_long_2");
    const reject = this.simpleActionFrame("reject_east_1");
    const lookIntoDistance = this.simpleActionFrame("look_into_distance_east_1");
    this.uiRoot.innerHTML = "";
    const panel = element("section", "simple-anim-controls");
    panel.innerHTML = `
      <div class="simple-anim-row">
        <button data-action="reset">Reset</button>
        <button data-action="idle-east">Idle East</button>
        <button data-action="walk-right" ${loop ? "" : "disabled"}>Walk Right</button>
        <button data-action="walk-left" ${loop ? "" : "disabled"}>Walk Left</button>
        <button data-action="stop" ${stop ? "" : "disabled"}>Stop</button>
      </div>
      <div class="simple-anim-row">
        <button data-action="start" ${start ? "" : "disabled"}>Play East Start</button>
        <button data-action="loop" ${loop ? "" : "disabled"}>Play East Loop</button>
        <button data-action="short" ${short ? "" : "disabled"}>Play East Short</button>
        <button data-action="stop-part" ${stop ? "" : "disabled"}>Play East Stop</button>
        <button data-action="full-east" ${start && loop && stop ? "" : "disabled"}>Play Full East Sequence</button>
        <button data-action="full-west" ${start && loop && stop ? "" : "disabled"}>Play Full West Sequence</button>
      </div>
      <div class="simple-anim-row">
        <button data-action="talk_east_short_1" ${talkShort ? "" : "disabled"}>Talk Short 1</button>
        <button data-action="talk_east_long_1" ${talkLong1 ? "" : "disabled"}>Talk Long 1</button>
        <button data-action="talk_east_long_2" ${talkLong2 ? "" : "disabled"}>Talk Long 2</button>
        <button data-action="reject_east_1" ${reject ? "" : "disabled"}>Reject 1</button>
        <button data-action="look_into_distance_east_1" ${lookIntoDistance ? "" : "disabled"}>Look Into Distance</button>
      </div>
      <div class="simple-anim-row">
        <button data-action="clear-cache">Clear Cache + Reload</button>
      </div>
      <div class="simple-anim-row">
        <button data-bg="checker">Checker</button>
        <button data-bg="light">Light</button>
        <button data-bg="gray">Gray</button>
        <button data-bg="dark">Dark</button>
        <button data-bg="green">Green</button>
      </div>
      <label>movement speed <input data-control="speed" type="range" min="0" max="220" step="1" value="${this.simpleAnim.speed}"> <span>${this.simpleAnim.speed}px/s</span></label>
      <label>fps override <input data-control="fps" type="range" min="0" max="20" step="1" value="${this.simpleAnim.fpsOverride}"> <span>${this.simpleAnim.fpsOverride || "16 default"}</span></label>
      <label>stop exit frame <input data-control="stop-exit-frame" type="number" min="0" step="1" value="${this.simpleAnim.stopExitFrame}"> <span>${this.normalizedSimpleStopExitFrame(loop)}</span></label>
      <label><input data-control="overlays" type="checkbox" ${this.simpleAnim.showOverlays ? "checked" : ""}> show bounds/baseline overlays</label>
    `;
    panel.addEventListener("click", (event) => {
      const action = event.target?.dataset?.action;
      const background = event.target?.dataset?.bg;
      if (background) {
        this.simpleAnim.background = background;
        this.renderUi();
        return;
      }
      if (!action) return;
      if (action === "reset") this.resetSimpleAnim();
      if (action === "idle-east") this.setSimpleAnimMode("idle", { direction: "east", moving: false });
      if (action === "walk-right") this.startSimpleWalk("east");
      if (action === "walk-left") this.startSimpleWalk("west");
      if (action === "stop") this.stopSimpleWalk();
      if (action === "start") this.playSimplePart("start");
      if (action === "loop") this.playSimplePart("loop");
      if (action === "stop-part") this.playSimplePart("stop");
      if (action.startsWith("talk_") || action.startsWith("reject_") || action.startsWith("look_into_distance_")) this.playSimplePart(action);
      if (action === "full-east") this.playSimpleFullSequence("east");
      if (action === "full-west") this.playSimpleFullSequence("west");
      if (action === "clear-cache") {
        this.clearBrowserCachesAndReload();
        return;
      }
      this.renderUi();
    });
    panel.addEventListener("input", (event) => {
      const control = event.target?.dataset?.control;
      if (control === "speed") this.simpleAnim.speed = Number(event.target.value);
      if (control === "fps") this.simpleAnim.fpsOverride = Number(event.target.value);
      if (control === "stop-exit-frame") this.simpleAnim.stopExitFrame = Number(event.target.value);
      if (control === "overlays") {
        this.simpleAnim.showOverlays = event.target.checked;
        this.writeSimpleAnimOverlaySetting(this.simpleAnim.showOverlays);
      }
      this.renderUi();
    });
    this.uiRoot.appendChild(panel);
  }

  async clearBrowserCachesAndReload() {
    try {
      if (globalThis.caches?.keys) {
        const keys = await globalThis.caches.keys();
        await Promise.all(keys.map((key) => globalThis.caches.delete(key)));
      }
      globalThis.localStorage?.clear();
      globalThis.sessionStorage?.clear();
    } catch (error) {
      console.warn("[simpleAnim] cache clear failed; reloading anyway", error);
    } finally {
      globalThis.location?.reload();
    }
  }

  createPause() {
    const pause = element("section", "panel pause-menu");
    pause.innerHTML = `<h2>${this.t("ui.menu")}</h2>`;
    pause.append(
      button(this.t("ui.save"), () => {
        this.save();
        this.message = this.t("msg.scene_saved");
        this.paused = false;
        this.renderUi();
      }),
      button(this.t("ui.restart"), () => this.restartGame()),
      button(this.t("ui.main_menu"), () => this.returnToMainMenu())
    );
    const soundButton = button(this.t(this.state.audioEnabled ? "ui.sound.on" : "ui.sound.off"), async () => {
      this.state.audioEnabled = !this.state.audioEnabled;
      await this.audio.setEnabled(this.state.audioEnabled);
      this.audio.setAmbience(this.state.audioEnabled ? this.currentScene?.ambience : null);
      this.save();
      this.renderUi();
    });
    soundButton.setAttribute("aria-pressed", String(Boolean(this.state.audioEnabled)));
    pause.appendChild(soundButton);
    const volumeLabel = element("label", "sound-volume");
    const volumeText = element("span");
    volumeText.textContent = this.t("ui.sound.volume");
    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.step = "1";
    volume.value = String(Math.round(this.audio.volume * 100));
    volume.setAttribute("aria-label", this.t("ui.sound.volume"));
    const value = document.createElement("output");
    value.textContent = `${volume.value}%`;
    volume.addEventListener("input", () => {
      this.state.audioVolume = Number(volume.value) / 100;
      this.audio.setVolume(this.state.audioVolume);
      value.textContent = `${volume.value}%`;
      this.save();
    });
    volumeLabel.append(volumeText, volume, value);
    pause.appendChild(volumeLabel);
    const questViews = {
      outstanding: this.quests.active(),
      completed: this.quests.completed()
    };
    if (!questViews[this.questListTab]) this.questListTab = "outstanding";
    const quests = element("section", "quest-list");
    quests.setAttribute("aria-label", this.t("ui.quests"));
    quests.innerHTML = `<h3>${escapeHtml(this.t("ui.quests"))}</h3>`;
    const tabs = element("div", "quest-list-tabs");
    for (const tabId of ["outstanding", "completed"]) {
      const tab = button(this.t(`ui.quests.tab.${tabId}`), () => {
        this.questListTab = tabId;
        this.renderUi();
      });
      tab.classList.add("quest-list-tab");
      tab.classList.toggle("active", this.questListTab === tabId);
      tab.setAttribute("aria-pressed", String(this.questListTab === tabId));
      tab.setAttribute("aria-label", this.t("ui.quests.tab_with_count", {
        tab: this.t(`ui.quests.tab.${tabId}`),
        count: questViews[tabId].length
      }));
      tabs.appendChild(tab);
    }
    quests.appendChild(tabs);
    const scroll = element("div", "quest-list-scroll");
    const visibleQuests = questViews[this.questListTab];
    const list = document.createElement("ol");
    list.className = "quest-list-items";
    for (const quest of visibleQuests) {
      const entry = document.createElement("li");
      const stage = this.questListTab === "outstanding"
        ? firstMatchingRule(quest.stages, this.effectContext())
        : null;
      entry.textContent = this.t(stage?.titleKey || quest.titleKey);
      entry.dataset.questId = quest.id;
      if (stage?.id) entry.dataset.questStageId = stage.id;
      list.appendChild(entry);
    }
    if (visibleQuests.length) scroll.appendChild(list);
    else {
      const empty = element("p", "quest-list-empty");
      empty.textContent = this.t(`ui.quests.${this.questListTab}.none`);
      scroll.appendChild(empty);
    }
    quests.appendChild(scroll);
    pause.appendChild(quests);
    return pause;
  }

  createDialogue(node) {
    const panel = element("section", "dialogue-panel");
    const dialogue = this.content.dialogues[this.dialogue.current?.id];
    const isNpcDialogue = Boolean(dialogue?.npcId);
    if (node.lineKey && !isNpcDialogue) {
      panel.classList.add("dialogue-panel-with-line");
      const line = document.createElement("p");
      line.textContent = this.t(firstMatchingRule(node.lineRules, this.effectContext())?.lineKey || node.lineKey);
      panel.appendChild(line);
    }
    if (node.entries?.length) {
      panel.classList.add("dialogue-panel-with-entries");
      const entries = element("div", "dialogue-menu-entries");
      for (const entry of node.entries) {
        const row = document.createElement(entry.kind === "heading" ? "h3" : "p");
        row.textContent = this.t(entry.textKey);
        entries.appendChild(row);
      }
      panel.appendChild(entries);
    }
    const choiceNode = node.choicesFrom ? dialogue?.nodes?.[node.choicesFrom] : node;
    const choices = element("div", "dialogue-choice-list");
    for (const choice of (choiceNode?.choices || []).filter((candidate) => this.dialogueChoiceAvailable(candidate))) {
      choices.appendChild(button(this.t(choice.textKey), (event) => this.chooseDialogueChoice(choice, event)));
    }
    if (choices.childElementCount) panel.appendChild(choices);
    return panel;
  }

  // Dialogue text remains visible while choices are considered. Mouth motion has
  // a separate, reading-length window and never changes dialogue or save state.
  updateNpcDialogueSpeech(dt = 0) {
    const session = this.dialogue.current;
    const node = this.dialogue.getNode();
    const dialogue = this.content.dialogues[session?.id];
    const npcId = node?.npcId || dialogue?.npcId;
    const npc = this.currentScene.npcs?.find((candidate) => candidate.id === npcId);
    if (!node?.lineKey || !dialogue?.npcId || !npc) {
      this.npcDialogueSpeech = null;
      return;
    }
    const lineKey = firstMatchingRule(node.lineRules, this.effectContext())?.lineKey || node.lineKey;
    const text = this.t(lineKey);
    const previous = this.npcDialogueSpeech;
    if (!previous || previous.session !== session || previous.nodeId !== session.nodeId
      || previous.sceneId !== this.currentScene.id || previous.npcId !== npcId || previous.text !== text) {
      this.npcDialogueSpeech = {
        session, nodeId: session.nodeId, sceneId: this.currentScene.id, npcId, text,
        elapsed: 0, visibleSeconds: this.speechBubbleVisibleSeconds(text)
      };
    } else if (!this.paused && !this.menuOpen && !this.devHome && !this.editMode) {
      previous.elapsed += Math.max(0, Number(dt) || 0);
    }
  }

  npcSpeechAnimationTime(npcId) {
    if (this.dialogue.current) {
      const speech = this.npcDialogueSpeech;
      return speech?.session === this.dialogue.current && speech.nodeId === this.dialogue.current.nodeId
        && speech.sceneId === this.currentScene.id && speech.npcId === npcId
        && speech.elapsed < speech.visibleSeconds ? speech.elapsed * 1000 : null;
    }
    const speech = this.npcSpeechBubble;
    return speech?.npcId === npcId && speech.phase !== "out"
      && speech.elapsed < speech.visibleSeconds ? speech.elapsed * 1000 : null;
  }

  createDialogueSpeechBubble(node) {
    if (!node?.lineKey) return null;
    const dialogue = this.content.dialogues[this.dialogue.current?.id];
    if (!dialogue?.npcId) return null;
    const npc = this.currentScene.npcs?.find((candidate) => candidate.id === (node.npcId || dialogue.npcId));
    const lineKey = firstMatchingRule(node.lineRules, this.effectContext())?.lineKey || node.lineKey;
    return this.createNpcSpeechBubble(npc, this.t(lineKey), "dialogue-speech-bubble");
  }

  createNpcReactionBubble() {
    const speech = this.npcSpeechBubble;
    if (!speech) return null;
    const npc = this.currentScene.npcs?.find((candidate) => candidate.id === speech.npcId);
    return this.createNpcSpeechBubble(npc, speech.text, `dialogue-speech-bubble npc-reaction-bubble phase-${speech.phase}`);
  }

  createNpcSpeechBubble(npc, text, className) {
    if (!npc?.rect || !text) return null;

    const speechAnchor = npc.speechAnchor || {
      x: npc.rect.x + npc.rect.w * 0.5,
      y: npc.rect.y + Math.min(42, npc.rect.h * 0.18)
    };
    const npcCenterX = speechAnchor.x;
    const bubbleCenterX = clampNumber(npcCenterX, 210, 1070);
    const bubbleBottomY = clampNumber(speechAnchor.y, 118, 480);
    const tailOffset = clampNumber(npcCenterX - bubbleCenterX, -150, 150);
    const speakerClass = npc.id.replaceAll(".", "-");
    const bubble = element("aside", `${className} speaker-${speakerClass}`);
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.setAttribute("aria-label", this.t(npc.nameKey));
    bubble.style.left = `${bubbleCenterX}px`;
    bubble.style.top = `${bubbleBottomY}px`;
    bubble.style.setProperty("--dialogue-tail-offset", `${tailOffset}px`);

    const line = document.createElement("p");
    line.textContent = text;
    bubble.appendChild(line);
    return bubble;
  }

  chooseDialogueChoice(choice, event) {
    if (this.dialogueChoicePointerLock !== null && event?.detail !== 0) return false;
    this.dialogue.choose(choice);
    this.renderUi();
    return true;
  }

  releaseDialogueChoicePointerLock(pointerId) {
    if (this.dialogueChoicePointerLock === null || this.dialogueChoicePointerLock !== pointerId) return;
    const lockedPointerId = pointerId;
    setTimeout(() => {
      if (this.dialogueChoicePointerLock === lockedPointerId) this.dialogueChoicePointerLock = null;
    }, 0);
  }

  dialogueChoiceAvailable(choice) {
    return requirementsMet(choice?.requirements, this.effectContext())
      && requirementsMet(choice?.effect?.requirements, this.effectContext());
  }

  createDroppedItemsPanel() {
    const panel = element("section", "panel dropped-items-panel");
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("click", (event) => event.stopPropagation());
    const title = document.createElement("h2");
    title.textContent = this.t("ui.dropped_items.title");
    panel.appendChild(title);
    for (const record of this.droppedItemsInScene()) {
      const item = this.content.items[record.itemId];
      if (!item) continue;
      const row = element("div", "dropped-item-row");
      const name = document.createElement("span");
      name.textContent = this.t(item.nameKey);
      row.append(name, button(this.t("ui.dropped_items.pick_up"), () => this.pickUpDroppedItem(item.id)));
      panel.appendChild(row);
    }
    panel.appendChild(button(this.t("ui.dropped_items.close"), () => {
      this.droppedItemsOpen = false;
      this.renderUi();
    }));
    return panel;
  }
}

function buildContentIndex(chapter) {
  return {
    scenes: Object.fromEntries(chapter.scenes.map((scene) => [scene.id, scene])),
    items: Object.fromEntries(chapter.items.map((item) => [item.id, item])),
    quests: Object.fromEntries(chapter.quests.map((quest) => [quest.id, quest])),
    dialogues: Object.fromEntries(chapter.dialogues.map((dialogue) => [dialogue.id, dialogue])),
    endings: chapter.endings || []
  };
}

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(label, onClick) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
