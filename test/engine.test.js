import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Localization } from "../src/engine/Localization.js";
import { DialogueSystem } from "../src/engine/DialogueSystem.js";
import { SaveSystem } from "../src/engine/SaveSystem.js";
import { QuestSystem } from "../src/engine/QuestSystem.js";
import { pointInPolygon, findTargetAt, findWalkPath, isWalkable, pointInWalkMask, nearestWalkablePointOnLine, nearestReachableWalkablePoint, nearestWalkablePoint, sceneScale, walkPathDistance } from "../src/engine/SceneGeometry.js";
import { DEFAULT_SAVE, VERBS } from "../src/engine/ids.js";
import { characterHeight } from "../src/engine/CharacterRenderMath.js";
import { facingFromDelta, MovementSystem, requestWalkStop, eastWestFallbackFacing, motionMultiplierAtFrame, walkMotionMultiplierForFrame } from "../src/engine/MovementSystem.js";
import { AnimationPlayer } from "../src/engine/AnimationPlayer.js";
import { Game, SHORT_WALK_PATH_DISTANCE } from "../src/engine/Game.js";
import { Renderer, animationRenderFrameIndex, animationRenderMirrored, animationRenderOffset, animationRenderScale, externalFrameVisualBounds, sceneLayerAnimationFrame, sceneLayerAnimationSourceRect, sceneZIndexForPoint, stableExternalVisualBounds, stopRenderOffsetX, stopRenderOffsetY, targetZIndex } from "../src/engine/Renderer.js";
import { applyTimedSobering, intoxicationBandKey, intoxicationColor, intoxicationMovementMultiplier, RAKIA_SOBER_INTERVAL_MS } from "../src/engine/IntoxicationSystem.js";
import { strings } from "../src/content/localization/index.js";
import { chapter1 } from "../src/content/chapter1/index.js";
import { assetManifest } from "../src/content/art/assetManifest.js";
import { CHARACTER_CUTOUT_MARGIN_RATIO, CHARACTER_SOURCE_SCALE } from "../src/content/art/characterAssetConfig.js";
import { characterDefinitions } from "../src/content/art/characters.js";
import { externalAnimationV1 } from "../src/content/art/externalAnimationRuntime.generated.js";
import { distance } from "../src/engine/geometry.js";
import { AssetLoader, imageAssetPaths } from "../src/engine/AssetLoader.js";
import { SceneEditor, normalizeEditorObjectSource } from "../src/engine/SceneEditor.js";
import { makePng } from "../tools/character-frame-utils.mjs";
import {
  EXTERNAL_WALK_LOOP_MOTION_MAX,
  EXTERNAL_WALK_LOOP_MOTION_MIN,
  chromaKeyGreenToAlpha,
  externalWalkMotionCurve,
  externalWalkRawMotionCurve
} from "../tools/external-animation-utils.mjs";

test("animation asset discovery includes every raster character slot without manifest metadata", () => {
  const paths = imageAssetPaths(assetManifest.characters["npc.bai_mitko"]);
  assert.ok(paths.length > 1);
  assert.ok(paths.includes(assetManifest.characters["npc.bai_mitko"].external_opens_window));
  assert.ok(paths.every((path) => /\.(?:png|webp)$/i.test(path)));
  assert.equal(paths.includes(assetManifest.characters["npc.bai_mitko"].type), false);
});

test("scene preload discovery includes action-timed and persistent raster layers", () => {
  const apartmentPaths = imageAssetPaths(assetManifest.scenes["scene.chapter1.apartment"]);
  assert.ok(apartmentPaths.includes(assetManifest.scenes["scene.chapter1.apartment"].accordionOnChair));
  assert.ok(apartmentPaths.includes(assetManifest.scenes["scene.chapter1.apartment"].windowOpenBack));
  assert.ok(apartmentPaths.includes(assetManifest.scenes["scene.chapter1.apartment"].windowOpen));
  const squarePaths = imageAssetPaths(assetManifest.scenes["scene.chapter1.village_square"]);
  assert.ok(squarePaths.includes(assetManifest.scenes["scene.chapter1.village_square"].babaStoyankaSeated));
});

test("inventory preload discovery includes every authored high-resolution item icon", () => {
  const paths = Object.values(assetManifest.items).flatMap((itemAssets) => imageAssetPaths(itemAssets));
  assert.deepEqual(paths.sort(), [
    assetManifest.items["item.accordion"].icon,
    assetManifest.items["item.campaign_pamphlets"].icon,
    assetManifest.items["item.fake_diploma"].icon,
    assetManifest.items["item.fake_diploma"].stampedIcon,
    assetManifest.items["item.suspicious_receipt"].icon,
    assetManifest.items["item.rakia"].icon,
    assetManifest.items["item.shopska_salad"].icon,
    assetManifest.items["item.tripe_soup"].icon,
    assetManifest.items["item.village_wine"].icon,
    assetManifest.items["item.ballot_box"].icon,
    assetManifest.items["item.pickle_jar"].icon,
    assetManifest.items["item.empty_envelope"].icon,
    assetManifest.items["item.glass_of_water"].icon,
    assetManifest.items["item.municipality_stamp"].icon,
    assetManifest.items["item.sunflower_oil"].icon,
    assetManifest.items["item.unpaid_bills"].icon
  ].sort());
});

test("decoded image cache evicts old optional sheets but preserves the active working set", () => {
  const loader = new AssetLoader({ scenes: {}, characters: {}, items: {} });
  const image = (src) => ({ src, dataset: { loaded: "true" }, naturalWidth: 10, naturalHeight: 10 });
  loader.images.set("old", image("old"));
  loader.images.set("active", image("active"));
  loader.imageReady.set("old", Promise.resolve());
  loader.imageReady.set("active", Promise.resolve());
  loader.imageLastUsed.set("old", 1);
  loader.imageLastUsed.set("active", 2);
  loader.protectedPaths.add("active");

  assert.equal(loader.trimDecodedCache(400), 1);
  assert.equal(loader.images.has("old"), false);
  assert.equal(loader.images.has("active"), true);
});

test("game start waits only for bootstrap character, current scene, and owned item assets", async () => {
  const game = Object.create(Game.prototype);
  let releaseCharacterAssets;
  let releaseSceneAssets;
  let releaseItemAssets;
  let inputBindings = 0;
  let animationFrames = 0;
  let requestedCharacterSlots;
  let requestedSceneId;
  let requestedItemIds;
  game.player = { id: "npc.bai_mitko" };
  game.currentScene = { id: "scene.chapter1.apartment" };
  game.state = { inventory: ["item.unpaid_bills"] };
  game.inputBound = false;
  game.assets = {
    loadRuntimeManifest() { return Promise.resolve(false); },
    preloadCharacterSlots(_characterId, slots) {
      requestedCharacterSlots = slots;
      return new Promise((resolve) => { releaseCharacterAssets = resolve; });
    },
    preloadSceneAssets(sceneId) {
      requestedSceneId = sceneId;
      return new Promise((resolve) => { releaseSceneAssets = resolve; });
    },
    preloadOwnedItemAssets(itemIds) {
      requestedItemIds = itemIds;
      return new Promise((resolve) => { releaseItemAssets = resolve; });
    }
  };
  game.bindInput = () => { inputBindings += 1; };
  game.tick = () => {};
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => { animationFrames += 1; };
  try {
    const starting = game.start();
    await Promise.resolve();
    assert.deepEqual(requestedCharacterSlots, [
      "external_walk_east_start",
      "external_walk_east_loop",
      "external_walk_east_short",
      "external_walk_east_stop"
    ]);
    assert.equal(requestedSceneId, "scene.chapter1.apartment");
    assert.deepEqual(requestedItemIds, ["item.unpaid_bills"]);
    assert.equal(inputBindings, 0);
    assert.equal(animationFrames, 0);
    releaseCharacterAssets([]);
    await Promise.resolve();
    assert.equal(inputBindings, 0);
    releaseSceneAssets([]);
    await Promise.resolve();
    assert.equal(inputBindings, 0);
    releaseItemAssets([]);
    await starting;
    assert.equal(inputBindings, 1);
    assert.equal(animationFrames, 1);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("localization returns Bulgarian and English strings from stable keys", () => {
  const l10n = new Localization(strings, "bg");
  assert.equal(l10n.t("chapter1.title"), "Изборен ден на село");
  assert.equal(l10n.t("quest.chapter1.main.title"), "Стани кмет, преди кредиторите да те намерят.");
  l10n.setLanguage("en");
  assert.equal(l10n.t("chapter1.title"), "Election Day in the Village");
  assert.equal(l10n.t("quest.chapter1.main.title"), "Become Mayor before your creditors find you.");
});

test("menu and Mehana interaction labels are authored in both languages", () => {
  const bgKeys = Object.keys(strings.bg).sort();
  const enKeys = Object.keys(strings.en).sort();
  assert.deepEqual(bgKeys, enKeys);
  assert.equal(strings.bg["ui.menu"], "Меню");
  assert.equal(strings.en["ui.menu"], "Menu");
  assert.equal(strings.bg["dialogue.waiter.choice.shopska"], "Една шопска салата.");
  assert.equal(strings.en["dialogue.waiter.choice.shopska"], "One Shopska salad.");
});

test("localization falls back to English before returning the key", () => {
  const l10n = new Localization({ bg: {}, en: { "known.key": "Known" } }, "bg");
  assert.equal(l10n.t("known.key"), "Known");
  assert.equal(l10n.t("missing.key"), "missing.key");
});

test("localization preserves conversational message arrays and applies replacements per beat", () => {
  const l10n = new Localization({
    bg: { "msg.sequence": ["Първо, {name}.", "После."] },
    en: { "msg.sequence": ["First, {name}.", "Then."] }
  }, "bg");
  assert.deepEqual(l10n.t("msg.sequence", { name: "Митко" }), ["Първо, Митко.", "После."]);
});

test("quest start effects activate a quest once before completion", () => {
  const state = { activeQuests: [], completedQuests: [] };
  const quests = new QuestSystem({
    "quest.chapter1.baba_vote": { id: "quest.chapter1.baba_vote" }
  }, state);

  quests.start("quest.chapter1.baba_vote");
  quests.start("quest.chapter1.baba_vote");
  assert.deepEqual(state.activeQuests, ["quest.chapter1.baba_vote"]);
  quests.complete("quest.chapter1.baba_vote");
  assert.deepEqual(state.activeQuests, []);
  assert.deepEqual(state.completedQuests, ["quest.chapter1.baba_vote"]);
  assert.deepEqual(quests.completed().map((quest) => quest.id), ["quest.chapter1.baba_vote"]);
});

test("dialogue choices honor inventory, flags, and cheap-offer thresholds", () => {
  const game = Object.create(Game.prototype);
  const owned = new Set(["item.sunflower_oil"]);
  game.state = { flags: {}, babaCheapOfferAttempts: 2, babaStoyankaVote: false };
  game.inventory = { has: (itemId) => owned.has(itemId) };
  game.quests = null;

  assert.equal(game.dialogueChoiceAvailable({
    effect: { requirements: { items: ["item.sunflower_oil"], stateMax: { babaCheapOfferAttempts: 2 } } }
  }), true);
  game.state.babaCheapOfferAttempts = 3;
  assert.equal(game.dialogueChoiceAvailable({
    effect: { requirements: { items: ["item.sunflower_oil"], stateMax: { babaCheapOfferAttempts: 2 } } }
  }), false);
  game.state.flags.babaRequiresBetterGift = true;
  assert.equal(game.dialogueChoiceAvailable({
    requirements: { items: ["item.village_wine"], flags: ["babaRequiresBetterGift"] }
  }), false);
  owned.add("item.village_wine");
  assert.equal(game.dialogueChoiceAvailable({
    requirements: { items: ["item.village_wine"], flags: ["babaRequiresBetterGift"] }
  }), true);
});

test("dialogue choices can apply an effect and then advance to an answer node", () => {
  const applied = [];
  const game = Object.create(Game.prototype);
  game.player = { speaking: true };
  game.applyContentEffect = (effect, options) => applied.push({ effect, options });
  game.dialogue = new DialogueSystem({
    "dialogue.test": {
      nodes: {
        start: {},
        answer: { lineKey: "dialogue.test.answer" }
      }
    }
  }, null, (effect) => game.applyDialogueEffect(effect));
  game.dialogue.start("dialogue.test");

  const effect = { effects: [{ type: "startQuest", questId: "quest.test" }] };
  game.dialogue.choose({ effect, next: "answer" });

  assert.deepEqual(applied, [{ effect, options: { render: false } }]);
  assert.equal(game.player.speaking, false);
  assert.equal(game.dialogue.current.nodeId, "answer");
  assert.equal(game.dialogue.getNode().lineKey, "dialogue.test.answer");
});

test("dropping an inventory item outside its home scene leaves a saved recoverable record", () => {
  const game = Object.create(Game.prototype);
  const owned = new Set(["item.accordion"]);
  let saves = 0;
  let renders = 0;
  let sceneRefreshes = 0;
  let message = null;
  game.state = { droppedItems: [] };
  game.currentScene = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.village_square");
  game.player = { position: { x: 700, y: 540 } };
  game.inventory = {
    has: (itemId) => owned.has(itemId),
    add: (itemId) => owned.add(itemId),
    remove: (itemId) => owned.delete(itemId)
  };
  game.selectedInventoryItemId = "item.accordion";
  game.t = (key, replacements = {}) => key === "item.accordion.name"
    ? "Акордеон"
    : `dropped:${replacements.item}`;
  game.save = () => { saves += 1; };
  game.setStatusMessage = (nextMessage) => { message = nextMessage; };
  game.renderUi = () => { renders += 1; };
  game.refreshCurrentSceneDroppedItems = () => { sceneRefreshes += 1; };

  assert.equal(game.dropInventoryItem({ id: "item.accordion", nameKey: "item.accordion.name" }), true);
  assert.equal(owned.has("item.accordion"), false);
  assert.equal(game.state.droppedItems[0].itemId, "item.accordion");
  assert.equal(game.state.droppedItems[0].sceneId, "scene.chapter1.village_square");
  assert.ok(Number.isFinite(game.state.droppedItems[0].position.x));
  assert.equal(game.selectedInventoryItemId, null);
  assert.equal(message, "dropped:Акордеон");
  assert.equal(game.droppedItemsOpen, true);
  assert.equal(sceneRefreshes, 1);
  assert.equal(saves, 1);
  assert.equal(renders, 1);

  game.content = { items: { "item.accordion": { id: "item.accordion", nameKey: "item.accordion.name" } } };
  assert.equal(game.pickUpDroppedItem("item.accordion"), true);
  assert.equal(owned.has("item.accordion"), true);
  assert.deepEqual(game.state.droppedItems, []);
  assert.equal(game.droppedItemsOpen, false);
  assert.equal(sceneRefreshes, 2);
  assert.equal(saves, 2);
  assert.equal(renders, 2);
});

test("dropping the accordion in the apartment restores it without creating a bag pile", () => {
  const game = Object.create(Game.prototype);
  const apartment = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.apartment");
  const owned = new Set(["item.accordion"]);
  game.state = {
    droppedItems: [
      { itemId: "item.accordion", sceneId: apartment.id, position: { x: 700, y: 540 } }
    ]
  };
  game.currentScene = apartment;
  game.content = { scenes: { [apartment.id]: apartment } };
  game.player = { position: { x: 700, y: 540 } };
  game.inventory = {
    has: (itemId) => owned.has(itemId),
    remove: (itemId) => owned.delete(itemId)
  };
  game.selectedInventoryItemId = "item.accordion";
  game.t = (key) => key;
  game.save = () => {};
  game.setStatusMessage = () => {};
  game.renderUi = () => {};

  assert.equal(game.droppedItemsInScene().length, 0);
  assert.equal(game.dropInventoryItem({ id: "item.accordion", nameKey: "item.accordion.name" }), true);
  assert.equal(owned.has("item.accordion"), false);
  assert.deepEqual(game.state.droppedItems, []);
  assert.equal(game.droppedItemsOpen, false);
  assert.equal(game.currentScene.interactables.some((target) => target.droppedItemsPile), false);
  assert.equal(game.targetAvailable(
    apartment.interactables.find((target) => target.id === "hotspot.apartment.accordion")
  ), true);
});

test("saved dropped items create one compact interactive pile per scene", () => {
  const game = Object.create(Game.prototype);
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  game.state = {
    droppedItems: [
      { itemId: "item.accordion", sceneId: scene.id, position: { x: 420, y: 530 } },
      { itemId: "item.empty_envelope", sceneId: scene.id, position: { x: 420, y: 530 } },
      { itemId: "item.unpaid_bills", sceneId: "scene.chapter1.apartment", position: { x: 700, y: 560 } }
    ]
  };

  const decorated = game.sceneWithDroppedItems(scene);
  const piles = decorated.interactables.filter((target) => target.droppedItemsPile);

  assert.equal(piles.length, 1);
  assert.equal(piles[0].id, "hotspot.dropped_items.scene.chapter1.village_square");
  assert.equal(piles[0].droppedItemsPileAsset, "droppedBelongingsPile");
  assert.deepEqual(piles[0].rect, { x: 364, y: 455, w: 112, h: 75 });
});

test("data-authored take effects update quest state after adding the item", () => {
  const game = Object.create(Game.prototype);
  const owned = new Set();
  const completed = [];
  let message = null;
  game.state = { hasBallotBox: false, flags: {} };
  game.inventory = {
    has: (itemId) => owned.has(itemId),
    add: (itemId) => owned.add(itemId),
    remove: (itemId) => owned.delete(itemId)
  };
  game.quests = { complete: (questId) => completed.push(questId) };
  game.t = (key) => key;
  game.setStatusMessage = (value) => { message = value; };
  game.save = () => {};

  game.takeTarget({
    takeItemId: "item.ballot_box",
    flagOnTake: "hasBallotBox",
    takeMessageKey: "msg.mehana.ballot_box_recovered",
    takeEffects: [
      { type: "setFlag", key: "ballotBoxRecovered" },
      { type: "completeQuest", questId: "quest.chapter1.ballot_box" }
    ]
  });

  assert.equal(owned.has("item.ballot_box"), true);
  assert.equal(game.state.hasBallotBox, true);
  assert.equal(game.state.flags.ballotBoxRecovered, true);
  assert.deepEqual(completed, ["quest.chapter1.ballot_box"]);
  assert.equal(message, "msg.mehana.ballot_box_recovered");
});

test("scene polygon geometry detects walkable space", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 }
  ];
  assert.equal(pointInPolygon({ x: 50, y: 50 }, square), true);
  assert.equal(pointInPolygon({ x: 120, y: 50 }, square), false);
});

