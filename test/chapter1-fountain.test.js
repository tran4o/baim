import test from "node:test";
import assert from "node:assert/strict";
import { chapter1 } from "../src/content/chapter1/index.js";
import { babaSupportRule, babaGiftRules, fountainLookRules, fountainUseRules, fountainItemRules, statueItemRules, oldMenRules, oilRefillRule, fountainQuestStages } from "../src/content/chapter1/fountain.js";
import { fountainBg, fountainEn } from "../src/content/localization/chapter1Fountain.js";
import { DEFAULT_SAVE, VERBS } from "../src/engine/ids.js";
import { InventorySystem } from "../src/engine/InventorySystem.js";
import { QuestSystem } from "../src/engine/QuestSystem.js";
import { SaveSystem } from "../src/engine/SaveSystem.js";
import { Game } from "../src/engine/Game.js";
import { Renderer } from "../src/engine/Renderer.js";
import { applyEffects, firstMatchingRule, requirementsMet } from "../src/engine/EffectSystem.js";

function context(overrides = {}) {
  const state = { ...structuredClone(DEFAULT_SAVE), ...overrides };
  const index = entries => Object.fromEntries(entries.map(entry => [entry.id, entry]));
  return { state, inventory: new InventorySystem(index(chapter1.items), state), quests: new QuestSystem(index(chapter1.quests), state) };
}
function apply(rule, ctx) {
  assert.ok(rule);
  assert.ok(requirementsMet(rule.requirements, ctx));
  applyEffects(rule.effects, ctx);
}
function reload(ctx) {
  let json;
  const save = new SaveSystem({ getItem() { return json; }, setItem(_key, value) { json = value; } });
  save.save(ctx.state);
  return context(save.load());
}
const square = chapter1.scenes.find(scene => scene.id === "scene.chapter1.village_square");
const mehana = chapter1.scenes.find(scene => scene.id === "scene.chapter1.mehana");

test("Baba support requires statue repair and reporting; progress survives intermediate reloads", () => {
  let ctx = context();
  const stage = () => firstMatchingRule(fountainQuestStages, ctx).id;
  assert.equal(stage(), "stage.baba.ask_terms");
  const baba = chapter1.dialogues.find(dialogue => dialogue.id === "dialogue.baba_stoyanka");
  apply(baba.nodes.start.choices.find(choice => choice.next === "vote_terms").effect, ctx);
  assert.equal(stage(), "stage.baba.inspect_fountain");
  apply(firstMatchingRule(fountainLookRules, ctx), ctx);
  assert.equal(stage(), "stage.baba.ask_chorus");
  apply(firstMatchingRule(oldMenRules, ctx), ctx);
  assert.equal(stage(), "stage.baba.find_oil");
  apply(oilRefillRule, ctx);
  assert.equal(stage(), "stage.baba.oil_valve");
  apply(firstMatchingRule(statueItemRules.filter(rule => rule.itemId === "item.sunflower_oil"), ctx), ctx);
  assert.equal(ctx.inventory.has("item.sunflower_oil"), false);
  assert.equal(ctx.state.babaStoyankaVote, false);
  assert.equal(requirementsMet(babaSupportRule.requirements, ctx), true);
  ctx = reload(ctx);
  assert.equal(stage(), "stage.baba.report_repair");
  apply(firstMatchingRule(fountainUseRules, ctx), ctx);
  assert.equal(stage(), "stage.baba.report_repair");
  assert.equal(ctx.state.babaStoyankaVote, false);
  ctx = reload(ctx);
  apply(babaSupportRule, ctx);
  assert.equal(ctx.state.babaStoyankaVote, true);
  assert.equal(ctx.state.babaTrust, "supportive");
  assert.equal(ctx.state.influence, 15);
  assert.equal(ctx.state.publicMood, 53);
  assert.equal(ctx.state.suspicion, 0);
  assert.ok(ctx.state.completedQuests.includes("quest.chapter1.baba_vote"));
  const meters = [ctx.state.influence, ctx.state.publicMood, ctx.state.suspicion];
  assert.equal(requirementsMet(babaSupportRule.requirements, ctx), false);
  for (let i = 0; i < 4; i++) apply(firstMatchingRule(fountainUseRules, ctx), ctx);
  assert.deepEqual([ctx.state.influence, ctx.state.publicMood, ctx.state.suspicion], meters);
  assert.equal(reload(ctx).state.flags.fountainRepaired, true);
});

test("gift dialogue and direct offers cannot buy support or consume puzzle items, even in old damaged-trust saves", () => {
  const baba = chapter1.dialogues.find(dialogue => dialogue.id === "dialogue.baba_stoyanka");
  const ctx = context({ inventory: babaGiftRules.map(rule => rule.itemId), babaCheapOfferAttempts: 4, flags: { babaRequiresBetterGift: true } });
  const before = [...ctx.state.inventory];
  for (const rule of babaGiftRules) {
    assert.ok(baba.nodes.start.choices.some(choice => choice.effect === rule));
    assert.ok(square.npcs.find(npc => npc.id === "npc.baba_stoyanka").itemUseRules.includes(rule));
    apply(rule, ctx);
    apply(rule, ctx);
  }
  assert.deepEqual(ctx.state.inventory, before);
  assert.equal(ctx.state.babaStoyankaVote, false);
  assert.equal(ctx.state.suspicion, 0);
  apply(firstMatchingRule(statueItemRules.filter(rule => rule.itemId === "item.sunflower_oil"), ctx), ctx);
  apply(firstMatchingRule(fountainUseRules, ctx), ctx);
  apply(babaSupportRule, ctx);
  assert.equal(ctx.state.babaStoyankaVote, true);
});

