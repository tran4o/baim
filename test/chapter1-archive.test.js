import { objectRemark } from '../src/content/chapter1/objectCommentary.js';
import test from "node:test";
import assert from "node:assert/strict";
import { chapter1 } from "../src/content/chapter1/index.js";
import { archiveScene, archiveEntryRules, archiveOpenRule, jarExchangeRule, clerkArchiveChoices } from "../src/content/chapter1/archive.js";
import { archiveEn, archiveBg } from "../src/content/localization/chapter1Archive.js";
import { DEFAULT_SAVE } from "../src/engine/ids.js";
import { InventorySystem } from "../src/engine/InventorySystem.js";
import { QuestSystem } from "../src/engine/QuestSystem.js";
import { SaveSystem } from "../src/engine/SaveSystem.js";
import { Game } from "../src/engine/Game.js";
import { Renderer } from "../src/engine/Renderer.js";
import { findTargetAt, isWalkable } from "../src/engine/SceneGeometry.js";
import { applyEffects, firstMatchingRule, requirementsMet } from "../src/engine/EffectSystem.js";
const index = entries => Object.fromEntries(entries.map(e => [e.id,e]));
const target = suffix => archiveScene.interactables.find(t => t.id === "hotspot.archive." + suffix);
function make(state = {}) {
  const game = Object.create(Game.prototype);
  game.state = { ...structuredClone(DEFAULT_SAVE), flags: { candidateRegistrationStamped: true }, inventory: ["item.accordion"], ...state };
  game.inventory = new InventorySystem(index(chapter1.items), game.state);
  game.quests = new QuestSystem(index(chapter1.quests), game.state);
  game.currentScene = archiveScene;
  game.content = { items: index(chapter1.items), scenes: index(chapter1.scenes) };
  game.player = { position: { ...archiveScene.playerStart } };
  game.t = key => key;
  game.setStatusMessage = key => { game.message = key; };
  game.save = () => {};
  game.renderUi = () => {};
  return game;
}
const reload = game => make(new SaveSystem({ getItem: () => JSON.stringify(game.state) }).load());
function use(game, rule) {
  assert.ok(requirementsMet(rule.requirements, game.effectContext()));
  applyEffects(rule.effects, game.effectContext());
}
test("archive requires registration, inspection and strap; retains accordion", () => {
  const game = make({ flags: {} });
  assert.equal(firstMatchingRule(archiveEntryRules, game.effectContext()).reject, true);
  game.state.flags.candidateRegistrationStamped = true;
  assert.equal(firstMatchingRule(archiveEntryRules, game.effectContext()).sceneTransition.sceneId, archiveScene.id);
  assert.equal(requirementsMet(archiveOpenRule.requirements, game.effectContext()), false);
  game.lookTarget(target("handle"));
  use(game, archiveOpenRule);
  assert.equal(game.state.flags.archiveOpened, true);
  assert.equal(game.inventory.has("item.accordion"), true);
  assert.equal(requirementsMet(archiveOpenRule.requirements, game.effectContext()), false);
  assert.equal(game.targetAvailable(target("handle")), false);
});
test("ledger and jar exchange gate taking the empty box across reloads", () => {
  let game = make({ flags: { candidateRegistrationStamped: true, archiveOpened: true } });
  game.takeTarget(target("ballot_box"));
  assert.equal(game.message, objectRemark(target("ballot_box").id, "take", game.state.language));
  assert.equal(game.inventory.has("item.ballot_box"), false);
  game.takeTarget(target("jar"));
  assert.equal(requirementsMet(jarExchangeRule.requirements, game.effectContext()), false);
  game = reload(game);
  game.lookTarget(target("ledger"));
  game.takeTarget(target("ballot_box"));
  assert.equal(game.message, objectRemark(target("ballot_box").id, "take", game.state.language));
  use(game, jarExchangeRule);
  game = reload(game);
  assert.equal(game.inventory.has("item.pickle_jar"), false);
  assert.equal(game.targetAvailable(target("jar")), false);
  assert.equal(game.targetAvailable(target("replacement")), true);
  game.takeTarget(target("replacement"));
  assert.equal(game.inventory.has("item.pickle_jar"), false);
  game.takeTarget(target("ballot_box"));
  assert.equal(game.inventory.has("item.ballot_box"), true);
  assert.ok(game.state.completedQuests.includes("quest.chapter1.ballot_box"));
  game = reload(game);
  assert.equal(firstMatchingRule(archiveEntryRules, game.effectContext()).messageKey, "archive.finished");
  game.takeTarget(target("ballot_box"));
  assert.equal(game.state.inventory.filter(id => id === "item.ballot_box").length, 1);
});
test("dropped jar is never duplicated; closeup prevents invisible dropped piles", () => {
  const game = make({ flags: { archiveOpened: true }, inventory: [], droppedItems: [{ itemId: "item.pickle_jar", sceneId: "scene.chapter1.municipality" }] });
  assert.equal(game.targetAvailable(target("jar")), false);
  game.inventory.add("item.accordion");
  assert.equal(game.dropInventoryItem(game.content.items["item.accordion"]), false);
  assert.equal(game.inventory.has("item.accordion"), true);
  assert.equal(game.state.droppedItems.length, 1);
});
test("archive closeup skips movement, has return navigation and hides collected props", () => {
  const game = make({ flags: { archiveOpened: true }, inventory: ["item.pickle_jar"] });
  assert.equal(game.shouldApproachTargetBeforeAction(target("ledger")), false);
  assert.equal(findTargetAt(archiveScene, { x: 5, y: 5 }, t => game.targetAvailable(t)), undefined);
  game.handleWorldClick({ x: 5, y: 5 });
  assert.equal(game.player.target, undefined);
  const renderer = Object.create(Renderer.prototype);
  renderer.game = game;
  const jarLayer = archiveScene.foregroundLayers.find(l => l.asset === "jar");
  assert.equal(renderer.sceneLayerVisible(jarLayer), false);
  assert.equal(archiveScene.returnExitId, undefined);
  const back = archiveScene.exits.find(e => e.id === "exit.archive.to_municipality");
  assert.equal(findTargetAt(archiveScene, { x: 640, y: 610 }, t => game.targetAvailable(t)), back);
  game.state.flags.archiveOpened = false;
  assert.equal(game.targetAvailable(back), false);
  assert.equal(target("handle").useRules[0].sceneTransition.sceneId, back.targetSceneId);
  assert.equal(back.targetSceneId, "scene.chapter1.municipality");
  assert.equal(isWalkable(game.content.scenes[back.targetSceneId], back.targetPosition), true);
});
test("legacy carried, dropped and delivered boxes bypass archive without resetting progress", () => {
  for (const extra of [{inventory:["item.ballot_box"]}, {droppedItems:[{ itemId:"item.ballot_box",sceneId:"scene.chapter1.mehana"}]}, {ballotBoxDelivered:true}, {flags:{ballotBoxRecovered:true}}]) {
    const game = reload(make(extra));
    assert.equal(game.state.flags.candidateRegistrationStamped, true);
    assert.equal(game.state.flags.ballotBoxRecovered, true);
    assert.ok(game.state.completedQuests.includes("quest.chapter1.ballot_box"));
    assert.equal(firstMatchingRule(archiveEntryRules, game.effectContext()).messageKey,"archive.finished");
  }
});
test("clerk hints advance with archive state and every archive line is bilingual", () => {
  const game = make();
  for (const [flag, message] of [[null,"archive.clerk_location"],["archiveHandleInspected","archive.clerk_strap"],["archiveOpened","archive.clerk_ledger"],["archiveLedgerRead","archive.clerk_replace"],["archiveJarPlaced","archive.clerk_take"],["ballotBoxRecovered","archive.finished"]]) {
    if(flag) game.state.flags[flag] = true;
    const matches = clerkArchiveChoices.filter(choice => requirementsMet(choice.requirements,game.effectContext()));
    assert.equal(matches.length,1);
    assert.equal(matches[0].effect.messageKey,message);
  }
  assert.deepEqual(Object.keys(archiveEn).sort(),Object.keys(archiveBg).sort());
  assert.ok(Object.values(archiveBg).every(Boolean));
});