test("scene hit testing excludes unavailable collected targets and can reach objects behind them", () => {
  const collected = { id: "collected", rect: { x: 0, y: 0, w: 20, h: 20 } };
  const behind = { id: "behind", rect: { x: 0, y: 0, w: 20, h: 20 } };
  const scene = { npcs: [], interactables: [collected, behind], exits: [] };
  assert.equal(findTargetAt(scene, { x: 10, y: 10 }).id, "collected");
  assert.equal(findTargetAt(scene, { x: 10, y: 10 }, (target) => target.id !== "collected").id, "behind");
});

test("chapter scenes define explicit walk geometry for production art", () => {
  for (const scene of chapter1.scenes) {
    if (scene.playerMode === "closeup") {
      assert.equal(scene.walkPolygons.length, 0);
      assert.ok(scene.exits.length);
      continue;
    }
    assert.ok(scene.walkMask?.rows?.length || scene.walkPolygons.length > 0, `${scene.id} needs walk geometry`);
    assert.equal(isWalkable(scene, scene.playerStart), true);
  }
});

test("apartment uses a raster walk mask for walkable floor", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  assert.deepEqual(scene.playerStart, { x: 1000, y: 565 });
  assert.deepEqual(scene.anchors.baiMitkoSpawn, scene.playerStart);
  assert.equal(scene.walkMask.width, 64);
  assert.equal(scene.walkMask.height, 36);
  assert.equal(scene.walkMask.rows.length, 36);
  assert.equal(scene.walkMask.rows.every((row) => row.length === 64), true);
  assert.equal(scene.walkMask.rows.join("").includes("c"), true);
  assert.equal(scene.walkMask.rows.join("").includes("e"), false);
  assert.equal(scene.walkMask.legend.e, undefined);
  assert.ok(scene.foregroundLayers.some((layer) => layer.id === "layer.apartment.table_foreground"
    && layer.asset === "foregroundTable"
    && layer.zIndex === -1
    && layer.left === 104
    && layer.top === 389
    && layer.width === undefined
    && layer.height === undefined));
  assert.ok(scene.foregroundLayers.some((layer) => layer.id === "layer.apartment.bills_on_table"
    && layer.asset === "billsOnTable"
    && layer.zIndex === -2
    && Number.isFinite(layer.top)
    && Number.isFinite(layer.left)
    && layer.hiddenWhenState === "hasUnpaidBills"));
  assert.ok(scene.foregroundLayers.some((layer) => layer.id === "layer.apartment.accordion_on_chair"
    && layer.asset === "accordionOnChair"
    && layer.zIndex === 0
    && layer.top === 399
    && layer.left === 1064
    && layer.hiddenWhenItemOwned === "item.accordion"));
  assert.ok(scene.foregroundLayers.some((layer) => layer.id === "layer.apartment.window_open"
    && layer.asset === "windowOpen"
    && layer.zIndex === 100
    && layer.left === 150
    && layer.top === 51
    && layer.visibleWhenFlag === "apartmentWindowOpen"));
  assert.equal(scene.foregroundLayers.some((layer) => layer.id === "layer.apartment.window_open_back"), false);
});

test("village square uses the shared raster, object, and layer scene pipeline", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  assert.equal(scene.walkMask.width, 64);
  assert.equal(scene.walkMask.height, 36);
  assert.equal(scene.walkMask.rows.length, 36);
  assert.equal(scene.walkMask.rows.every((row) => row.length === 64), true);
  assert.equal(scene.walkMask.rows.join("").includes("c"), true);
  assert.ok(scene.foregroundLayers.some((layer) => layer.id === "layer.square.baba_stoyanka_seated"
    && layer.asset === "babaStoyankaSeated"
    && layer.zIndex === 90
    && layer.left === 325
    && layer.top === 330
    && layer.height === 122));
  // The updated newsstand background already contains the papers.
  assert.equal(scene.foregroundLayers.some((layer) => layer.id === "layer.square.kiosk_papers_pile"), false);
  for (const object of [...scene.exits, ...scene.interactables, ...scene.npcs]) {
    assert.ok(object.polygon?.length >= 3, `${object.id} needs generated editor geometry`);
  }
});

test("village square mehana menu uses the authored editor geometry and bilingual menu copy", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const menu = scene.interactables.find((target) => target.id === "hotspot.square.mehana_menu");

  assert.ok(menu);
  assert.equal(menu.lookKey, "look.square.mehana_menu");
  assert.equal(menu.useDialogueId, "dialogue.square.mehana_menu");
  assert.deepEqual(menu.polygon, [
    { x: 169, y: 333 },
    { x: 216, y: 332 },
    { x: 219, y: 431 },
    { x: 168, y: 434 }
  ]);
  assert.equal(typeof strings.bg[menu.lookKey], "string");
  assert.equal(typeof strings.en[menu.lookKey], "string");
  const menuDialogue = chapter1.dialogues.find((dialogue) => dialogue.id === menu.useDialogueId);
  assert.equal(menuDialogue.nodes.start.entries.length, 9);
});

test("using a content-authored reading target opens its menu dialogue", () => {
  const game = Object.create(Game.prototype);
  let openedDialogue = null;
  let renders = 0;
  let clearedMessages = 0;
  game.dialogue = { start: (dialogueId) => { openedDialogue = dialogueId; } };
  game.player = { speaking: true };
  game.clearStatusMessage = () => { clearedMessages += 1; };
  game.renderUi = () => { renders += 1; };

  game.useTarget({ useDialogueId: "dialogue.square.mehana_menu" });

  assert.equal(openedDialogue, "dialogue.square.mehana_menu");
  assert.equal(game.player.speaking, false);
  assert.equal(clearedMessages, 1);
  assert.equal(renders, 1);
});

test("inventory Use enters explicit item-target mode and can be cancelled", () => {
  const game = Object.create(Game.prototype);
  let renders = 0;
  let clearedMessages = 0;
  game.inventory = { has: (itemId) => itemId === "item.accordion" };
  game.player = { pendingInteraction: null };
  game.selectedVerb = VERBS.LOOK;
  game.selectedInventoryItemId = "item.accordion";
  game.inventoryUseItemId = null;
  game.clearStatusMessage = () => { clearedMessages += 1; };
  game.renderUi = () => { renders += 1; };

  assert.equal(game.beginInventoryItemUse("item.accordion"), true);
  assert.equal(game.selectedInventoryItemId, null);
  assert.equal(game.inventoryUseItemId, "item.accordion");
  assert.equal(game.selectedVerb, VERBS.USE);
  assert.equal(clearedMessages, 1);

  game.clearInventoryInteraction();
  assert.equal(game.inventoryUseItemId, null);
  assert.equal(renders, 1);
});

test("explicit accordion use applies Tony's item-authored rule and clears held state", () => {
  const game = Object.create(Game.prototype);
  const mehana = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.mehana");
  const tony = mehana.npcs.find((target) => target.id === "npc.tony_fridge");
  let applied = null;
  game.state = { tonyVote: false, flags: { tonyChallengeStarted: true } };
  game.inventory = { has: (itemId) => itemId === "item.accordion" };
  game.quests = null;
  game.player = { pendingInteraction: null };
  game.content = { items: Object.fromEntries(chapter1.items.map((item) => [item.id, item])) };
  game.inventoryUseItemId = "item.accordion";
  game.selectedInventoryItemId = null;
  game.applyContentEffect = (rule) => { applied = rule; return true; };

  assert.equal(game.useInventoryItemOnTarget("item.accordion", tony), true);
  assert.equal(applied.messageKey, "msg.accordion_tony");
  assert.equal(game.inventoryUseItemId, null);
});

test("accordion uses character reactions and future animal fallbacks without overriding Tony's puzzle rule", () => {
  const game = Object.create(Game.prototype);
  const accordion = chapter1.items.find((item) => item.id === "item.accordion");
  const applied = [];
  game.state = { babaStoyankaVote: false, tonyVote: false, flags: {} };
  game.inventory = { has: (itemId) => itemId === "item.accordion" };
  game.quests = null;
  game.player = { pendingInteraction: null };
  game.content = { items: { "item.accordion": accordion } };
  game.applyContentEffect = (rule) => { applied.push(rule.messageKey); return true; };

  const useOn = (target) => {
    game.inventoryUseItemId = "item.accordion";
    game.useInventoryItemOnTarget("item.accordion", target);
  };
  useOn({ id: "npc.baba_stoyanka", kind: "npc", itemUseRules: [] });
  game.state.babaStoyankaVote = true;
  useOn({ id: "npc.baba_stoyanka", kind: "npc", itemUseRules: [] });
  useOn({ id: "npc.future_villager", kind: "npc", itemUseRules: [] });
  useOn({ id: "npc.future_stray_dog", kind: "npc", tags: ["animal"], itemUseRules: [] });

  assert.deepEqual(applied, [
    "msg.accordion_baba_before_vote",
    "msg.accordion_baba_after_vote",
    "msg.accordion_generic_npc",
    "msg.accordion_animal"
  ]);
});

test("unmatched inventory use on an NPC is rejected by that NPC instead of Bai Mitko", () => {
  const game = Object.create(Game.prototype);
  const target = {
    id: "npc.baba_stoyanka",
    kind: "npc",
    nameKey: "npc.baba_stoyanka.name",
    itemRejectKey: "msg.inventory.npc_reject.baba_stoyanka",
    itemUseRules: []
  };
  let npcSpeech = null;
  game.content = { items: { "item.empty_envelope": { id: "item.empty_envelope", targetUseRules: [] } } };
  game.state = { flags: {} };
  game.inventory = { has: () => true };
  game.quests = null;
  game.player = { pendingInteraction: null };
  game.inventoryUseItemId = "item.empty_envelope";
  game.selectedInventoryItemId = null;
  game.t = (key) => key;
  game.setNpcSpeechMessage = (speaker, message) => { npcSpeech = { speaker, message }; return true; };
  game.setStatusMessage = () => assert.fail("Bai Mitko must not speak an NPC item rejection");

  assert.equal(game.useInventoryItemOnTarget("item.empty_envelope", target), false);
  assert.deepEqual(npcSpeech, { speaker: target, message: target.itemRejectKey });
  assert.equal(game.inventoryUseItemId, null);
});

test("authored inventory reactions on NPCs retain the target as the speaker", () => {
  const game = Object.create(Game.prototype);
  const rule = { itemId: "item.test", effects: [], messageKey: "msg.test" };
  const target = { id: "npc.test", kind: "npc", itemUseRules: [rule] };
  let application = null;
  game.content = { items: { "item.test": { id: "item.test", targetUseRules: [] } } };
  game.state = { flags: {} };
  game.inventory = { has: () => true };
  game.quests = null;
  game.player = { pendingInteraction: null };
  game.applyContentEffect = (definition, options) => { application = { definition, options }; return true; };

  assert.equal(game.useInventoryItemOnTarget("item.test", target), true);
  assert.deepEqual(application, { definition: rule, options: { speakerTarget: target } });
});

test("inventory self-use applies the item's authored rule and clears the expanded item state", () => {
  const game = Object.create(Game.prototype);
  const rakia = chapter1.items.find((item) => item.id === "item.rakia");
  let applied = null;
  game.state = { rakiaGlasses: 2, flags: {} };
  game.inventory = { has: (itemId) => itemId === "item.rakia" };
  game.quests = null;
  game.player = { pendingInteraction: null };
  game.content = { items: { "item.rakia": rakia } };
  game.inventoryUseItemId = null;
  game.selectedInventoryItemId = "item.rakia";
  game.applyContentEffect = (rule) => { applied = rule; return true; };

  assert.equal(game.useInventoryItemOnSelf("item.rakia"), true);
  assert.equal(applied.messageKey, "msg.self.rakia");
  assert.equal(game.selectedInventoryItemId, null);
});

test("inventory item combination finds the fake-diploma rule in either selection order", () => {
  const game = Object.create(Game.prototype);
  const owned = new Set(["item.unpaid_bills", "item.empty_envelope"]);
  const applied = [];
  game.state = { hasFakeDiploma: false, flags: {} };
  game.inventory = { has: (itemId) => owned.has(itemId) };
  game.quests = null;
  game.player = { pendingInteraction: null };
  game.content = { items: Object.fromEntries(chapter1.items.map((item) => [item.id, item])) };
  game.applyContentEffect = (rule) => { applied.push(rule.messageKey); return true; };
  game.selectedInventoryItemId = null;
  game.inventoryUseItemId = "item.empty_envelope";

  assert.equal(game.useInventoryItemOnItem("item.empty_envelope", "item.unpaid_bills"), true);
  assert.deepEqual(applied, ["msg.fake_diploma.assembled"]);
  assert.equal(game.inventoryUseItemId, null);
});

test("Tony's completed vote is removed from the outstanding quest list", () => {
  const state = {
    activeQuests: ["quest.chapter1.main", "quest.chapter1.tony_vote"],
    completedQuests: []
  };
  const quests = new QuestSystem(Object.fromEntries(chapter1.quests.map((quest) => [quest.id, quest])), state);

  quests.complete("quest.chapter1.tony_vote");

  assert.deepEqual(quests.active().map((quest) => quest.id), ["quest.chapter1.main"]);
  assert.deepEqual(state.completedQuests, ["quest.chapter1.tony_vote"]);
});

test("village square routes the apartment building home and the Mehana table inside", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const apartmentExit = scene.exits.find((exit) => exit.id === "exit.square.to_apartment");
  const mehanaExit = scene.exits.find((exit) => exit.id === "exit.square.to_mehana");

  assert.equal(pointInPolygon({ x: 400, y: 200 }, apartmentExit.polygon), true);
  assert.equal(pointInPolygon({ x: 100, y: 520 }, mehanaExit.polygon), true);
  assert.equal(pointInPolygon({ x: 100, y: 520 }, apartmentExit.polygon), false);
  assert.equal(apartmentExit.targetSceneId, "scene.chapter1.apartment");
  assert.equal(mehanaExit.targetSceneId, "scene.chapter1.mehana");
});

test("village square and municipality form a playable round trip", () => {
  const square = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.village_square");
  const municipality = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.municipality");
  const enter = square.exits.find((exit) => exit.id === "exit.square.to_municipality");
  const leave = municipality.exits.find((exit) => exit.id === "exit.municipality.to_square");

  assert.equal(enter.targetSceneId, municipality.id);
  assert.deepEqual(enter.targetPosition, { x: 250, y: 520 });
  assert.deepEqual(municipality.playerStart, { x: 260, y: 520 });
  assert.deepEqual(municipality.anchors.baiMitkoSpawn, municipality.playerStart);
  assert.equal(leave.targetSceneId, square.id);
  assert.equal(municipality.walkPolygons[0].id, "walk.chapter1.municipality.main");
  assert.equal(municipality.npcs[0].dialogueId, "dialogue.municipality_clerk");
});

test("municipality background staff expose short bilingual talk barks without replacing Penka's dialogue", () => {
  const municipality = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.municipality");
  const clerk = municipality.npcs.find((npc) => npc.id === "npc.municipality_clerk");
  const colleague = municipality.npcs.find((npc) => npc.id === "npc.municipality_colleague");
  const backgroundClerk = municipality.npcs.find((npc) => npc.id === "npc.municipality_background_clerk");

  assert.equal(clerk.talkKey, undefined);
  assert.equal(clerk.dialogueId, "dialogue.municipality_clerk");
  assert.equal(clerk.useDialogueId, undefined);
  assert.equal(colleague.talkKey, "talk.npc.municipality_colleague.helping");
  assert.equal(backgroundClerk.talkKey, "talk.npc.municipality_clerk.busy");
  for (const npc of [clerk, colleague, backgroundClerk]) {
    assert.ok(npc.polygon?.length >= 3);
    assert.equal(typeof strings.bg[npc.nameKey], "string");
    assert.equal(typeof strings.en[npc.nameKey], "string");
  }
  for (const npc of [colleague, backgroundClerk]) {
    assert.equal(typeof strings.bg[npc.talkKey], "string");
    assert.equal(typeof strings.en[npc.talkKey], "string");
  }
});

test("municipality security officer remains a standalone bilingual NPC beside a separate prop table", () => {
  const municipality = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.municipality");
  const officer = municipality.npcs.find((npc) => npc.id === "npc.municipality_security_officer");
  const officerLayer = municipality.foregroundLayers.find((layer) => layer.id === "layer.municipality.security_officer");
  const tableLayer = municipality.foregroundLayers.find((layer) => layer.id === "layer.municipality.security_table");

  assert.ok(officer.polygon?.length >= 3);
  assert.equal(officer.talkKey, "talk.npc.municipality_security_officer.identification");
  assert.equal(typeof strings.bg[officer.nameKey], "string");
  assert.equal(typeof strings.en[officer.nameKey], "string");
  assert.equal(typeof strings.bg[officer.talkKey], "string");
  assert.equal(typeof strings.en[officer.talkKey], "string");
  assert.equal(officerLayer.asset, "securityOfficer");
  assert.equal(tableLayer.asset, "securityTable");
  assert.ok(officerLayer.zIndex < tableLayer.zIndex, "security officer must render in front of the table");
  assert.ok(tableLayer.zIndex < 0, "security table must render in front of foreground-depth Bai Mitko");
});