test("Kiro is the sole source; self-use preserves oil and dropped bottles prevent duplicate orders", () => {
  let ctx = context();
  const oil = mehana.interactables.find(target => target.id === "hotspot.mehana.oil");
  assert.equal(requirementsMet(oil.requirements, ctx), false);
  apply(oilRefillRule, ctx);
  const item = chapter1.items.find(item => item.id === "item.sunflower_oil");
  apply(item.selfUseRules[0], ctx);
  assert.equal(ctx.inventory.has(item.id), true);
  assert.equal(ctx.state.drankOilBeforeTonyChallenge, false);
  ctx.inventory.remove(item.id);
  ctx.state.droppedItems.push({ itemId: item.id, sceneId: mehana.id, position: { x: 800, y: 550 } });
  ctx = reload(ctx);
  assert.equal(requirementsMet(oilRefillRule.requirements, ctx), false);
  ctx.state.droppedItems = [];
  ctx.inventory.add(item.id);
  apply(firstMatchingRule(statueItemRules.filter(rule => rule.itemId === item.id), ctx), ctx);
  assert.equal(ctx.inventory.has("item.empty_rakia_bottle"), true);
  assert.equal(requirementsMet(oilRefillRule.requirements, ctx), false);
});

test("early repair works without visiting Baba or the chorus; repeated failures give a stronger hint", () => {
  const ctx = context({ inventory: ["item.sunflower_oil"] });
  const first = firstMatchingRule(fountainUseRules, ctx);
  apply(first, ctx);
  const hint = firstMatchingRule(fountainUseRules, ctx);
  assert.notEqual(first.messageKey, hint.messageKey);
  for (let i = 0; i < 3; i++) apply(hint, ctx);
  assert.equal(ctx.state.suspicion, 0);
  apply(firstMatchingRule(statueItemRules.filter(rule => rule.itemId === "item.sunflower_oil"), ctx), ctx);
  apply(firstMatchingRule(fountainUseRules, ctx), ctx);
  apply(babaSupportRule, ctx);
  assert.equal(ctx.state.babaStoyankaVote, true);
});

test("legacy votes remain earned without inventing a repair or granting a second reward", () => {
  const ctx = reload(context({ babaStoyankaVote: true, babaTrust: "traditional", influence: 15,
    completedQuests: ["quest.chapter1.baba_vote"], inventory: ["item.sunflower_oil"] }));
  assert.equal(ctx.state.flags.fountainRepaired, undefined);
  assert.equal(ctx.state.babaStoyankaVote, true);
  apply(firstMatchingRule(statueItemRules.filter(rule => rule.itemId === "item.sunflower_oil"), ctx), ctx);
  apply(firstMatchingRule(fountainUseRules, ctx), ctx);
  assert.equal(requirementsMet(babaSupportRule.requirements, ctx), false);
  assert.equal(ctx.state.influence, 15);
  assert.equal(ctx.state.babaTrust, "traditional");
});

test("finished loss saves do not reactivate expired Baba business or allow refill/support rewards", () => {
  const ctx = reload(context({ chapter1Completed: true, endingId: "ending.chapter1.loss", activeQuests: [],
    expiredQuests: ["quest.chapter1.baba_vote"], flags: { fountainRepaired: true } }));
  assert.deepEqual(ctx.state.activeQuests, []);
  assert.equal(requirementsMet(babaSupportRule.requirements, ctx), false);
  assert.equal(requirementsMet(oilRefillRule.requirements, ctx), false);
});

test("removed chorus has no invisible Talk target; the valve still provides its oil clue", () => {
  const ctx = context();
  assert.equal(square.interactables.find(target => target.id === "hotspot.square.old_men_bench"), undefined);
  const basin = square.interactables.find(target => target.id === "hotspot.square.fountain");
  const game = Object.create(Game.prototype);
  Object.assign(game, ctx, { selectedVerb: VERBS.USE, player: {},
    applyContentEffect(rule) { apply(rule, ctx); this.message = rule.messageKey; } });
  game.performTargetAction(basin);
  game.performTargetAction(basin);
  assert.equal(ctx.state.flags.fountainOilClue, true);
  assert.equal(game.message, "fountain.use.hint");
});

test("repaired fountain reveals shallow pool and statue stream, never retired tap", () => {
  assert.equal(square.effects.length, 1);
  assert.equal(square.effects[0].visibleWhenFlag, "fountainRepaired");
  assert.equal(square.effects[0].points[0].x, 543);
  const effect = square.foregroundLayers.find(layer => layer.asset === 'fountainShallowWater');
  assert.ok(effect);
  assert.equal(effect.animation, undefined);
  const renderer = Object.create(Renderer.prototype);
  renderer.game = { state: { flags: {} } };
  assert.equal(renderer.sceneLayerVisible(effect), false);
  renderer.game.state.flags.fountainRepaired = true;
  assert.equal(renderer.sceneLayerVisible(effect), true);
});

test("fountain dialogue, stages and feedback resolve in both languages; wine remains orderable", () => {
  assert.deepEqual(Object.keys(fountainBg).sort(), Object.keys(fountainEn).sort());
  for (const [, key] of JSON.stringify(chapter1).matchAll(/"(fountain\.[^"]+)"/g)) {
    assert.equal(typeof fountainBg[key], "string", key);
    assert.equal(typeof fountainEn[key], "string", key);
  }
  const waiter = chapter1.dialogues.find(dialogue => dialogue.id === "dialogue.mehana_waiter");
  assert.ok(waiter.nodes.start.choices.some(choice => choice.textKey === "dialogue.waiter.choice.village_wine" && !choice.requirements));
});