test("Penka's fitted selection takes priority over the archive cabinet", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");

  assert.equal(findTargetAt(scene, { x: 1150, y: 350 }).id, "npc.municipality_clerk");
  assert.equal(findTargetAt(scene, { x: 1100, y: 250 }).id, "hotspot.municipality.archive_cabinet");
  assert.equal(findTargetAt(scene, { x: 875, y: 330 }).id, "npc.municipality_background_clerk");
});

test("a talk bark takes precedence over a target's formal dialogue", () => {
  const game = Object.create(Game.prototype);
  let spoken = null;
  let openedDialogue = null;
  game.selectedVerb = VERBS.TALK;
  game.t = (key) => key;
  game.setNpcSpeechMessage = (target, message) => {
    spoken = { target, message };
    return true;
  };
  game.dialogue = { start: (dialogueId) => { openedDialogue = dialogueId; } };
  game.player = { speaking: false };

  const target = {
    id: "npc.municipality_clerk",
    kind: "npc",
    talkKey: "talk.npc.municipality_clerk.busy",
    dialogueId: "dialogue.municipality_clerk"
  };
  game.performTargetAction(target);

  assert.deepEqual(spoken, { target, message: target.talkKey });
  assert.equal(openedDialogue, null);
  assert.equal(game.player.speaking, false);
});

test("talking to seated Penka opens her original municipality dialogue", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const penka = scene.npcs.find((npc) => npc.id === "npc.municipality_clerk");
  const game = Object.create(Game.prototype);
  let openedDialogue = null;
  game.selectedVerb = VERBS.TALK;
  game.dialogue = { start: (dialogueId) => { openedDialogue = dialogueId; } };
  game.player = { speaking: false };
  game.renderUi = () => {};

  game.performTargetAction(penka);

  assert.equal(openedDialogue, "dialogue.municipality_clerk");
  assert.equal(game.player.speaking, true);
});

test("regular Use on seated Penka rejects instead of opening her Talk dialogue", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const penka = scene.npcs.find((npc) => npc.id === "npc.municipality_clerk");
  const game = Object.create(Game.prototype);
  let openedDialogue = null;
  let status = null;
  game.selectedVerb = VERBS.USE;
  game.t = (key) => key;
  game.dialogue = { start: (dialogueId) => { openedDialogue = dialogueId; } };
  game.setStatusMessage = (message, options) => { status = { message, options }; };

  game.performTargetAction(penka);

  assert.equal(openedDialogue, null);
  assert.deepEqual(status, { message: "msg.no_use", options: { reject: true } });
});

test("Mehana starts Bai Mitko seated with waiter and table interactions", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.mehana");
  const waiter = scene.npcs.find((npc) => npc.id === "npc.mehana_waiter");
  const waiterLayer = scene.foregroundLayers.find((layer) => layer.id === "layer.mehana.waiter_idle");

  assert.equal(scene.playerMode, "seated");
  assert.deepEqual(scene.playerStart, scene.anchors.baiMitkoSeat);
  assert.equal(scene.interactables.some((target) => target.id === "hotspot.mehana.table"), true);
  assert.equal(waiter.dialogueId, "dialogue.mehana_waiter");
  assert.equal(waiterLayer.asset, "mehanaWaiterIdle");
  assert.equal(waiterLayer.height, 265);
  assert.equal(waiterLayer.left, 727);
  assert.equal(waiterLayer.top, 222);
  const counter = scene.foregroundLayers.find(layer => layer.id === "layer.mehana.counter_front");
  assert.ok(counter.zIndex < waiterLayer.zIndex, "counter must occlude waiter lower body");
  assert.equal(scene.npcs.some((npc) => npc.id === "npc.tony_fridge"), true);
});

test("Mehana sideboard props, larger furniture, and moved cellar align with the revised painted scene", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.mehana");
  const oil = scene.interactables.find((target) => target.id === "hotspot.mehana.oil");
  const water = scene.interactables.find((target) => target.id === "hotspot.mehana.water_jug");
  const oilLayer = scene.foregroundLayers.find((layer) => layer.id === "layer.mehana.kaliakra_oil");
  const waterLayer = scene.foregroundLayers.find((layer) => layer.id === "layer.mehana.water_jug");
  const leftTableLayer = scene.foregroundLayers.find((layer) => layer.id === "layer.mehana.table_group_left");
  const rightTableLayer = scene.foregroundLayers.find((layer) => layer.id === "layer.mehana.table_group_right");
  const tonyLayer = scene.foregroundLayers.find((layer) => layer.id === "layer.mehana.tony_fridge_seated");
  const newspaperLayer = scene.foregroundLayers.find((layer) => layer.id === "layer.mehana.newspaper_left_table");
  const cellar = scene.interactables.find((target) => target.id === "hotspot.mehana.cellar_hatch");

  assert.equal(pointInPolygon({ x: 1045, y: 310 }, oil.polygon), true);
  assert.equal(pointInPolygon({ x: 1100, y: 320 }, water.polygon), true);
  assert.equal(pointInPolygon({ x: 575, y: 440 }, oil.polygon), false);
  assert.equal(pointInPolygon({ x: 950, y: 650 }, cellar.polygon), true);
  assert.equal(pointInPolygon({ x: 1160, y: 520 }, cellar.polygon), false);
  assert.equal(oilLayer.hiddenWhenState, "hasSunflowerOil");
  assert.equal(waterLayer.hiddenWhenState, "hasGlassOfWater");
  assert.deepEqual([leftTableLayer.left, leftTableLayer.top], [0, 0]);
  assert.equal(leftTableLayer.width, undefined);
  assert.deepEqual([rightTableLayer.left, rightTableLayer.top], [0, 0]);
  assert.equal(rightTableLayer.width, undefined);
  assert.ok(rightTableLayer.zIndex < tonyLayer.zIndex, "table must occlude seated Tony");
  assert.equal(tonyLayer.height, 320);
  assert.equal(tonyLayer.top, 296);
  assert.deepEqual(tonyLayer.animation, {
    asset: "tonyFridgeIdleSeated",
    frameWidth: 384,
    frameHeight: 384,
    frameCount: 25,
    columns: 5,
    frameDurationMs: 198,
    loop: true,
    contentBounds: { x: 116, y: 91, w: 152, h: 198 }
  });
  assert.equal(assetManifest.scenes[scene.id].tonyFridgeIdleSeated, "assets/chapter1/characters/tony_fridge/idle-seated-v1.webp");
  assert.equal(newspaperLayer.asset, "todayNewspaper");
  assert.equal(scene.interactables.find((target) => target.id === "hotspot.mehana.newspaper").lookKey, "look.mehana.newspaper");
  assert.equal(scene.interactables.find((target) => target.id === "hotspot.mehana.radio").lookKey, "look.mehana.radio");
  assert.ok(sceneScale(scene, scene.playerStart) > 1.3);
  assert.ok(sceneScale(scene, scene.playerStart) < 1.4);
});

test("animated scene layers use exported timing, atlas coordinates, and a static fallback", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.mehana");
  const layer = scene.foregroundLayers.find((candidate) => candidate.id === "layer.mehana.tony_fridge_seated");
  assert.equal(sceneLayerAnimationFrame(layer.animation, 0), 0);
  assert.equal(sceneLayerAnimationFrame(layer.animation, 198), 1);
  assert.equal(sceneLayerAnimationFrame(layer.animation, 4950), 0);
  assert.deepEqual(sceneLayerAnimationSourceRect(layer.animation, 0), { x: 116, y: 91, w: 152, h: 198 });
  assert.deepEqual(sceneLayerAnimationSourceRect(layer.animation, 6), { x: 500, y: 475, w: 152, h: 198 });
  assert.deepEqual(sceneLayerAnimationSourceRect(layer.animation, 24), { x: 1652, y: 1627, w: 152, h: 198 });

  const calls = [];
  const animationImage = { id: "animation" };
  const fallbackImage = { id: "fallback", naturalWidth: 914, naturalHeight: 1166 };
  const loaded = new Set([animationImage]);
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx: { drawImage: (...args) => calls.push(args) },
    game: {
      lastTime: 198,
      assets: {
        getSceneImage: (_sceneId, asset) => asset === layer.animation.asset ? animationImage : fallbackImage,
        isLoaded: (image) => loaded.has(image)
      }
    }
  });
  renderer.drawSceneRasterLayer(scene, layer);
  assert.deepEqual(calls[0].slice(0, 8), [animationImage, 500, 91, 152, 198, 877, 296, 152 * (320 / 198)]);
  assert.equal(calls[0][8], 320);

  calls.length = 0;
  loaded.clear();
  loaded.add(fallbackImage);
  renderer.drawSceneRasterLayer(scene, layer);
  assert.deepEqual(calls[0], [fallbackImage, 877, 296, 914 * (320 / 1166), 320]);
});

test("Bai Mitko keeps his calibrated entrance height in the apartment and Mehana", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const apartment = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.apartment");
  const mehana = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.mehana");
  const apartmentHeight = characterHeight(definition, apartment, apartment.playerStart);
  const mehanaHeight = characterHeight(definition, mehana, mehana.playerStart);

  assert.ok(Math.abs(apartmentHeight - mehanaHeight) < 0.1);
});

test("municipality starts Bai Mitko five percent below foreground size and shrinks him at the counter", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const definition = characterDefinitions["npc.bai_mitko"];
  const entranceHeight = characterHeight(definition, scene, scene.playerStart);
  const counterHeight = characterHeight(definition, scene, scene.anchors.clerkCounter);
  const registerHeight = characterHeight(definition, scene, scene.anchors.candidateRegister);

  assert.ok(Math.abs(entranceHeight - 386 * 0.95) < 0.01);
  assert.equal(counterHeight, 225.75);
  assert.equal(registerHeight, 225.75);
  assert.ok(counterHeight / 105 >= 2.1 && counterHeight / 105 <= 2.2);
});

test("the route to Penka keeps the municipality opening size throughout the outlined foreground", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const definition = characterDefinitions["npc.bai_mitko"];
  const penka = scene.npcs.find((npc) => npc.id === "npc.municipality_clerk");
  const square = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const entry = square.exits.find((exit) => exit.id === "exit.square.to_municipality").targetPosition;
  const path = findWalkPath(scene, entry, penka.interactionApproach);
  const openingHeight = characterHeight(definition, scene, entry);

  assert.deepEqual(penka.interactionApproach, { x: 850, y: 690 });
  assert.ok(Math.max(...path.map((point) => point.y)) >= 690);
  assert.ok(Math.abs(openingHeight - 386 * 0.95) < 0.01);
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 5));
    for (let step = 1; step <= steps; step += 1) {
      const position = {
        x: start.x + ((end.x - start.x) * step) / steps,
        y: start.y + ((end.y - start.y) * step) / steps
      };
      const height = characterHeight(definition, scene, position);
      assert.ok(Math.abs(height - openingHeight) < 0.01);
    }
  }
});

test("municipality outlined foreground positions keep Bai Mitko at the opening size", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const definition = characterDefinitions["npc.bai_mitko"];
  const foregroundPositions = [
    { x: 300, y: 560 },
    { x: 600, y: 650 },
    { x: 850, y: 690 },
    { x: 1141, y: 670 },
    { x: 1170, y: 630 }
  ];
  const openingHeight = 386 * 0.95;

  for (const position of foregroundPositions) {
    assert.ok(Math.abs(characterHeight(definition, scene, position) - openingHeight) < 0.01);
  }
});

test("every walkable point in the municipality foreground band has one explicit Bai Mitko height", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const definition = characterDefinitions["npc.bai_mitko"];
  for (let y = 505; y <= 715; y += 5) {
    for (let x = 5; x <= 1275; x += 5) {
      if (!isWalkable(scene, { x, y })) continue;
      assert.equal(characterHeight(definition, scene, { x, y }), 366.7);
    }
  }
});

test("municipality foreground scale is independent from desk occlusion depth", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const desk = scene.foregroundLayers.find((layer) => layer.id === "layer.municipality.penka_desk");
  const position = { x: 850, y: 690 };

  assert.equal(sceneZIndexForPoint(scene, position), 0);
  assert.ok(desk.zIndex > sceneZIndexForPoint(scene, position));
});

test("the wall-leaning candidate register always renders behind Bai Mitko", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const register = scene.foregroundLayers.find((layer) => layer.id === "layer.municipality.candidate_register");

  assert.ok(register.zIndex > 100);
});

test("Penka's chair is a separate layer behind her approved desk", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const chair = scene.foregroundLayers.find((layer) => layer.id === "layer.municipality.penka_chair");
  const desk = scene.foregroundLayers.find((layer) => layer.id === "layer.municipality.penka_desk");

  assert.equal(chair.asset, "penkaChair");
  assert.ok(chair.zIndex > desk.zIndex);
});

test("Penka sits between her chair and desk in municipality depth order", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.municipality");
  const chair = scene.foregroundLayers.find((layer) => layer.id === "layer.municipality.penka_chair");
  const penka = scene.foregroundLayers.find((layer) => layer.id === "layer.municipality.penka_seated");
  const desk = scene.foregroundLayers.find((layer) => layer.id === "layer.municipality.penka_desk");

  assert.equal(penka.asset, "penkaSeated");
  assert.ok(chair.zIndex > penka.zIndex);
  assert.ok(penka.zIndex > desk.zIndex);
});

test("Mehana and municipality use authored raster, object, and layer editor sources", () => {
  for (const sceneName of ["mehana", "municipality"]) {
    const sceneId = `scene.chapter1.${sceneName}`;
    const scene = chapter1.scenes.find((candidate) => candidate.id === sceneId);
    const walkSource = JSON.parse(readFileSync(`assets_src/chapter1/scenes/${sceneName}/walk-geometry-v1.json`, "utf8"));
    const objectSource = JSON.parse(readFileSync(`assets_src/chapter1/scenes/${sceneName}/object-geometry-v1.json`, "utf8"));
    const layerSource = JSON.parse(readFileSync(`assets_src/chapter1/scenes/${sceneName}/layers.json`, "utf8"));
    const runtimeObjectIds = [...scene.exits, ...scene.interactables, ...scene.npcs].map((entry) => entry.id).sort();

    assert.equal(walkSource.sceneId, sceneId);
    assert.equal(scene.walkMask.id, walkSource.id);
    assert.equal(scene.walkMask.rows.length, walkSource.raster.height);
    assert.ok(scene.walkMask.rows.every((row) => row.length === walkSource.raster.width));
    assert.deepEqual(objectSource.objects.map((entry) => entry.id).sort(), runtimeObjectIds);
    assert.equal(layerSource.sceneId, sceneId);
    assert.ok(Array.isArray(scene.foregroundLayers));
  }
});

test("scene editor normalizes rectangle shorthand into visible, saveable polygons", () => {
  const source = normalizeEditorObjectSource({
    objects: [{ id: "hotspot.test", rect: { x: 10, y: 20, w: 30, h: 40 } }]
  });
  assert.deepEqual(source.objects[0].polygon, [
    { x: 10, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 60 },
    { x: 10, y: 60 }
  ]);
});

test("village square depth scaling shrinks Bai Mitko at the distant bench without changing foreground size", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const definition = characterDefinitions["npc.bai_mitko"];
  const benchHeight = characterHeight(definition, scene, scene.anchors.babaBench);
  const foregroundHeight = characterHeight(definition, scene, { x: 640, y: scene.perspectiveScale.bottomY });
  assert.ok(benchHeight >= 150 && benchHeight <= 155);
  assert.equal(foregroundHeight, 300);
  assert.equal(sceneScale(scene, { x: 640, y: scene.perspectiveScale.horizonY }), 0.4);
  assert.equal(sceneScale(scene, { x: 640, y: scene.perspectiveScale.bottomY }), 1.1);
});

test("apartment perspective scale is continuous across raster mask rows", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const before = sceneScale(scene, { x: 650, y: 491 });
  const after = sceneScale(scene, { x: 650, y: 493 });
  assert.ok(after > before);
  assert.ok(after - before < 0.01);
  const farHeight = characterHeight(characterDefinitions["npc.bai_mitko"], scene, { x: 650, y: 430 });
  const nearHeight = characterHeight(characterDefinitions["npc.bai_mitko"], scene, { x: 650, y: 600 });
  assert.ok(nearHeight > farHeight);
});

test("walk mask line sampler finds the nearest direct approach before a blocked target", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const approach = nearestWalkablePointOnLine(scene, { x: 650, y: 520 }, { x: 690, y: 250 });
  assert.ok(approach);
  assert.equal(isWalkable(scene, approach), true);
  assert.equal(Math.round(approach.x), 650);
  assert.equal(Math.round(approach.y), 520);
});

test("walk mask nearest sampler finds an approach near blocked clicks", () => {
  const scene = {
    walkMask: {
      width: 5,
      height: 5,
      worldWidth: 100,
      worldHeight: 100,
      rows: [
        ".....",
        ".....",
        "..c..",
        ".....",
        "....."
      ],
      legend: { ".": { walkable: false }, c: { walkable: true } }
    }
  };
  const approach = nearestWalkablePoint(scene, { x: 90, y: 90 });
  assert.deepEqual(approach, { x: 50, y: 50 });
});

test("raster walk path routes through mask corridors", () => {
  const scene = {
    walkMask: {
      width: 5,
      height: 5,
      worldWidth: 100,
      worldHeight: 100,
      legend: {
        ".": { walkable: false },
        "c": { walkable: true }
      },
      rows: [
        "ccccc",
        "c...c",
        "ccc.c",
        "c...c",
        "ccccc"
      ]
    }
  };
  const path = findWalkPath(scene, { x: 10, y: 10 }, { x: 90, y: 90 });
  assert.ok(path.length > 2);
  assert.deepEqual(path[0], { x: 10, y: 10 });
  assert.deepEqual(path.at(-1), { x: 90, y: 90 });
  assert.ok(walkPathDistance({ x: 10, y: 10 }, path) > distance({ x: 10, y: 10 }, { x: 90, y: 90 }));
  assert.equal(path.every((point) => isWalkable(scene, point)), true);
});

test("blocked empty clicks project to nearest reachable walk-mask cell", () => {
  const scene = {
    walkMask: {
      width: 5,
      height: 5,
      worldWidth: 100,
      worldHeight: 100,
      rows: [
        ".....",
        ".ccc.",
        "...c.",
        "...c.",
        "....."
      ],
      legend: { ".": { walkable: false }, c: { walkable: true } }
    }
  };
  const destination = nearestReachableWalkablePoint(scene, { x: 30, y: 30 }, { x: 92, y: 92 });
  assert.deepEqual(destination, { x: 70, y: 70 });
});

test("scene z index maps horizon to 100 and front to zero", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  assert.equal(sceneZIndexForPoint(scene, { x: 0, y: 430 }), 100);
  assert.equal(sceneZIndexForPoint(scene, { x: 0, y: 515 }), 50);
  assert.equal(sceneZIndexForPoint(scene, { x: 0, y: 600 }), 0);
});

test("chapter scene movement speeds are tuned for external walk animation", () => {
  const speeds = Object.fromEntries(chapter1.scenes.map((scene) => [scene.id, scene.movementSpeed]));
  assert.equal(speeds["scene.chapter1.apartment"], 70);
  assert.equal(speeds["scene.chapter1.village_square"], 80);
  assert.equal(speeds["scene.chapter1.mehana"], 75);
});

test("returning from the square places Bai Mitko on the apartment door rug", () => {
  const square = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.village_square");
  const apartment = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.apartment");
  const returnExit = square.exits.find((exit) => exit.id === "exit.square.to_apartment");

  assert.deepEqual(returnExit.targetPosition, apartment.anchors.baiMitkoSpawn);
});

test("runtime movement speed multiplier affects distance over time only", () => {
  const game = Object.create(Game.prototype);
  game.walkSpeedMultiplier = 1;
  assert.equal(game.sceneMovementSpeed({ movementSpeed: 70 }), 109.375);
});

test("rakia bands, color, and movement change progressively from zero to ten", () => {
  assert.equal(intoxicationBandKey(0), "daisy");
  assert.equal(intoxicationBandKey(1), "daisy");
  assert.equal(intoxicationBandKey(2), "merry");
  assert.equal(intoxicationBandKey(5), "tipsy");
  assert.equal(intoxicationBandKey(8), "plastered");
  assert.equal(intoxicationBandKey(10), "plastered");
  assert.equal(intoxicationColor(1), "rgb(218, 190, 82)");
  assert.equal(intoxicationColor(10), "rgb(211, 52, 48)");
  assert.ok(intoxicationMovementMultiplier(10) < intoxicationMovementMultiplier(5));
  assert.ok(intoxicationMovementMultiplier(5) < intoxicationMovementMultiplier(0));
});

test("one rakia glass clears for each five minutes of elapsed wall time", () => {
  const start = 1_000_000;
  const state = { rakiaGlasses: 6, rakiaLastChangedAt: start };
  assert.equal(applyTimedSobering(state, start + RAKIA_SOBER_INTERVAL_MS * 2 + 1000), 2);
  assert.equal(state.rakiaGlasses, 4);
  assert.equal(state.rakiaLastChangedAt, start + RAKIA_SOBER_INTERVAL_MS * 2);
  assert.equal(applyTimedSobering(state, start + RAKIA_SOBER_INTERVAL_MS * 6), 4);
  assert.equal(state.rakiaGlasses, 0);
  assert.equal(state.rakiaLastChangedAt, null);
});

test("save system merges old saves with current defaults", () => {
  const storage = new MemoryStorage({ test: JSON.stringify({ influence: 10 }) });
  const save = new SaveSystem(storage, "test").load();
  assert.equal(save.influence, 10);
  assert.equal(save.currentChapter, DEFAULT_SAVE.currentChapter);
  assert.deepEqual(save.inventory, DEFAULT_SAVE.inventory);
  assert.deepEqual(save.droppedItems, DEFAULT_SAVE.droppedItems);
});

test("fresh chapter start has no preloaded inventory items", () => {
  assert.deepEqual(DEFAULT_SAVE.inventory, []);
  assert.deepEqual(DEFAULT_SAVE.droppedItems, []);
  assert.equal(DEFAULT_SAVE.rakiaGlasses, 0);
  assert.equal(DEFAULT_SAVE.rakiaLastChangedAt, null);
  assert.equal(DEFAULT_SAVE.activeQuests.includes("quest.chapter1.baba_vote"), true);
});

test("save migration adds Baba's known vote quest without resurrecting completed work", () => {
  const oldStorage = new MemoryStorage({
    test: JSON.stringify({
      activeQuests: ["quest.chapter1.main", "quest.chapter1.tony_vote"],
      completedQuests: []
    })
  });
  const migrated = new SaveSystem(oldStorage, "test").load();
  assert.deepEqual(migrated.activeQuests, [
    "quest.chapter1.main",
    "quest.chapter1.tony_vote",
    "quest.chapter1.baba_vote"
  ]);

  const completedStorage = new MemoryStorage({
    test: JSON.stringify({
      activeQuests: ["quest.chapter1.main"],
      completedQuests: ["quest.chapter1.baba_vote"],
      babaStoyankaVote: true
    })
  });
  const completed = new SaveSystem(completedStorage, "test").load();
  assert.deepEqual(completed.activeQuests, ["quest.chapter1.main"]);
  assert.deepEqual(completed.completedQuests, ["quest.chapter1.baba_vote"]);
});

test("fresh chapter start exposes the authored initial campaign quests", () => {
  const save = new SaveSystem(new MemoryStorage(), "test").load();
  const initialQuests = [
    "quest.chapter1.main",
    "quest.chapter1.fake_diploma",
    "quest.chapter1.baba_vote",
    "quest.chapter1.tony_vote"
  ];
  assert.deepEqual(DEFAULT_SAVE.activeQuests, initialQuests);
  assert.deepEqual(save.activeQuests, initialQuests);
});

test("reset restores the authored fresh quest list", () => {
  const storage = new MemoryStorage({
    test: JSON.stringify({
      activeQuests: ["quest.chapter1.main", "quest.chapter1.fake_diploma", "quest.chapter1.tony_vote"]
    })
  });
  const save = new SaveSystem(storage, "test").reset();
  assert.deepEqual(save.activeQuests, DEFAULT_SAVE.activeQuests);
  assert.equal(storage.getItem("test"), null);
});

test("chapter quest IDs remain stable", () => {
  assert.deepEqual(chapter1.quests.map((quest) => quest.id), [
    "quest.chapter1.main",
    "quest.chapter1.fake_diploma",
    "quest.chapter1.baba_vote",
    "quest.chapter1.tony_vote",
    "quest.chapter1.journalist",
    "quest.chapter1.ballot_box"
  ]);
});

test("save migration removes the old prototype starter inventory", () => {
  const storage = new MemoryStorage({
    test: JSON.stringify({ inventory: ["item.accordion", "item.unpaid_bills", "item.empty_envelope"] })
  });
  const save = new SaveSystem(storage, "test").load();
  assert.deepEqual(save.inventory, []);
});

test("save migration preserves a legitimately collected accordion", () => {
  const storage = new MemoryStorage({
    test: JSON.stringify({ inventory: ["item.accordion"] })
  });
  const save = new SaveSystem(storage, "test").load();
  assert.deepEqual(save.inventory, ["item.accordion"]);
});

test("Bai Mitko render height is canonical across idle and walk assets", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const definition = characterDefinitions["npc.bai_mitko"];
  const position = { x: 650, y: 520 };
  const idleHeight = characterHeight(definition, scene, position);
  const walkSouthHeight = characterHeight(definition, scene, position);
  const walkEastHeight = characterHeight(definition, scene, position);
  const walkNorthHeight = characterHeight(definition, scene, position);

  assert.ok(Math.abs(idleHeight - walkSouthHeight) < 2);
  assert.ok(Math.abs(idleHeight - walkEastHeight) < 2);
  assert.ok(Math.abs(idleHeight - walkNorthHeight) < 2);
});

test("Bai Mitko external renderer uses stable visual bounds across walk phases", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const bounds = stableExternalVisualBounds(definition);
  assert.equal(bounds.h, 442);
  assert.equal(bounds.w, 214);
  assert.equal(bounds.baselineY, 476);
});

test("Bai Mitko walk frames normalize their visible height instead of contracting", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const loop = definition.animations.walk.parts.east.loop;
  const stableBounds = stableExternalVisualBounds(definition);
  const targetHeight = 386 * 0.95;

  for (let frameIndex = 0; frameIndex < loop.frameCount; frameIndex += 1) {
    const bounds = externalFrameVisualBounds(loop, frameIndex, stableBounds);
    const scale = targetHeight / bounds.h;
    assert.ok(Math.abs(bounds.h * scale - targetHeight) < 0.01);
  }
});

test("authored actions can keep one visual scale while the silhouette changes", () => {
  const stableBounds = { x: 0, y: 0, w: 214, h: 442, baselineY: 476 };
  const frame = {
    stableVisualBounds: true,
    sourceFrameContentBounds: [
      { x: 10, y: 20, w: 150, h: 390 },
      { x: 8, y: 4, w: 170, h: 520 }
    ]
  };

  assert.equal(externalFrameVisualBounds(frame, 0, stableBounds), stableBounds);
  assert.equal(externalFrameVisualBounds(frame, 1, stableBounds), stableBounds);
});

test("Bai Mitko idle directions use walk-start animation frames instead of static images", () => {
  const idle = characterDefinitions["npc.bai_mitko"].animations.idle.directions;
  const baiMitkoAssets = assetManifest.characters["npc.bai_mitko"];
  assert.equal(idle.east.slot, "external_walk_east_start");
  assert.equal(idle.south.slot, "external_walk_east_start");
  assert.equal(idle.north.slot, "external_walk_east_start");
  assert.equal(idle.west.slot, "external_walk_east_start");
  assert.equal(idle.west.mirrored, true);
  assert.equal(baiMitkoAssets.type, "externalAnimation");
  assert.equal(Object.values(baiMitkoAssets).some((value) => typeof value === "string" && value.startsWith("assets/")), false);
});

test("Bai Mitko external idle variants are generated for east and mirrored west", () => {
  const east = externalAnimationV1.idleVariants.east;
  const west = externalAnimationV1.idleVariants.west;
  assert.equal(east.length, 6);
  assert.equal(west.length, 6);
  assert.deepEqual(
    east.map((variant) => variant.slot),
    [
      "external_idle_east_1",
      "external_idle_east_2",
      "external_idle_east_3",
      "external_idle_east_4",
      "external_idle_east_5",
      "external_idle_east_6"
    ]
  );
  assert.deepEqual(
    east.map((variant) => variant.pingPong),
    [false, false, false, false, false, false]
  );
  assert.equal(east[0].role, "idle");
  assert.equal(east[0].loop, false);
  assert.equal(east[0].fps, 14);
  assert.equal(east[0].frameCount, 25);
  assert.equal(east[1].frameCount, 36);
  assert.equal(east[2].frameCount, 36);
  assert.equal(east[3].frameCount, 36);
  assert.equal(east[4].frameCount, 36);
  assert.equal(east[5].frameCount, 36);
  assert.equal(west[0].slot, "external_idle_east_1");
  assert.equal(west[0].mirrored, true);
  assert.equal(west[2].pingPong, false);
});

test("Bai Mitko external talk and reject animations are generated for east and mirrored west", () => {
  assert.deepEqual(
    externalAnimationV1.talkAnimations.east.singleWord.map((variant) => variant.slot),
    ["external_talk_east_short_1"]
  );
  assert.deepEqual(
    externalAnimationV1.talkAnimations.east.singleShortSentence.map((variant) => variant.slot),
    ["external_talk_east_long_2"]
  );
  assert.deepEqual(
    externalAnimationV1.talkAnimations.east.singleLongSentence.map((variant) => variant.slot),
    ["external_talk_east_long_1"]
  );
  assert.deepEqual(
    [
      externalAnimationV1.talkAnimations.east.singleWord[0].fps,
      externalAnimationV1.talkAnimations.east.singleShortSentence[0].fps,
      externalAnimationV1.talkAnimations.east.singleLongSentence[0].fps
    ],
    [12, 12, 12]
  );
  assert.equal(externalAnimationV1.talkAnimations.east.singleWord[0].talkSemantic, "single_word");
  assert.equal(externalAnimationV1.talkAnimations.east.singleShortSentence[0].talkSemantic, "single_short_sentence");
  assert.equal(externalAnimationV1.talkAnimations.east.singleLongSentence[0].talkSemantic, "single_long_sentence");
  assert.equal(externalAnimationV1.talkAnimations.west.singleWord[0].mirrored, true);
  assert.equal(externalAnimationV1.rejectAnimations.east[0].slot, "external_reject_east_1");
  assert.equal(externalAnimationV1.rejectAnimations.west[0].mirrored, true);
});

test("Bai Mitko external take action is generated for east and mirrored west", () => {
  assert.equal(externalAnimationV1.actionAnimations.east.take[0].slot, "external_take_east_forward_default");
  assert.equal(externalAnimationV1.actionAnimations.east.take[0].role, "action");
  assert.equal(externalAnimationV1.actionAnimations.east.take[0].fps, 12);
  assert.deepEqual(externalAnimationV1.actionAnimations.east.take[0].movementSpeedMultipliers, Array(16).fill(0));
  assert.equal(externalAnimationV1.actionAnimations.west.take[0].slot, "external_take_east_forward_default");
  assert.equal(externalAnimationV1.actionAnimations.west.take[0].mirrored, true);
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].slot, "external_opens_window");
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].role, "action");
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].fps, 12);
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].stableVisualBounds, true);
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].flipX, undefined);
  assert.deepEqual(externalAnimationV1.actionAnimations.east.opensWindow[0].movementSpeedMultipliers, Array(10).fill(0));
  assert.equal(externalAnimationV1.actionAnimations.west.opensWindow[0].slot, "external_opens_window");
  assert.equal(externalAnimationV1.actionAnimations.west.opensWindow[0].mirrored, true);
  assert.equal(externalAnimationV1.actionAnimations.west.opensWindow[0].flipX, false);
});

test("apartment bills define a take action sequence with approach, facing, animation, and effect", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const bills = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.unpaid_bills");
  assert.equal(bills.takeItemId, "item.unpaid_bills");
  assert.equal(bills.hiddenWhenItemOwned, "item.unpaid_bills");
  assert.equal(bills.flagOnTake, "hasUnpaidBills");
  assert.deepEqual(bills.actions.take.approach, { x: 390, y: 570 });
  assert.equal(bills.actions.take.requireExactApproach, true);
  assert.equal(bills.actions.take.facing, "west");
  assert.equal(bills.actions.take.animation, "take");
  assert.equal(bills.actions.take.effectFrame, 8);
  assert.equal(bills.actions.take.messageKey, "msg.apartment.unpaid_bills_taken");
});

test("apartment accordion is collectible through the generic take flow", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const accordion = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.accordion");
  const game = Object.create(Game.prototype);
  const owned = new Set();
  let saves = 0;
  game.inventory = {
    has: (itemId) => owned.has(itemId),
    add: (itemId) => owned.add(itemId)
  };
  game.state = {};
  game.t = (key) => key;
  game.setStatusMessage = () => {};
  game.save = () => { saves += 1; };

  assert.equal(accordion.takeItemId, "item.accordion");
  assert.equal(accordion.hiddenWhenItemOwned, "item.accordion");
  assert.equal(game.targetAvailable(accordion), true);
  game.takeTarget(accordion);
  assert.equal(owned.has("item.accordion"), true);
  assert.equal(game.state.hasAccordion, true);
  assert.equal(game.targetAvailable(accordion), false);
  assert.equal(saves, 1);
  game.takeTarget(accordion);
  assert.equal(owned.size, 1);
  assert.equal(saves, 1);
});

test("apartment window uses separate state-aware hotspots for opening and closing", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const closedWindow = scene.interactables.find((candidate) => candidate.id === "window");
  const openWindow = scene.interactables.find((candidate) => candidate.id === "window.open");
  assert.equal(closedWindow.nameKey, "hotspot.window.name");
  assert.equal(openWindow.nameKey, "hotspot.window.name");
  assert.deepEqual(closedWindow.requirements, { notFlags: ["apartmentWindowOpen"] });
  assert.deepEqual(openWindow.requirements, { flags: ["apartmentWindowOpen"] });
  assert.deepEqual(openWindow.rect, { x: 340, y: 50, w: 125, h: 340 });
  assert.equal(closedWindow.lookKey, "look.apartment.window.closed");
  assert.equal(openWindow.lookKey, "look.apartment.window.open");
  const open = closedWindow.actions.use;
  const close = openWindow.actions.use;
  for (const action of [open, close]) {
    assert.equal(action.requireExactApproach, true);
    assert.equal(action.facing, "west");
    assert.equal(action.animation, "opensWindow");
    assert.equal(action.holdFinalFrame, false);
  }
  assert.deepEqual(open.approachCell, { x: 16, y: 23 });
  assert.deepEqual(close.approachCell, { x: 24, y: 25 });
  assert.equal(close.reverseAnimation, true);
  assert.deepEqual(close.effectsOnComplete, [{ type: "setFlag", key: "apartmentWindowOpen", value: false }]);
  assert.equal(close.messageKey, "msg.apartment.window_closed");
  assert.equal(open.reverseAnimation, undefined);
  assert.deepEqual(open.effectsOnComplete, [{ type: "setFlag", key: "apartmentWindowOpen", value: true }]);
  assert.equal(open.messageKey, "msg.apartment.window_opened");
});

test("only the visible apartment window state receives pointer hits", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const game = Object.create(Game.prototype);
  game.state = { flags: {} };
  game.inventory = { has: () => false };
  game.quests = {};
  const available = (target) => game.targetAvailable(target);

  assert.equal(findTargetAt(scene, { x: 200, y: 200 }, available)?.id, "window");
  assert.notEqual(findTargetAt(scene, { x: 430, y: 200 }, available)?.id, "window.open");
  game.state.flags.apartmentWindowOpen = true;
  assert.notEqual(findTargetAt(scene, { x: 200, y: 200 }, available)?.id, "window");
  assert.equal(findTargetAt(scene, { x: 430, y: 200 }, available)?.id, "window.open");
});

test("stateful scene layers stay hidden until their save flag is set", () => {
  const renderer = Object.create(Renderer.prototype);
  const layer = { visibleWhenFlag: "apartmentWindowOpen" };
  renderer.game = { state: { flags: {} } };
  assert.equal(renderer.sceneLayerVisible(layer), false);
  renderer.game.state.flags.apartmentWindowOpen = true;
  assert.equal(renderer.sceneLayerVisible(layer), true);
  assert.equal(renderer.sceneLayerVisible({}), true);
});

test("collected scene layers stay hidden after their inventory item is consumed", () => {
  const renderer = Object.create(Renderer.prototype);
  renderer.game = {
    state: { hasUnpaidBills: true, flags: {} },
    inventory: { has: () => false }
  };

  assert.equal(renderer.sceneLayerVisible({ hiddenWhenState: "hasUnpaidBills" }), false);
  renderer.game.state.hasUnpaidBills = false;
  assert.equal(renderer.sceneLayerVisible({ hiddenWhenState: "hasUnpaidBills" }), true);
});

test("the pointer gesture that opens a dialogue cannot also choose its first option", () => {
  const game = Object.create(Game.prototype);
  let choices = 0;
  let renders = 0;
  game.dialogueChoicePointerLock = 7;
  game.dialogue = { choose: () => { choices += 1; } };
  game.renderUi = () => { renders += 1; };

  assert.equal(game.chooseDialogueChoice({}, { detail: 1 }), false);
  assert.equal(choices, 0);
  assert.equal(renders, 0);

  game.dialogueChoicePointerLock = null;
  assert.equal(game.chooseDialogueChoice({}, { detail: 1 }), true);
  assert.equal(choices, 1);
  assert.equal(renders, 1);
});

test("scene raster layers support calibrated height while preserving image aspect ratio", () => {
  const renderer = Object.create(Renderer.prototype);
  const rect = renderer.sceneLayerRect(
    { left: 315, top: 299, height: 153 },
    { naturalWidth: 101, naturalHeight: 165 }
  );
  assert.equal(rect.x, 315);
  assert.equal(rect.y, 299);
  assert.equal(rect.h, 153);
  assert.equal(rect.w, 101 * (153 / 165));
});

test("trimmed scene raster layers render at their natural size", () => {
  const renderer = Object.create(Renderer.prototype);
  const rect = renderer.sceneLayerRect(
    { left: 104, top: 389 },
    { naturalWidth: 375, naturalHeight: 273 }
  );
  assert.deepEqual(rect, { x: 104, y: 389, w: 375, h: 273, width: 375, height: 273 });
});

test("Baba's seated layer is twenty percent smaller than Bai Mitko at the bus-stop bench depth", () => {
  const square = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.village_square");
  const babaLayer = square.foregroundLayers.find((layer) => layer.id === "layer.square.baba_stoyanka_seated");
  const mitkoHeight = characterHeight(characterDefinitions["npc.bai_mitko"], square, square.anchors.babaBench);
  assert.equal(babaLayer.height, Math.round(mitkoHeight * 0.8));
});

test("collectible scene layers hide as soon as their item is owned", () => {
  const renderer = Object.create(Renderer.prototype);
  const owned = new Set();
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const layer = scene.foregroundLayers.find((candidate) => candidate.id === "layer.apartment.accordion_on_chair");
  renderer.game = { state: { flags: {} }, inventory: { has: (itemId) => owned.has(itemId) } };
  assert.equal(renderer.sceneLayerVisible(layer), true);
  owned.add("item.accordion");
  assert.equal(renderer.sceneLayerVisible(layer), false);
});

test("a saved accordion keeps its Apartment layer and hotspot unavailable after load", () => {
  const storage = new MemoryStorage({ test: JSON.stringify({ inventory: ["item.accordion"] }) });
  const state = new SaveSystem(storage, "test").load();
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const layer = scene.foregroundLayers.find((candidate) => candidate.id === "layer.apartment.accordion_on_chair");
  const accordion = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.accordion");
  const renderer = Object.create(Renderer.prototype);
  const game = Object.create(Game.prototype);
  const inventory = { has: (itemId) => state.inventory.includes(itemId) };
  renderer.game = { state, inventory };
  game.inventory = inventory;
  assert.equal(renderer.sceneLayerVisible(layer), false);
  assert.equal(game.targetAvailable(accordion), false);
});

test("action-timed scene layers appear on their configured animation frame only", () => {
  const renderer = Object.create(Renderer.prototype);
  const layer = { visibleDuringAction: { actionName: "opensWindow", fromFrame: 10 } };
  renderer.game = {
    state: { flags: {} },
    player: { animation: "action", actionAnimation: { actionName: "opensWindow" }, animator: { frameIndex: 9 } }
  };
  assert.equal(renderer.sceneLayerVisible(layer), false);
  renderer.game.player.animator.frameIndex = 10;
  assert.equal(renderer.sceneLayerVisible(layer), true);
  renderer.game.player.animation = "idle";
  assert.equal(renderer.sceneLayerVisible(layer), false);
});

test("action completion reveals and persists its stateful scene layer flag", () => {
  const game = Object.create(Game.prototype);
  let saves = 0;
  let heldFrames = 0;
  game.player = { actionAnimation: { frameCount: 16 }, actionSequence: {}, animation: "action" };
  game.state = { flags: {} };
  game.save = () => { saves += 1; };
  game.setIdleHoldFrame = () => { heldFrames += 1; };
  game.setStatusMessage = () => {};
  game.completeInteractionActionSequence({
    target: { id: "window" },
    verb: VERBS.LOOK,
    sequence: { flagOnComplete: "apartmentWindowOpen", holdFinalFrame: false },
    frame: { frameCount: 16 }
  });
  assert.equal(game.player.animation, "idle");
  assert.equal(game.state.flags.apartmentWindowOpen, true);
  assert.equal(saves, 1);
  assert.equal(heldFrames, 0);
});

test("action completion applies declarative effects that can clear a scene-layer flag", () => {
  const game = Object.create(Game.prototype);
  let saves = 0;
  game.player = { actionAnimation: { frameCount: 16 }, actionSequence: {}, animation: "action" };
  game.state = { flags: { apartmentWindowOpen: true } };
  game.inventory = { has: () => false };
  game.quests = {};
  game.save = () => { saves += 1; };
  game.setIdleHoldFrame = () => {};
  game.setStatusMessage = () => {};
  game.completeInteractionActionSequence({
    target: { id: "window" },
    verb: VERBS.USE,
    sequence: {
      effectsOnComplete: [{ type: "setFlag", key: "apartmentWindowOpen", value: false }],
      holdFinalFrame: false
    },
    frame: { frameCount: 16 }
  });
  assert.equal(game.state.flags.apartmentWindowOpen, false);
  assert.equal(saves, 1);
});

test("reverse action frames render from the end of the same sprite sheet", () => {
  assert.equal(animationRenderFrameIndex({ frameCount: 10 }, 0), 0);
  assert.equal(animationRenderFrameIndex({ frameCount: 10, reverseFrames: true }, 0), 9);
  assert.equal(animationRenderFrameIndex({ frameCount: 10, reverseFrames: true }, 9), 0);
});

test("take action applies inventory and layer state on its configured contact frame", () => {
  const game = Object.create(Game.prototype);
  const owned = new Set();
  let saves = 0;
  const actionSequence = {
    target: { takeItemId: "item.unpaid_bills", flagOnTake: "hasUnpaidBills" },
    verb: VERBS.TAKE,
    sequence: { effectFrame: 8 }
  };
  game.inventory = {
    has: (itemId) => owned.has(itemId),
    add: (itemId) => owned.add(itemId)
  };
  game.state = {};
  game.save = () => { saves += 1; };
  game.player = {
    animation: "action",
    actionSequence,
    animator: { frameIndex: 7, isFinished: () => false }
  };

  game.updateActionSequence();
  assert.equal(owned.has("item.unpaid_bills"), false);
  game.player.animator.frameIndex = 8;
  game.updateActionSequence();
  assert.equal(owned.has("item.unpaid_bills"), true);
  assert.equal(game.state.hasUnpaidBills, true);
  assert.equal(saves, 1);
  game.updateActionSequence();
  assert.equal(saves, 1);
});

test("action sequence approach cells resolve to walk-mask world coordinates", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  assert.deepEqual(game.actionSequenceApproachPoint({ approachCell: { x: 16, y: 23 } }), { x: 330, y: 470 });
});

test("idle variants trigger after irregular idle delay and finish back to hold", () => {
  const player = {
    animation: "idle",
    target: null,
    speaking: false,
    facing: "east",
    idleVariant: null,
    idleVariantQueue: [],
    idleHoldFrame: null,
    idleVariantTimer: 0,
    animator: {
      isFinished() {
        return false;
      }
    }
  };
  const game = Object.create(Game.prototype);
  game.player = player;
  game.characterVariant = "external_animation_v1";
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    game.updateIdleVariants(1);
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(
    [
      "external_idle_east_1",
      "external_idle_east_2",
      "external_idle_east_3",
      "external_idle_east_4",
      "external_idle_east_5",
      "external_idle_east_6"
    ].includes(
      player.idleVariant.slot
    )
  );

  player.animator = {
    isFinished() {
      return true;
    }
  };
  Math.random = () => 0.99;
  try {
    game.updateIdleVariants(1 / 60);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(player.idleVariant, null);
  assert.ok(player.idleHoldFrame);
  assert.equal(player.idleHoldFrame.frameIndex, player.idleHoldFrame.frame.frameCount - 1);
  assert.ok(player.idleVariantTimer >= 1);
  assert.ok(player.idleVariantTimer <= 3);
});

test("idle variants can chain into idle five as a calm follow-up", () => {
  const variants = externalAnimationV1.idleVariants.east;
  const player = {
    animation: "idle",
    target: null,
    speaking: false,
    facing: "east",
    idleVariant: null,
    idleVariantQueue: [],
    idleHoldFrame: null,
    idleVariantTimer: 0,
    animator: {
      isFinished() {
        return false;
      }
    }
  };
  const game = Object.create(Game.prototype);
  game.player = player;
  game.characterVariant = "external_animation_v1";

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    game.updateIdleVariants(1);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(player.idleVariant.slot, variants[0].slot);
  assert.equal(player.idleVariantQueue.length, 1);
  assert.equal(player.idleVariantQueue[0].slot, "external_idle_east_5");

  player.animator = {
    isFinished() {
      return true;
    }
  };
  game.updateIdleVariants(1 / 60);
  assert.equal(player.idleVariant.slot, "external_idle_east_5");
  assert.equal(player.idleVariantQueue.length, 0);
});

test("character cutouts use the shared 15 percent source margin", () => {
  assert.equal(CHARACTER_SOURCE_SCALE, 0.6);
  assert.equal(CHARACTER_CUTOUT_MARGIN_RATIO, 0.15);
});

test("east movement exposes start loop short stop walk parts without mirroring metadata", () => {
  const player = { facing: "south", verticalDirectionBias: 1.6 };
  assert.equal(facingFromDelta(100, 0, player), "east");

  const east = characterDefinitions["npc.bai_mitko"].animations.walk.parts.east;
  assert.equal(east.start.slot, "external_walk_east_start");
  assert.equal(east.loop.slot, "external_walk_east_loop");
  assert.equal(east.short.slot, "external_walk_east_short");
  assert.equal(east.stop.slot, "external_walk_east_stop");
  assert.equal(east.start.frameCount, 16);
  assert.equal(east.loop.frameCount, 16);
  assert.equal(east.short.frameCount, 16);
  assert.equal(east.stop.frameCount, 14);
  assert.equal(east.start.initialFrame, 1);
  assert.equal(east.loop.initialFrame, 1);
  assert.equal(east.short.initialFrame, 1);
  assert.equal(east.stop.initialFrame, 1);
  assert.equal(east.start.fps, 20);
  assert.equal(east.loop.fps, 20);
  assert.equal(east.short.fps, 20);
  assert.equal(east.stop.fps, 20);
  assert.equal(east.start.sourceFrameRects[0].sourceFrameIndex, 0);
  assert.equal(east.loop.stopExitFrame, 0);
  assert.equal(east.start.loop, false);
  assert.equal(east.loop.loop, true);
  assert.equal(east.short.loop, true);
  assert.equal(east.stop.loop, false);
  assert.deepEqual(east.start.movementSpeedMultipliers, [0, 0, 0, 0, 0, 0.6, 0.7, 0.3, 0.4, 0.8, 1, 1, 0.7, 0.6, 0.5, 0.4]);
  assert.deepEqual(east.short.movementSpeedMultipliers, east.loop.movementSpeedMultipliers);
  assert.equal(Boolean(east.loop.mirrored), false);
});

test("west movement mirrors the external east start loop short stop parts", () => {
  const player = { facing: "south", verticalDirectionBias: 1.6 };
  assert.equal(facingFromDelta(-100, 0, player), "west");

  const west = characterDefinitions["npc.bai_mitko"].animations.walk.parts.west;
  assert.equal(west.start.slot, "external_walk_east_start");
  assert.equal(west.loop.slot, "external_walk_east_loop");
  assert.equal(west.short.slot, "external_walk_east_short");
  assert.equal(west.stop.slot, "external_walk_east_stop");
  assert.equal(west.start.mirrored, true);
  assert.equal(west.loop.mirrored, true);
  assert.equal(west.short.mirrored, true);
  assert.equal(west.stop.mirrored, true);
  assert.equal(west.loop.mirrorSource, "east");
});

test("east-only external walk maps diagonal east-west facings to active strips", () => {
  assert.equal(eastWestFallbackFacing("east"), "east");
  assert.equal(eastWestFallbackFacing("south_east"), "east");
  assert.equal(eastWestFallbackFacing("north_east"), "east");
  assert.equal(eastWestFallbackFacing("west"), "west");
  assert.equal(eastWestFallbackFacing("south_west"), "west");
  assert.equal(eastWestFallbackFacing("north_west"), "west");
  assert.equal(eastWestFallbackFacing("south"), null);
  assert.equal(eastWestFallbackFacing("north"), null);
});

test("east-west-only walk parts constrain movement facing to animated strips", () => {
  const player = {
    facing: "west",
    verticalDirectionBias: 1.6,
    walkPartsByFacing: {
      east: { loop: {} },
      west: { loop: {} }
    }
  };
  assert.equal(facingFromDelta(40, 120, player), "east");
  assert.equal(facingFromDelta(-40, 120, player), "west");
  assert.equal(facingFromDelta(0, 120, player), "west");
});

test("external walk start ramps slowly and loop uses foot-push pulses", () => {
  const start = externalWalkMotionCurve("start", 9);
  assert.deepEqual(start.slice(0, 3), [0, 0, 0]);
  assert.ok(start[3] < 0.5);
  assert.ok(start[4] < start.at(-1));
  assert.ok(start[7] - start[6] > start[5] - start[4]);
  assert.equal(start.at(-1), EXTERNAL_WALK_LOOP_MOTION_MAX);

  const loop = externalWalkMotionCurve("loop", 16);
  const rawLoop = externalWalkRawMotionCurve("loop", 16);
  const rawMin = Math.min(...rawLoop);
  const rawMax = Math.max(...rawLoop);
  const expectedFrameTwo = Number((EXTERNAL_WALK_LOOP_MOTION_MIN + ((rawLoop[2] - rawMin) / (rawMax - rawMin)) * (EXTERNAL_WALK_LOOP_MOTION_MAX - EXTERNAL_WALK_LOOP_MOTION_MIN)).toFixed(3));
  assert.equal(loop[2], expectedFrameTwo);
  assert.ok(loop[2] > loop[6]);
  assert.ok(loop[10] > loop[14]);
  assert.equal(Math.min(...loop), EXTERNAL_WALK_LOOP_MOTION_MIN);
  assert.equal(Math.max(...loop), EXTERNAL_WALK_LOOP_MOTION_MAX);
  assert.ok(loop[2] - loop[6] < rawLoop[2] - rawLoop[6]);
});

test("walk motion multiplier preserves explicit zero values", () => {
  const player = {
    animation: "walk",
    facing: "east",
    walkPart: "start",
    animator: { frameIndex: 0 },
    walkMotionMultipliersByFacing: {
      east: {
        start: [0, 0.5, 1]
      }
    }
  };
  assert.equal(walkMotionMultiplierForFrame(player), 0);
  player.animator.frameIndex = 1;
  assert.equal(walkMotionMultiplierForFrame(player), 0.5);
  player.animator.frameIndex = 3;
  assert.equal(walkMotionMultiplierForFrame(player), 0);
  assert.equal(motionMultiplierAtFrame([0, undefined, 0.5], 1, 0), 0);
});

test("walk animation can play startup frames once before looping from configured frame", () => {
  const player = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "strip", frameCount: 28, fps: 17, loop: true }
    }
  });
  player.play("walk");
  player.frameCountOverride = 28;
  player.loopStartFrameOverride = 12;
  player.update(27 / 17);
  assert.equal(player.frameIndex, 27);
  player.update(1 / 17);
  assert.equal(player.frameIndex, 12);
});

test("phased strip animation advances frames in the game animation player", () => {
  const player = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "phasedStrip", frameCount: 9, fps: 8, loop: false }
    }
  });
  player.play("walk", "external_walk_east_start:east:start");
  player.frameCountOverride = 9;
  player.fpsOverride = 8;
  player.loopOverride = false;
  player.update(2 / 8);
  assert.equal(player.frameIndex, 2);
});

test("ping-pong strip animation plays forward then backward once", () => {
  const player = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "phasedStrip", frameCount: 4, fps: 4, loop: false }
    }
  });
  player.play("walk", "external_idle_east_3:east:idle");
  player.frameCountOverride = 4;
  player.fpsOverride = 4;
  player.loopOverride = false;
  player.pingPongOverride = true;
  assert.equal(player.frameIndex, 0);
  player.update(1 / 4);
  assert.equal(player.frameIndex, 1);
  player.update(1 / 4);
  assert.equal(player.frameIndex, 2);
  player.update(1 / 4);
  assert.equal(player.frameIndex, 3);
  player.update(1 / 4);
  assert.equal(player.frameIndex, 2);
  player.update(1 / 4);
  assert.equal(player.frameIndex, 1);
  assert.equal(player.isFinished(), false);
  player.update(1 / 4);
  assert.equal(player.frameIndex, 1);
  assert.equal(player.isFinished(), true);
});

test("playing the same stable animation key does not reset elapsed time", () => {
  const player = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "phasedStrip", frameCount: 16, fps: 8, loop: true }
    }
  });
  player.play("walk", "external_walk_east_loop:east:loop");
  player.update(3 / 8);
  assert.equal(player.frameIndex, 3);
  player.beginTick();
  player.play("walk", "external_walk_east_loop:east:loop");
  player.update(1 / 8);
  assert.equal(player.frameIndex, 4);
  assert.equal(player.resetThisTick, false);
});

test("walk animation frames advance linearly from configured frame one", () => {
  const player = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "phasedStrip", frameCount: 16, fps: 8, loop: true }
    }
  });
  player.frameCountOverride = 16;
  player.fpsOverride = 8;
  player.loopOverride = true;
  player.initialFrameOverride = 1;
  player.play("walk", "external_walk_east_loop:east:loop");
  assert.equal(player.frameIndex, 1);
  player.update(0.99 / 8);
  assert.equal(player.frameIndex, 1);
  player.update(0.01 / 8);
  assert.equal(player.frameIndex, 2);
  player.update(16 / 8);
  assert.equal(player.frameIndex, 2);
});

test("non-looping walk parts report finished for start and stop phases", () => {
  const player = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "strip", frameCount: 9, fps: 8, loop: false }
    }
  });
  player.play("walk");
  player.frameCountOverride = 9;
  player.fpsOverride = 8;
  player.loopOverride = false;
  player.update(7 / 8);
  assert.equal(player.isFinished(), false);
  player.update(1 / 8);
  assert.equal(player.isFinished(), true);
});

test("movement starts stop phase immediately without waiting for loop exit frame", () => {
  const animator = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "phasedStrip", frameCount: 4, fps: 4, loop: true }
    }
  });
  const player = {
    position: { x: 0, y: 0 },
    target: null,
    speed: 100,
    animation: "idle",
    facing: "east",
    walkPart: "loop",
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    walkPartsByFacing: {
      east: {
        start: { frameCount: 3, fps: 3, loop: false },
        loop: { frameCount: 4, fps: 4, loop: true, stopExitFrame: 2 },
        stop: { frameCount: 3, fps: 3, loop: false }
      }
    },
    animator
  };
  player.animation = "walk";
  animator.frameIndex = 1;
  requestWalkStop(player);
  assert.equal(player.walkPart, "stop");
  assert.equal(player.pendingStop, false);
  assert.equal(player.stopAnimationStarted, true);
});

test("retargeting while walking continues loop instead of replaying start", () => {
  const player = {
    position: { x: 0, y: 0 },
    target: { x: 100, y: 0 },
    speed: 100,
    animation: "walk",
    facing: "east",
    walkPart: "start",
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    walkPartsByFacing: {
      east: {
        start: { frameCount: 3, fps: 3, loop: false },
        loop: { frameCount: 4, fps: 4, loop: true },
        stop: { frameCount: 3, fps: 3, loop: false }
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.walkTo({ x: 200, y: 0 });
  assert.equal(player.walkPart, "loop");
});

test("new walk from idle uses start part when available", () => {
  const player = {
    position: { x: 0, y: 0 },
    target: null,
    speed: 100,
    animation: "idle",
    facing: "east",
    walkPart: null,
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    walkPartsByFacing: {
      east: {
        start: { frameCount: 3, fps: 3, loop: false },
        loop: { frameCount: 4, fps: 4, loop: true }
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.walkTo({ x: 200, y: 0 });
  assert.equal(player.walkPart, "start");
});

test("short walk uses short loop and skips stop animation when destination is reached", () => {
  const player = {
    position: { x: 0, y: 0 },
    target: null,
    speed: 100,
    animation: "idle",
    facing: "west",
    walkPart: null,
    shortWalk: false,
    idleHoldFrame: { slot: "external_walk_east_stop", mirrored: true, frameIndex: 0, frame: { frameCount: 1 } },
    idleVariant: { slot: "external_idle_east_1" },
    idleVariantQueue: [{ slot: "external_idle_east_2" }],
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    walkPartsByFacing: {
      east: {
        start: { frameCount: 3, fps: 3, loop: false },
        short: { frameCount: 4, fps: 4, loop: true },
        loop: { frameCount: 4, fps: 4, loop: true },
        stop: { frameCount: 3, fps: 3, loop: false }
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.walkTo({ x: 20, y: 0 }, { x: 20, y: 0 }, [{ x: 0, y: 0 }, { x: 20, y: 0 }], { shortWalk: true });
  assert.equal(player.walkPart, "short");
  assert.equal(player.facing, "east");
  assert.equal(player.idleHoldFrame, null);
  assert.equal(player.idleVariant, null);
  assert.deepEqual(player.idleVariantQueue, []);

  movement.update(1);
  assert.equal(player.animation, "idle");
  assert.equal(player.walkPart, null);
  assert.equal(player.shortWalk, false);
  assert.equal(player.facing, "east");
  assert.equal(player.idleHoldFrame, null);
  assert.equal(player.stopAnimationStarted, false);
});

test("game chooses short walk from routed path distance threshold", () => {
  const game = Object.create(Game.prototype);
  game.currentScene = {};
  game.player = {
    position: { x: 0, y: 0 },
    facing: "east"
  };
  let captured = null;
  game.movement = {
    walkTo(point, facingPoint, path, options) {
      captured = { point, facingPoint, path, options };
    }
  };

  game.walkToPoint({ x: SHORT_WALK_PATH_DISTANCE - 10, y: 0 });
  assert.equal(captured.options.shortWalk, true);
  assert.ok(walkPathDistance(game.player.position, captured.path) <= SHORT_WALK_PATH_DISTANCE);

  game.walkToPoint({ x: SHORT_WALK_PATH_DISTANCE + 10, y: 0 });
  assert.equal(captured.options.shortWalk, false);
});

test("reclicking during short walk uses current routed distance only", () => {
  const game = Object.create(Game.prototype);
  game.currentScene = {};
  game.player = {
    position: { x: 60, y: 0 },
    facing: "east",
    shortWalk: true
  };
  let captured = null;
  game.movement = {
    walkTo(point, facingPoint, path, options) {
      captured = { point, facingPoint, path, options };
    }
  };

  game.walkToPoint({ x: 100, y: 0 });
  assert.equal(captured.options.shortWalk, true);

  game.walkToPoint({ x: 111, y: 0 });
  assert.equal(captured.options.shortWalk, true);
});

test("active short walk does not switch into full walk on a long retarget", () => {
  const player = {
    position: { x: 60, y: 0 },
    target: { x: 100, y: 0 },
    speed: 100,
    animation: "walk",
    facing: "east",
    walkPart: "short",
    shortWalk: true,
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    animator: { frameIndex: 9, elapsed: 2, isFinished: () => false },
    walkPartsByFacing: {
      east: {
        start: { frameCount: 3, fps: 3, loop: false, initialFrame: 0 },
        short: { frameCount: 4, fps: 4, loop: true },
        loop: { frameCount: 4, fps: 4, loop: true },
        stop: { frameCount: 3, fps: 3, loop: false }
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.walkTo({ x: 110, y: 0 }, { x: 110, y: 0 }, [{ x: 110, y: 0 }], { shortWalk: false });

  assert.equal(player.shortWalk, true);
  assert.equal(player.walkPart, "short");
  assert.equal(player.animator.frameIndex, 9);
});

test("active full walk does not switch into short walk on a short retarget", () => {
  const player = {
    position: { x: 60, y: 0 },
    target: { x: 500, y: 0 },
    speed: 100,
    animation: "walk",
    facing: "east",
    walkPart: "start",
    shortWalk: false,
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    walkPartsByFacing: {
      east: {
        start: { frameCount: 3, fps: 3, loop: false },
        short: { frameCount: 4, fps: 4, loop: true },
        loop: { frameCount: 4, fps: 4, loop: true },
        stop: { frameCount: 3, fps: 3, loop: false }
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.walkTo({ x: 80, y: 0 }, { x: 80, y: 0 }, [{ x: 80, y: 0 }], { shortWalk: true });

  assert.equal(player.shortWalk, false);
  assert.equal(player.walkPart, "loop");
});

test("new walk start movement uses start initial frame instead of stale animator frame", () => {
  const player = {
    position: { x: 0, y: 0 },
    target: null,
    speed: 100,
    animation: "idle",
    facing: "east",
    walkPart: null,
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    animator: { frameIndex: 9, elapsed: 3, isFinished: () => false },
    walkPartsByFacing: {
      east: {
        start: { frameCount: 4, fps: 4, loop: false, initialFrame: 0, movementSpeedMultipliers: [0, 0, 0, 0] },
        loop: { frameCount: 4, fps: 4, loop: true, movementSpeedMultipliers: [1, 1, 1, 1] }
      }
    },
    walkMotionMultipliersByFacing: {
      east: {
        start: [0, 0, 0, 0],
        loop: [1, 1, 1, 1]
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.walkTo({ x: 200, y: 0 });
  movement.update(0.5);

  assert.equal(player.animator.frameIndex, 0);
  assert.deepEqual(player.position, { x: 0, y: 0 });
});

test("finished zero-speed start frame does not borrow loop movement on the transition tick", () => {
  const player = {
    position: { x: 0, y: 0 },
    target: { x: 200, y: 0 },
    speed: 100,
    animation: "walk",
    facing: "east",
    walkPart: "start",
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    animator: { frameIndex: 3, elapsed: 1, isFinished: () => true },
    walkPartsByFacing: {
      east: {
        start: { frameCount: 4, fps: 4, loop: false, initialFrame: 0, movementSpeedMultipliers: [0, 0, 0, 0] },
        loop: { frameCount: 4, fps: 4, loop: true, movementSpeedMultipliers: [1, 1, 1, 1] }
      }
    },
    walkMotionMultipliersByFacing: {
      east: {
        start: [0, 0, 0, 0],
        loop: [1, 1, 1, 1]
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.update(0.5);

  assert.equal(player.walkPart, "loop");
  assert.deepEqual(player.position, { x: 0, y: 0 });
});

test("simple animation start frame with zero multiplier does not change x", () => {
  const game = Object.create(Game.prototype);
  game.simpleAnim = {
    mode: "start",
    direction: "east",
    moving: true,
    x: 476.5,
    speed: 120,
    frameIndex: 1,
    elapsed: 1 / 20,
    lastMoveMultiplier: 0,
    lastMoveDx: 0
  };
  game.simpleCurrentFrame = () => ({
    frameCount: 16,
    fps: 20,
    loop: false,
    movementSpeedMultipliers: Array.from({ length: 16 }, () => 0)
  });
  game.simpleAnimFps = Game.prototype.simpleAnimFps;
  game.setSimpleAnimMode = (mode) => { game.simpleAnim.mode = mode; };
  game.updateSimpleSequence = () => {};

  game.updateSimpleAnim(1 / 20);

  assert.equal(game.simpleAnim.mode, "start");
  assert.equal(game.simpleAnim.lastMoveMultiplier, 0);
  assert.equal(game.simpleAnim.lastMoveDx, 0);
  assert.equal(game.simpleAnim.x, 476.5);
});

test("clicking current idle position does not start walk or stop animation", () => {
  const player = {
    position: { x: 100, y: 80 },
    target: null,
    speed: 100,
    animation: "idle",
    facing: "east",
    walkPart: null,
    pendingStop: false,
    stopAnimationStarted: false,
    stopAnimationFinished: true,
    movementStopping: false,
    walkPartsByFacing: {
      east: {
        start: { frameCount: 3, fps: 3, loop: false },
        loop: { frameCount: 4, fps: 4, loop: true },
        stop: { frameCount: 3, fps: 3, loop: false }
      }
    }
  };
  const movement = new MovementSystem(player);
  movement.walkTo({ x: 102, y: 81 });

  assert.equal(player.animation, "idle");
  assert.equal(player.target, null);
  assert.equal(player.walkPart, null);
  assert.equal(player.stopAnimationStarted, false);
});

test("far target click walks to direct mask approach before running look action", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const target = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.mirror");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.selectedVerb = "look";
  game.player = {
    position: { x: 650, y: 520 },
    target: null,
    animation: "idle",
    facing: "west",
    verticalDirectionBias: 1.6,
    walkPartsByFacing: { east: {}, west: {} },
    pendingInteraction: null
  };
  game.movement = {
    walkTo(point) {
      game.player.target = { ...point };
      game.player.animation = "walk";
    }
  };
  game.t = (key) => key;

  game.handleTarget(target, { x: 900, y: 250 });

  assert.ok(game.player.pendingInteraction);
  assert.equal(game.player.facing, "east");
  assert.equal(game.player.pendingInteraction.target.id, "hotspot.apartment.mirror");
  assert.equal(game.player.pendingInteraction.verb, "look");
  assert.deepEqual(game.player.pendingFacingPoint, { x: 900, y: 250 });
  assert.equal(game.player.interactionDebug.kind, "target");
  assert.deepEqual(game.player.interactionDebug.hand, { x: 900, y: 250 });
  assert.deepEqual(game.player.interactionDebug.distancePoint, { x: 900, y: 250 });
  assert.deepEqual(game.player.interactionDebug.reachOrigin, game.playerReachOriginPoint());
  assert.ok(Math.abs(game.player.interactionDebug.reachDistance - distance(game.player.interactionDebug.reachOrigin, { x: 900, y: 250 })) < 0.001);
  assert.deepEqual(game.player.interactionDebug.click, { x: 900, y: 250 });
  assert.deepEqual(game.player.interactionDebug.feetGoal, { x: 810, y: 405 });
  assert.deepEqual(game.player.interactionDebug.feet, game.player.target);
  assert.equal(game.message, "");
});

test("table click approaches the table instead of stopping near current feet", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const target = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.table");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.selectedVerb = "look";
  game.player = {
    position: { x: 910, y: 520 },
    target: null,
    animation: "idle",
    facing: "east",
    verticalDirectionBias: 1.6,
    walkPartsByFacing: { east: {}, west: {} },
    pendingInteraction: null
  };
  game.movement = {
    walkTo(point) {
      game.player.target = { ...point };
      game.player.animation = "walk";
    }
  };
  game.t = (key) => key;

  game.handleTarget(target, { x: 315, y: 490 });

  assert.equal(game.player.facing, "west");
  assert.deepEqual(game.player.interactionDebug.hand, { x: 315, y: 490 });
  assert.deepEqual(game.player.interactionDebug.distancePoint, { x: 315, y: 490 });
  assert.deepEqual(game.player.interactionDebug.reachOrigin, game.playerReachOriginPoint());
  assert.deepEqual(game.player.interactionDebug.feetGoal, { x: 405, y: 645 });
  assert.ok(game.player.target.x >= 390);
  assert.ok(game.player.target.x <= 440);
  assert.ok(game.player.target.y >= 580);
  assert.ok(game.player.target.y <= 600);
  assert.ok(distance(game.player.target, game.player.position) > 250);
  assert.deepEqual(game.player.interactionDebug.click, { x: 315, y: 490 });
});

test("near object approach does not start tiny corrective walk", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const target = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.mirror");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.selectedVerb = "look";
  game.message = "previous";
  game.player = {
    position: { x: 990, y: 520 },
    target: null,
    animation: "idle",
    facing: "west",
    verticalDirectionBias: 1.6,
    walkPartsByFacing: { east: {}, west: {} },
    pendingInteraction: null,
    animator: { play() {} }
  };
  game.movement = {
    walkTo(point) {
      game.walkedTo = { ...point };
    }
  };
  game.usesExternalCharacterAnimation = () => false;
  game.t = (key) => key;

  game.handleTarget(target, { x: 900, y: 365 });

  assert.equal(game.walkedTo, undefined);
  assert.equal(game.player.pendingInteraction, null);
  assert.equal(game.player.facing, "west");
  assert.equal(game.message, "look.apartment.mirror");
  assert.ok(distance(game.player.position, game.player.interactionDebug.feet) <= 80);
});

test("registered action requiring exact approach walks to its anchor even from hand reach", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const target = scene.interactables.find((candidate) => candidate.id === "window");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.selectedVerb = "use";
  game.state = { flags: {} };
  game.inventory = { has: () => false };
  game.quests = {};
  game.player = {
    position: { x: 350, y: 470 },
    target: null,
    animation: "idle",
    facing: "west",
    pendingInteraction: null
  };
  game.walkToPoint = (point, facingPoint) => {
    game.walkedTo = { ...point };
    game.walkFacingPoint = { ...facingPoint };
  };
  game.clearStatusMessage = () => {};

  const shouldApproach = game.shouldApproachTargetBeforeAction(target, { x: 300, y: 250 });

  assert.equal(shouldApproach, true);
  assert.deepEqual(game.walkedTo, { x: 330, y: 470 });
  assert.deepEqual(game.player.pendingInteraction.approach, { x: 330, y: 470 });
  assert.equal(game.player.pendingInteraction.actionSequence.requireExactApproach, true);
});

test("village-square poster-board clicks share one fixed east-facing look approach", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const target = scene.interactables.find((candidate) => candidate.id === "hotspot.square.poster_board");
  const approaches = [];

  for (const clickPoint of [{ x: 1080, y: 270 }, { x: 1160, y: 400 }]) {
    const game = Object.create(Game.prototype);
    game.currentScene = scene;
    game.selectedVerb = "look";
    game.player = {
      position: { x: 900, y: 550 },
      target: null,
      animation: "idle",
      facing: "east",
      pendingInteraction: null
    };
    game.walkToPoint = (point) => { approaches.push({ ...point }); };
    game.clearStatusMessage = () => {};

    assert.equal(game.shouldApproachTargetBeforeAction(target, clickPoint), true);
    assert.deepEqual(game.player.pendingInteraction.approach, { x: 976, y: 625 });
    assert.equal(game.player.pendingInteraction.actionSequence.messageKey, target.lookKey);
    assert.equal(game.player.facing, "east");
  }

  assert.deepEqual(approaches, [{ x: 976, y: 625 }, { x: 976, y: 625 }]);
});

test("looking at an open window reports its state without triggering an action animation", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const target = scene.interactables.find((candidate) => candidate.id === "window.open");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.selectedVerb = "look";
  game.state = { flags: { apartmentWindowOpen: true } };
  game.player = {
    position: { x: 900, y: 550 },
    target: null,
    animation: "idle",
    facing: "east",
    pendingInteraction: null
  };
  game.inventory = { has: () => false };
  game.quests = {};
  game.t = (key) => `translated:${key}`;
  game.setStatusMessage = (message) => { game.spokenMessage = message; };
  game.save = () => {};
  game.renderUi = () => {};
  game.actionAnimationForSequence = () => { throw new Error("look must not select a window animation"); };

  game.performTargetAction(target);

  assert.equal(game.player.animation, "idle");
  assert.equal(game.spokenMessage, "translated:look.apartment.window.open");
});

test("using each apartment window hotspot selects its matching direction and approach", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const closedWindow = scene.interactables.find((candidate) => candidate.id === "window");
  const openWindow = scene.interactables.find((candidate) => candidate.id === "window.open");
  const game = Object.create(Game.prototype);
  game.state = { flags: {} };
  game.inventory = { has: () => false };
  game.quests = {};

  const open = game.actionSequenceForTarget(closedWindow, VERBS.USE);
  assert.equal(open.reverseAnimation, undefined);
  assert.equal(open.messageKey, "msg.apartment.window_opened");
  assert.deepEqual(open.approachCell, { x: 16, y: 23 });

  game.state.flags.apartmentWindowOpen = true;
  const close = game.actionSequenceForTarget(openWindow, VERBS.USE);
  assert.equal(close.reverseAnimation, true);
  assert.equal(close.messageKey, "msg.apartment.window_closed");
  assert.deepEqual(close.approachCell, { x: 24, y: 25 });
});

test("world clicks cannot trigger an exit while an interaction action is running", () => {
  const game = Object.create(Game.prototype);
  let sceneChanges = 0;
  game.sceneTransitionPending = false;
  game.currentScene = {
    npcs: [],
    interactables: [],
    exits: [{
      id: "exit.apartment.to_square",
      kind: "exit",
      rect: { x: 0, y: 0, w: 100, h: 100 },
      targetSceneId: "scene.chapter1.village_square"
    }]
  };
  game.player = {
    animation: "action",
    actionSequence: { target: { id: "window" } }
  };
  game.changeScene = () => { sceneChanges += 1; };

  game.handleWorldClick({ x: 50, y: 50 });

  assert.equal(sceneChanges, 0);
  assert.equal(game.player.actionSequence.target.id, "window");
});

test("hovering actionable geometry selects it and enables the pointer cursor", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.menuOpen = false;
  game.paused = false;
  game.sceneTransitionPending = false;
  game.dialogue = { current: null };
  game.inventory = { has: () => false };
  game.player = { animation: "idle", actionSequence: null };
  game.canvas = { style: {} };

  const target = game.updateHoveredTarget({ x: 400, y: 200 });

  assert.equal(target.id, "exit.square.to_apartment");
  assert.equal(game.canvas.style.cursor, "pointer");
  game.updateHoveredTarget(null);
  assert.equal(game.hoveredTarget, null);
  assert.equal(game.canvas.style.cursor, "default");
});

test("hovered actionable geometry uses a transparent yellow outer glow", () => {
  const calls = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    rect(...args) { calls.push(["rect", ...args]); },
    stroke() { calls.push(["stroke", this.strokeStyle, this.lineWidth, this.shadowColor, this.shadowBlur]); }
  };
  const renderer = Object.create(Renderer.prototype);
  renderer.ctx = ctx;
  renderer.game = { hoveredTarget: { rect: { x: 10, y: 20, w: 30, h: 40 } } };

  renderer.drawHoveredTarget();

  assert.deepEqual(calls[0], ["rect", 10, 20, 30, 40]);
  assert.deepEqual(calls[1], ["stroke", "rgba(225, 194, 100, 0.26)", 2, "rgba(225, 194, 100, 0.68)", 16]);
});

test("hover outline uses scene depth so Bai covers objects behind him", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const building = scene.exits.find((target) => target.id === "exit.square.to_apartment");
  const table = scene.exits.find((target) => target.id === "exit.square.to_mehana");
  const actor = { position: { x: 430, y: 540 } };
  assert.ok(targetZIndex(scene, building) > sceneZIndexForPoint(scene, actor.position));
  assert.ok(targetZIndex(scene, table) < sceneZIndexForPoint(scene, actor.position));
});

test("apartment-building target trims about one third from its old left edge", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.village_square");
  const building = scene.exits.find((target) => target.id === "exit.square.to_apartment");
  assert.equal(pointInPolygon({ x: 300, y: 200 }, building.polygon), false);
  assert.equal(pointInPolygon({ x: 430, y: 200 }, building.polygon), true);
});

test("active Menu switch uses the same color as button hover", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /button:hover\s*{\s*background:\s*#4a3825;/);
  assert.match(css, /button\.active\s*{\s*background:\s*#4a3825;/);
});

test("rect target approach uses click point as hand target and left-middle fallback without click", () => {
  const target = { rect: { x: 640, y: 155, w: 140, h: 220 } };
  const game = Object.create(Game.prototype);
  assert.deepEqual(game.targetReachPoint(target, { x: 760, y: 320 }), { x: 760, y: 320 });
  assert.deepEqual(game.targetReachPoint(target), { x: 682, y: 265 });
});

test("empty walkable click uses the clicked point as the feet pivot destination", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.message = "previous action";
  game.player = {
    position: { x: 590, y: 520 },
    target: null,
    animation: "idle",
    facing: "west",
    verticalDirectionBias: 1.6,
    walkPartsByFacing: { east: {}, west: {} },
    pendingInteraction: { target: {} }
  };
  game.movement = {
    walkTo(point) {
      game.walkedTo = { ...point };
    }
  };
  game.t = (key) => key;

  game.handleWorldClick({ x: 650, y: 520 });

  assert.deepEqual(game.walkedTo, { x: 650, y: 520 });
  assert.equal(game.player.facing, "east");
  assert.equal(game.message, "");
  assert.deepEqual(game.player.interactionDebug, { kind: "move", click: { x: 650, y: 520 }, feet: { x: 650, y: 520 } });
  assert.equal(game.player.pendingInteraction, null);
  assert.deepEqual(game.player.pendingFacingPoint, { x: 650, y: 520 });
});

test("finished empty move turns toward the requested walk point", () => {
  const game = Object.create(Game.prototype);
  game.player = {
    position: { x: 650, y: 520 },
    target: null,
    animation: "idle",
    facing: "east",
    verticalDirectionBias: 1.6,
    pendingFacingPoint: { x: 590, y: 520 }
  };

  game.resolvePendingFacingPoint();

  assert.equal(game.player.pendingFacingPoint, null);
  assert.equal(game.player.facing, "west");
});

test("pending target action runs after walk and stop animation complete", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const target = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.mirror");
  const game = Object.create(Game.prototype);
  game.selectedVerb = "use";
  game.player = {
    position: { x: 650, y: 500 },
    target: null,
    animation: "idle",
    facing: "west",
    verticalDirectionBias: 1.6,
    animator: { play() {} },
    pendingInteraction: { target, verb: "look", hand: { x: 700, y: 500 }, approach: { x: 650, y: 500 } }
  };
  game.usesExternalCharacterAnimation = () => false;
  game.t = (key) => key;

  game.resolvePendingInteraction();

  assert.equal(game.player.pendingInteraction, null);
  assert.equal(game.selectedVerb, "use");
  assert.equal(game.player.facing, "east");
  assert.equal(game.message, "look.apartment.mirror");
});

test("target action turns toward hand point when no movement is needed", () => {
  const scene = chapter1.scenes.find((candidate) => candidate.id === "scene.chapter1.apartment");
  const target = scene.interactables.find((candidate) => candidate.id === "hotspot.apartment.mirror");
  const game = Object.create(Game.prototype);
  game.currentScene = scene;
  game.selectedVerb = "look";
  game.player = {
    position: { x: 650, y: 500 },
    target: null,
    animation: "idle",
    facing: "east",
    verticalDirectionBias: 1.6,
    walkPartsByFacing: { east: {}, west: {} },
    animator: { play() {} },
    pendingInteraction: null
  };
  game.usesExternalCharacterAnimation = () => false;
  game.t = (key) => key;

  game.player.facing = "west";
  const reachablePoint = game.playerReachOriginPoint();
  game.player.facing = "east";
  game.handleTarget(target, reachablePoint);

  assert.equal(game.player.pendingInteraction, null);
  assert.equal(game.player.facing, "west");
  assert.equal(game.message, "look.apartment.mirror");
});

test("speech bubble layout stays in 1280 by 720 virtual coordinates across viewport scales", () => {
  const game = Object.create(Game.prototype);
  game.currentScene = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.apartment");
  game.player = { position: { x: 650, y: 520 }, facing: "west" };
  game.speechBubble = {
    metrics: { width: 350, height: 90, maxWidth: 350, maxHeight: 170 }
  };
  game.canvas = {
    width: 1280,
    height: 720,
    getBoundingClientRect: () => ({ width: 640, height: 360 })
  };

  const smallViewportLayout = game.speechBubblePosition();
  game.canvas.getBoundingClientRect = () => ({ width: 3840, height: 2160 });
  const largeViewportLayout = game.speechBubblePosition();

  assert.deepEqual(largeViewportLayout, smallViewportLayout);
  assert.equal(game.speechBubble.debug.bubbleRect.w, 350);
  assert.equal(game.speechBubble.debug.bubbleRect.h, 90);
});

test("speech bubble messages start talk or reject animation variants", () => {
  const game = Object.create(Game.prototype);
  game.usesExternalCharacterAnimation = () => true;
  game.player = {
    position: { x: 650, y: 500 },
    target: null,
    animation: "idle",
    facing: "east",
    idleVariant: { slot: "external_idle_east_1" },
    idleVariantQueue: [{ slot: "external_idle_east_2" }],
    animator: { played: null, play(animation, key) { this.played = { animation, key }; } }
  };

  game.setStatusMessage("short text");

  assert.equal(game.message, "short text");
  assert.equal(game.player.animation, "talk");
  assert.equal(game.player.speechAnimation.slot, "external_talk_east_short_1");
  assert.equal(game.player.idleVariant, null);
  assert.deepEqual(game.player.idleVariantQueue, []);
  assert.equal(game.player.animator.played.animation, "talk");

  game.setStatusMessage("cannot", { reject: true });

  assert.equal(game.player.animation, "reject");
  assert.equal(game.player.speechAnimation.slot, "external_reject_east_1");
});

test("overlong speech is paginated at word boundaries without losing text", () => {
  const game = Object.create(Game.prototype);
  game.speechBubbleTextFits = (text) => text.length <= 18;

  const message = "One bureaucratic sentence with several needlessly ceremonial words";
  const pages = game.speechBubblePages(message);

  assert.ok(pages.length > 1);
  assert.equal(pages.join(" "), message);
  assert.ok(pages.every((page) => page.length <= 18));
});

test("automatic speech pages join authored message beats in the existing queue", () => {
  const game = Object.create(Game.prototype);
  game.usesExternalCharacterAnimation = () => false;
  game.renderUi = () => {};
  game.measureSpeechBubble = () => ({ width: 350, height: 120, maxWidth: 350, maxHeight: 190 });
  game.speechBubbleTextFits = (text) => text.split(" ").length <= 2;
  game.player = { target: null, animation: "idle", speaking: false, speechAnimation: null };
  game.speechBubble = null;
  game.pendingSpeechBubble = null;
  game.speechBubbleQueue = [];
  game.speechBubblePauseRemaining = 0;
  game.speechBubbleSequence = 0;

  game.setStatusMessage(["one two three four", "five six"]);

  assert.equal(game.speechBubble.text, "one two");
  assert.deepEqual(game.speechBubbleQueue.map((beat) => beat.message), ["three four", "five six"]);
});

test("speech bubble defers during walking and appears when idle", () => {
  const game = Object.create(Game.prototype);
  game.usesExternalCharacterAnimation = () => true;
  game.renderUi = () => {};
  game.measureSpeechBubble = () => ({ width: 220, height: 90, maxWidth: 350, maxHeight: 200 });
  game.player = {
    position: { x: 650, y: 500 },
    target: { x: 700, y: 500 },
    animation: "walk",
    facing: "east",
    speaking: true,
    speechAnimation: { slot: "external_talk_east_short_1" },
    idleVariant: null,
    idleVariantQueue: [],
    animator: { played: null, play(animation, key) { this.played = { animation, key }; } }
  };
  game.message = "old";
  game.speechBubble = { text: "old", phase: "visible" };
  game.pendingSpeechBubble = null;
  game.speechBubbleSequence = 0;

  game.setStatusMessage("after walk");

  assert.equal(game.speechBubble, null);
  assert.equal(game.message, "");
  assert.deepEqual(game.pendingSpeechBubble, { message: "after walk", options: {} });
  assert.equal(game.player.speaking, false);
  assert.equal(game.player.speechAnimation, null);

  game.player.target = null;
  game.player.animation = "idle";
  game.updateSpeechBubble(0.1);

  assert.equal(game.pendingSpeechBubble, null);
  assert.equal(game.speechBubble.text, "after walk");
  assert.equal(game.player.animation, "talk");
  assert.equal(game.player.animator.played.animation, "talk");
});

test("speech message arrays keep one bubble while text crossfades and the bubble resizes", () => {
  const game = Object.create(Game.prototype);
  game.usesExternalCharacterAnimation = () => false;
  game.renderUi = () => {};
  game.measureSpeechBubble = () => ({ width: 220, height: 90, maxWidth: 350, maxHeight: 200 });
  game.player = {
    target: null,
    animation: "idle",
    speaking: false,
    speechAnimation: null
  };
  game.message = "";
  game.speechBubble = null;
  game.pendingSpeechBubble = null;
  game.speechBubbleQueue = [];
  game.speechBubblePauseRemaining = 0;
  game.speechBubbleSequence = 0;

  game.setStatusMessage(["Mmmm...", "Smells like elections.", "Someone aired out the coalition."]);

  assert.equal(game.speechBubble.text, "Mmmm...");
  assert.deepEqual(game.speechBubbleQueue.map((beat) => beat.message), [
    "Smells like elections.",
    "Someone aired out the coalition."
  ]);

  const bubbleId = game.speechBubble.id;
  game.speechBubble.phase = "visible";
  game.speechBubble.elapsed = game.speechBubble.visibleSeconds;
  game.updateSpeechBubble(0);
  assert.equal(game.speechBubble.id, bubbleId);
  assert.equal(game.speechBubble.text, "Mmmm...");
  assert.equal(game.speechBubble.phase, "visible");
  game.updateSpeechBubble(0.2);
  assert.equal(game.speechBubble.text, "Mmmm...");
  game.updateSpeechBubble(0.2);
  assert.equal(game.speechBubble.id, bubbleId);
  assert.equal(game.speechBubble.text, "Mmmm...");
  assert.equal(game.speechBubble.phase, "beat-out");
  game.updateSpeechBubble(0.2);
  assert.equal(game.speechBubble.id, bubbleId);
  assert.equal(game.speechBubble.text, "Smells like elections.");
  assert.equal(game.speechBubble.phase, "beat-in");
  game.updateSpeechBubble(0.2);
  assert.equal(game.speechBubble.phase, "visible");
  assert.equal(game.speechBubbleQueue.length, 1);
});

test("speech bubble waits for its talk animation to finish before fading out", () => {
  const game = Object.create(Game.prototype);
  let animationFinished = false;
  game.renderUi = () => {};
  game.player = {
    target: null,
    animation: "talk",
    speechAnimation: { slot: "external_talk_east_long_1" },
    animator: { isFinished: () => animationFinished }
  };
  game.speechBubble = {
    text: "A short line with a longer gesture.",
    phase: "visible",
    elapsed: 10,
    visibleSeconds: 1
  };

  game.updateSpeechBubble(0.1);
  assert.equal(game.speechBubble.phase, "visible");

  animationFinished = true;
  game.updateSpeechBubble(0.1);
  assert.equal(game.speechBubble.phase, "out");
});

test("talk animation semantic heuristic classifies text shape", () => {
  const game = Object.create(Game.prototype);

  assert.equal(game.talkSemanticForMessage("Да."), "singleWord");
  assert.equal(game.talkSemanticForMessage("Това няма да стане."), "singleShortSentence");
  assert.equal(
    game.talkSemanticForMessage("Това няма да стане, защото комисията първо трябва да назначи подкомисия за предварително усещане."),
    "singleLongSentence"
  );
  assert.equal(game.talkSemanticForMessage("Първо това. После онова."), "singleLongSentence");
});

test("external idle pose uses walk start frame zero instead of stale walk frame", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const player = {
    walkPartsByFacing: definition.animations.walk.parts,
    lastWalkFrame: {
      frameIndex: 7,
      frame: definition.animations.walk.parts.east.loop,
      slot: definition.animations.walk.parts.east.loop.slot
    }
  };
  const idle = Renderer.resolveIdleWalkFrameForDefinition(player, definition, "east");
  assert.equal(idle.slot, "external_walk_east_start");
  assert.equal(idle.frameIndex, 0);
  assert.equal(idle.frame.role, "hold");
  assert.deepEqual(idle.frame.frameRects[0], definition.animations.walk.parts.east.start.sourceFrameRects[0]);
});

test("external Bai Mitko idle only requests animation slots", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const renderer = Object.create(Renderer.prototype);
  renderer.game = {
    assets: {
      getCharacterImage(_characterId, slot) {
        assert.equal(slot.startsWith("external_walk_"), true);
        return null;
      },
      isLoaded(image) {
        return image?.dataset?.loaded === "true";
      }
    }
  };
  const sprite = renderer.resolveCharacterSprite({
    id: "npc.bai_mitko",
    animation: "idle",
    facing: "east",
    walkPartsByFacing: definition.animations.walk.parts
  }, definition);

  assert.equal(sprite.image, null);
  assert.equal(sprite.slot, "external_walk_east_start");
});

test("external Bai Mitko non-walk states use walk-start frame zero when no animation strip exists", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const renderer = Object.create(Renderer.prototype);
  const loadedStart = { dataset: { loaded: "true" } };
  renderer.validateStrip = () => true;
  renderer.game = {
    assets: {
      getCharacterImage(_characterId, slot) {
        if (slot === "external_walk_east_start") return loadedStart;
        return null;
      },
      isLoaded(image) {
        return image?.dataset?.loaded === "true";
      }
    }
  };
  const sprite = renderer.resolveCharacterSprite({
    id: "npc.bai_mitko",
    animation: "talk",
    facing: "west",
    walkPartsByFacing: definition.animations.walk.parts
  }, definition);

  assert.equal(sprite.image, loadedStart);
  assert.equal(sprite.slot, "external_walk_east_start");
  assert.equal(sprite.frame.role, "hold");
  assert.equal(sprite.staticFrameIndex, 0);
  assert.equal(sprite.mirrored, true);
});

test("external Bai Mitko idle can hold the last frame of a completed animation", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const renderer = Object.create(Renderer.prototype);
  const heldFrame = externalAnimationV1.idleVariants.east[0];
  const loadedHeld = { dataset: { loaded: "true" } };
  renderer.game = {
    assets: {
      getCharacterImage(_characterId, slot) {
        if (slot === heldFrame.slot) return loadedHeld;
        return null;
      },
      isLoaded(image) {
        return image?.dataset?.loaded === "true";
      }
    }
  };
  const sprite = renderer.resolveCharacterSprite({
    id: "npc.bai_mitko",
    animation: "idle",
    facing: "east",
    idleHoldFrame: {
      frame: heldFrame,
      slot: heldFrame.slot,
      mirrored: false,
      frameIndex: heldFrame.frameCount - 1
    },
    walkPartsByFacing: definition.animations.walk.parts
  }, definition);

  assert.equal(sprite.image, loadedHeld);
  assert.equal(sprite.slot, heldFrame.slot);
  assert.equal(sprite.staticFrameIndex, heldFrame.frameCount - 1);
});

test("finished stop animation stores its last frame as the next idle hold", () => {
  const frame = characterDefinitions["npc.bai_mitko"].animations.walk.parts.east.stop;
  const player = {
    animation: "walk",
    walkPart: "stop",
    facing: "east",
    walkPartsByFacing: characterDefinitions["npc.bai_mitko"].animations.walk.parts,
    idleHoldFrame: null,
    animator: {
      isFinished() {
        return true;
      }
    }
  };
  const game = Object.create(Game.prototype);
  game.player = player;
  const finishing = game.finishingStopFrame();
  assert.equal(finishing.frame, frame);
  game.setIdleHoldFrame(finishing.frame, finishing.frameIndex);
  assert.equal(player.idleHoldFrame.slot, "external_walk_east_stop");
  assert.equal(player.idleHoldFrame.frameIndex, frame.frameCount - 1);
});

test("external Bai Mitko idle ignores stale stop walk part", () => {
  const definition = characterDefinitions["npc.bai_mitko"];
  const renderer = Object.create(Renderer.prototype);
  const requestedSlots = [];
  const loadedStart = { dataset: { loaded: "true" } };
  renderer.validateStrip = () => true;
  renderer.game = {
    assets: {
      getCharacterImage(_characterId, slot) {
        requestedSlots.push(slot);
        if (slot === "external_walk_east_start") return loadedStart;
        return null;
      },
      isLoaded(image) {
        return image?.dataset?.loaded === "true";
      }
    }
  };
  const sprite = renderer.resolveCharacterSprite({
    id: "npc.bai_mitko",
    animation: "idle",
    facing: "east",
    walkPart: "stop",
    walkPartsByFacing: definition.animations.walk.parts
  }, definition);

  assert.equal(sprite.slot, "external_walk_east_start");
  assert.equal(sprite.staticFrameIndex, 0);
  assert.equal(requestedSlots.includes("external_walk_east_stop"), false);
});

test("movement stop phase plays once and can finish into idle", () => {
  const animator = new AnimationPlayer({
    animations: {
      idle: { frames: ["idle"], fps: 1, loop: true },
      walk: { type: "phasedStrip", frameCount: 3, fps: 3, loop: false }
    }
  });
  const player = {
    position: { x: 0, y: 0 },
    target: null,
    speed: 100,
    animation: "walk",
    facing: "east",
    walkPart: "loop",
    pendingStop: true,
    stopAnimationStarted: false,
    stopAnimationFinished: false,
    movementStopping: false,
    walkPartsByFacing: {
      east: {
        loop: { frameCount: 4, fps: 4, loop: true, stopExitFrame: 1 },
        stop: { frameCount: 3, fps: 3, loop: false }
      }
    },
    animator
  };
  const movement = new MovementSystem(player);
  animator.frameIndex = 1;
  movement.update(1 / 60);
  assert.equal(player.walkPart, "stop");

  animator.play("walk", "external_walk_east_stop:east:stop");
  animator.frameCountOverride = 3;
  animator.fpsOverride = 3;
  animator.loopOverride = false;
  animator.update(1 / 3);
  movement.update(1 / 60);
  assert.equal(player.walkPart, "stop");
  assert.equal(player.animation, "walk");
  assert.ok(animator.frameIndex > 0);

  animator.update(1);
  movement.update(1 / 60);
  assert.equal(player.animation, "idle");
  assert.equal(player.walkPart, null);
  assert.equal(player.stopAnimationFinished, true);
});

test("stop render offset fades from configured value to zero", () => {
  const frame = { role: "stop", frameCount: 15, initialFrame: 1, stopRenderOffsetXStart: -8, stopRenderOffsetYStart: 0 };
  assert.equal(stopRenderOffsetX(frame, 1), -8);
  assert.ok(Math.abs(stopRenderOffsetX(frame, 3) - -4.923) < 0.001);
  assert.equal(stopRenderOffsetX(frame, 7), 0);
  assert.equal(stopRenderOffsetX(frame, 14), 0);
  assert.equal(stopRenderOffsetX(frame, 1, true), 8);
  assert.equal(stopRenderOffsetY(frame, 1), 0);
  assert.equal(stopRenderOffsetY(frame, 3), 0);
  assert.equal(stopRenderOffsetY(frame, 7), 0);
  assert.equal(stopRenderOffsetY(frame, 14), 0);
});

test("external animation render scale and offsets default and mirror correctly", () => {
  assert.equal(animationRenderScale({}), 1);
  assert.equal(animationRenderScale({ scale: 1.25 }), 1.25);
  assert.equal(animationRenderMirrored({}, false), false);
  assert.equal(animationRenderMirrored({}, true), true);
  assert.equal(animationRenderMirrored({ flipX: true }, false), true);
  assert.equal(animationRenderMirrored({ flipX: false }, true), false);
  assert.deepEqual(animationRenderOffset({ offsetX: 10, offsetY: -4, offsets: [{ x: 2, y: 3 }] }, 0), { x: 12, y: -1 });
  assert.deepEqual(animationRenderOffset({ offsetX: 10, offsetY: -4, offsets: [{ x: 2, y: 3 }] }, 0, true), { x: -12, y: -1 });
  assert.deepEqual(animationRenderOffset({ offsets: [null, { x: 5, y: -2 }] }, 0), { x: 0, y: 0 });
});

test("generated external animations include authored scale and dense offsets", () => {
  const frame = externalAnimationV1.actionAnimations.east.opensWindow[0];
  assert.equal(frame.scale, 1.116);
  assert.equal(Number.isFinite(frame.offsetX), true);
  assert.equal(Number.isFinite(frame.offsetY), true);
  assert.equal(frame.offsets.length, frame.frameCount);
  assert.deepEqual(frame.offsets[0], { x: 0, y: 0 });
});

test("look into distance export is staged as the stable look action", () => {
  const selection = JSON.parse(readFileSync("assets_src/characters/bai_mitko/external_animation_v1/external-animation-selection.json", "utf8"));
  const config = selection.animations.look_into_distance_east_1;
  const runtime = externalAnimationV1.actionAnimations.east.look[0];
  assert.equal(config.action, "look");
  assert.match(config.description, /looks into the distance/i);
  assert.equal(runtime.actionKey, "look_into_distance_east_1");
  assert.equal(runtime.frameCount, 16);
  assert.equal(runtime.fps, 6);
  assert.equal(runtime.loop, false);
  assert.equal(runtime.movementSpeedMultipliers.every((value) => value === 0), true);
  assert.equal(externalAnimationV1.actionAnimations.west.look[0].mirrored, true);
});

test("simple animation viewer resolves the look into distance strip", () => {
  const game = Object.create(Game.prototype);
  game.simpleAnim = { mode: "look_into_distance_east_1", direction: "east" };
  const frame = game.simpleCurrentFrame();
  assert.equal(frame.slot, "external_look_into_distance_east_1");
  assert.equal(frame.frameCount, 16);
  assert.equal(frame.fps, 6);
});

test("open-window action carries an accepted reproducible registration fit", () => {
  const selection = JSON.parse(readFileSync("assets_src/characters/bai_mitko/external_animation_v1/external-animation-selection.json", "utf8"));
  const config = selection.animations.opens_window;
  const fit = config.registration.lastFit;
  assert.equal(config.offsets.length, externalAnimationV1.actionAnimations.east.opensWindow[0].frameCount);
  assert.equal(config.frameCount, 10);
  assert.ok(fit.score >= config.registration.acceptance.minimumGlobalScore);
  assert.ok(fit.minimumFrameScore >= config.registration.acceptance.minimumFrameScore);
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].scale, config.scale);
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].offsetX, config.offsetX);
  assert.equal(externalAnimationV1.actionAnimations.east.opensWindow[0].offsetY, config.offsetY);
});

test("take action carries an accepted character-fixture registration fit", () => {
  const selection = JSON.parse(readFileSync("assets_src/characters/bai_mitko/external_animation_v1/external-animation-selection.json", "utf8"));
  const config = selection.animations.take_east_forward_default;
  const fit = config.registration.lastFit;
  const runtime = externalAnimationV1.actionAnimations.east.take[0];
  assert.equal(config.registration.referenceProvider, "character");
  assert.equal(config.registration.referenceFrame, 15);
  assert.equal(config.registration.stabilizationReferenceFrame, 0);
  assert.equal(config.registration.stabilizationFixture, "bai_mitko_lower_body");
  assert.equal(config.registration.executionFixture, "bai_mitko_head_top_center");
  assert.equal(config.offsets.length, runtime.frameCount);
  assert.ok(fit.score >= config.registration.acceptance.minimumGlobalScore);
  assert.ok(fit.minimumFrameScore >= config.registration.acceptance.minimumFrameScore);
  assert.equal(runtime.scale, config.scale);
  assert.equal(runtime.offsetX, config.offsetX);
  assert.equal(runtime.offsetY, config.offsetY);
});

test("external animation chroma key converts green amount into soft alpha", () => {
  const png = makePng(4, 1);
  const pixels = [
    [0, 255, 0, 255],
    [70, 120, 75, 255],
    [24, 32, 28, 255],
    [180, 130, 90, 255]
  ];
  for (let x = 0; x < pixels.length; x += 1) {
    const index = x * 4;
    png.data[index] = pixels[x][0];
    png.data[index + 1] = pixels[x][1];
    png.data[index + 2] = pixels[x][2];
    png.data[index + 3] = pixels[x][3];
  }

  const keyed = chromaKeyGreenToAlpha(png, { low: 18, high: 95, minGreen: 40, spillStrength: 1 }).png;
  assert.equal(keyed.data[3], 0, "pure key green should become transparent");
  assert.ok(keyed.data[7] > 0 && keyed.data[7] < 255, "green edge pixels should receive partial alpha");
  assert.ok(keyed.data[5] < png.data[5], "green spill should be suppressed on semi-transparent edges");
  assert.equal(keyed.data[11], 255, "dark non-key pixels should stay opaque");
  assert.equal(keyed.data[15], 255, "warm skin-like pixels should stay opaque");
});

class MemoryStorage {
  constructor(values = {}) {
    this.values = values;
  }

  getItem(key) {
    return this.values[key] || null;
  }

  setItem(key, value) {
    this.values[key] = value;
  }

  removeItem(key) {
    delete this.values[key];
  }
}

test("the old men's bench blocks walking behind its seated figures but remains approachable", () => {
  const scene = chapter1.scenes.find(scene => scene.id === "scene.chapter1.village_square");
  for (let x = 490; x <= 610; x += 20) {
    for (let y = 330; y <= 430; y += 20) assert.equal(isWalkable(scene, { x, y }), false);
  }
  const from = { x: 300, y: 540 };
  const approach = nearestReachableWalkablePoint(scene, from, { x: 530, y: 400 });
  assert.ok(approach);
  assert.ok(distance(approach, { x: 530, y: 400 }) < 110);
  const path = findWalkPath(scene, from, approach);
  assert.ok(path.length);
  for (let i = 1; i < path.length; i++) {
    for (let t = 0; t <= 1; t += 0.05) {
      const p = { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * t };
      assert.equal(p.x >= 480 && p.x < 620 && p.y < 440, false);
    }
  }
});

test("the full-scene campaign poster appears only after posting, including old saves", () => {
  const scene = chapter1.scenes.find(scene => scene.id === "scene.chapter1.village_square");
  const layer = scene.foregroundLayers.find(layer => layer.id === "layer.square.campaign_poster");
  assert.ok(layer);
  assert.equal(scene.foregroundLayers.some(layer => layer.id === "layer.square.poster_before"), false);
  assert.equal(assetManifest.scenes[scene.id][layer.asset], "assets/chapter1/scenes/village_square/campaign-poster-v2.png");
  const editedScene = {};
  SceneEditor.prototype.applyLayersToRuntime.call({ layerSource: {}, layers: [layer], game: { currentScene: editedScene } });
  assert.equal(editedScene.foregroundLayers[0].visibleWhenFlag, "campaignPosted");
  const renderer = Object.create(Renderer.prototype);
  assert.deepEqual(renderer.sceneLayerRect(layer, { naturalWidth: 1280, naturalHeight: 720 }),
    { x: 0, y: 0, w: 1280, h: 720, width: 1280, height: 720 });
  for (const flags of [undefined, {}, { campaignPosted: false }]) {
    renderer.game = { state: { flags } };
    assert.equal(renderer.sceneLayerVisible(layer), false);
    assert.equal(renderer.sceneLayerVisible(editedScene.foregroundLayers[0]), false);
  }
  renderer.game.state.flags = { campaignPosted: true };
  assert.equal(renderer.sceneLayerVisible(layer), true);
  assert.equal(renderer.sceneLayerVisible(editedScene.foregroundLayers[0]), true);
});

test("relocated stamp station targets the visible seal and releases its old right-hand area", () => {
  const scene = chapter1.scenes.find(scene => scene.id === "scene.chapter1.municipality");
  const target = scene.interactables.find(target => target.id === "hotspot.municipality.stamp_desk");
  const seal = scene.foregroundLayers.find(layer => layer.asset === "municipalitySeal");
  assert.equal(pointInPolygon({ x: seal.left + 5, y: seal.top + seal.height / 2 }, target.polygon), true);
  assert.equal(pointInPolygon({ x: 690, y: 430 }, target.polygon), false);
});

test("corner stamp table sits behind the register without stealing its covered click area", () => {
  const scene = chapter1.scenes.find(scene => scene.id === "scene.chapter1.municipality");
  const layers = scene.foregroundLayers;
  const register = layers.find(layer => layer.asset === "candidateRegister");
  const table = layers.find(layer => layer.asset === "stampTable");
  const seal = layers.find(layer => layer.asset === "municipalitySeal");
  const order = [register, table, seal].sort((a, b) => b.zIndex - a.zIndex);
  assert.deepEqual(order.map(layer => layer.asset), ["stampTable", "municipalitySeal", "candidateRegister"]);
  const target = scene.interactables.find(target => target.id === "hotspot.municipality.stamp_desk");
  assert.equal(pointInPolygon({ x: 518, y: 400 }, target.polygon), false);
  assert.equal(pointInPolygon({ x: seal.left + 5, y: seal.top + seal.height - 3 }, target.polygon), true);
});
