import test from "node:test";
import assert from "node:assert/strict";
import { chapter1 } from "../src/content/chapter1/index.js";
import { DEFAULT_SAVE } from "../src/engine/ids.js";
import { InventorySystem } from "../src/engine/InventorySystem.js";
import { QuestSystem } from "../src/engine/QuestSystem.js";
import { SaveSystem } from "../src/engine/SaveSystem.js";
import { Renderer } from "../src/engine/Renderer.js";
import { Game } from "../src/engine/Game.js";
import { applyEffects, firstMatchingRule, requirementsMet } from "../src/engine/EffectSystem.js";
import { receiptRule, receiptHandover, stampRule, registerRule } from "../src/content/chapter1/registration.js";
import { campaignPosterRules } from "../src/content/chapter1/campaign.js";
import { registrationEn, registrationBg } from "../src/content/localization/chapter1Registration.js";

const index = entries => Object.fromEntries(entries.map(e => [e.id, e]));
const scene = id => chapter1.scenes.find(s => s.id === `scene.chapter1.${id}`);
const dialogue = id => chapter1.dialogues.find(d => d.id === `dialogue.${id}`);
function context(overrides = {}) {
  const state = { ...structuredClone(DEFAULT_SAVE), ...overrides };
  return { state, inventory: new InventorySystem(index(chapter1.items), state), quests: new QuestSystem(index(chapter1.quests), state) };
}
function apply(rule, ctx) {
  assert.ok(requirementsMet(rule.requirements, ctx));
  applyEffects(rule.effects, ctx);
}
function reload(ctx) {
  let json = JSON.stringify(ctx.state);
  const saves = new SaveSystem({ getItem: () => json, setItem: (_, value) => { json = value; } });
  return context(saves.load());
}
const clerk = scene("municipality").npcs.find(n => n.id === "npc.municipality_clerk");

test("campaign reveals journalist; she moves with receipt, witnesses stamp, then returns after registration", () => {
  let ctx = context({ inventory: ["item.campaign_pamphlets", "item.fake_diploma"], hasFakeDiploma: true });
  const reporter = scene("village_square").npcs.find(n => n.id === "npc.journalist");
  const witness = scene("mayor_office").npcs.find(n => n.id === "npc.journalist");
  assert.equal(requirementsMet(reporter.requirements, ctx), false);
  apply(campaignPosterRules[0], ctx);
  assert.equal(requirementsMet(reporter.requirements, ctx), true);
  assert.equal(requirementsMet(stampRule.requirements, ctx), false);
  apply(firstMatchingRule(clerk.itemUseRules, ctx), ctx);
  assert.equal(ctx.state.flags.candidateRegistrationStamped, undefined);
  apply(receiptRule, ctx);
  apply(receiptHandover, ctx);
  ctx = reload(ctx);
  assert.equal(ctx.inventory.has("item.suspicious_receipt"), false);
  assert.equal(requirementsMet(reporter.requirements, ctx), false);
  assert.equal(requirementsMet(witness.requirements, ctx), true);
  ctx.inventory.remove("item.fake_diploma");
  assert.equal(requirementsMet(stampRule.requirements, ctx), false);
  ctx.inventory.add("item.fake_diploma");
  apply(stampRule, ctx);
  ctx = reload(ctx);
  assert.equal(ctx.state.flags.candidateRegistrationStamped, undefined);
  assert.equal(ctx.state.completedQuests.includes("quest.chapter1.fake_diploma"), false);
  assert.equal(requirementsMet(stampRule.requirements, ctx), false);
  apply(firstMatchingRule(clerk.itemUseRules, ctx), ctx);
  assert.equal(ctx.state.flags.candidateRegistrationStamped, true);
  assert.equal(ctx.state.completedQuests.includes("quest.chapter1.fake_diploma"), true);
  assert.equal(requirementsMet(witness.requirements, ctx), false);
  assert.equal(requirementsMet(reporter.requirements, ctx), true);
  assert.equal(requirementsMet(registerRule.requirements, ctx), false);
});

test("Tony reward and Kiro fallback never duplicate carried, dropped or delivered evidence", () => {
  const win = dialogue("tony_fridge").nodes.start.choices.find(c => c.next === "contest_result");
  const fallback = dialogue("mehana_waiter").nodes.start.choices.find(c => c.textKey === "registration.kiro_receipt");
  const ctx = context({ swappedOwnRakiaWithWater: true });
  assert.equal(requirementsMet(fallback.requirements, ctx), false);
  apply(win.effect, ctx);
  assert.ok(ctx.inventory.has("item.suspicious_receipt"));
  ctx.state.flags.journalistEvidenceRequested = true;
  assert.equal(requirementsMet(fallback.requirements, ctx), false);
  ctx.inventory.remove("item.suspicious_receipt");
  ctx.state.droppedItems.push({ itemId: "item.suspicious_receipt", sceneId: scene("mehana").id, x: 700, y: 500 });
  assert.equal(requirementsMet(fallback.requirements, ctx), false);
  applyEffects(win.effect.effects, ctx);
  assert.equal(ctx.inventory.has("item.suspicious_receipt"), false);
  ctx.state.droppedItems = [];
  apply(fallback.effect, ctx);
  ctx.state.flags.campaignPosted = true;
  apply(receiptHandover, ctx);
  assert.equal(requirementsMet(fallback.requirements, ctx), false);
  const kiroFirst = context({ flags: { journalistEvidenceRequested: true }, swappedOwnRakiaWithWater: true });
  apply(fallback.effect, kiroFirst);
  apply(win.effect, kiroFirst);
  assert.equal(kiroFirst.state.inventory.filter(id => id === "item.suspicious_receipt").length, 1);
});

test("holding a legacy seal cannot register a fresh candidate or bypass the Mayor", () => {
  const ctx = context({ inventory: ["item.fake_diploma", "item.municipality_stamp"], flags: { municipalityCredentialsAccepted: true } });
  const desk = scene("municipality").interactables.find(t => t.id === "hotspot.municipality.stamp_desk");
  assert.equal(desk.takeItemId, undefined);
  const register = scene("municipality").interactables.find(t => t.id === "hotspot.municipality.candidate_register");
  apply(register.itemUseRules[0], ctx);
  assert.equal(ctx.state.flags.candidateRegistrationStamped, undefined);
  assert.equal(requirementsMet(stampRule.requirements, ctx), false);
  assert.equal(requirementsMet(registerRule.requirements, ctx), false);
});

test("older registered saves remain registered; early completed diploma quests reopen, resolved endings do not", () => {
  const old = reload(context({ flags: { candidateRegistrationStamped: true }, completedQuests: ["quest.chapter1.fake_diploma"] }));
  assert.equal(old.state.flags.mayorDiplomaStamped, true);
  assert.ok(old.state.completedQuests.includes("quest.chapter1.fake_diploma"));
  const early = reload(context({ hasFakeDiploma: true, completedQuests: ["quest.chapter1.fake_diploma"] }));
  assert.equal(early.state.completedQuests.includes("quest.chapter1.fake_diploma"), false);
  assert.ok(early.state.activeQuests.includes("quest.chapter1.fake_diploma"));
  const ended = context({ chapter1Completed: true, endingId: "ending.chapter1.loss", hasFakeDiploma: true, activeQuests: [], completedQuests: ["quest.chapter1.fake_diploma"] });
  assert.deepEqual(reload(ended).state, ended.state);
});

test("journalist art visibility follows her local NPC; registration translations are paired", () => {
  const ctx = context({ flags: { campaignPosted: true } });
  const game = Object.assign(Object.create(Game.prototype), ctx, { currentScene: scene("village_square") });
  const renderer = Object.assign(Object.create(Renderer.prototype), { game });
  const layer = game.currentScene.foregroundLayers.find(l => l.asset === "journalistStanding");
  assert.equal(renderer.sceneLayerVisible(layer), true);
  ctx.state.flags.journalistInOffice = true;
  assert.equal(renderer.sceneLayerVisible(layer), false);
  assert.deepEqual(Object.keys(registrationEn).sort(), Object.keys(registrationBg).sort());
});

test("visible doors explain campaign and evidence gates instead of allowing premature entry", () => {
  const ctx = context();
  const game = Object.assign(Object.create(Game.prototype), ctx, {
    player: {position:{x:1000,y:565},animation:'idle'},
    t: key => key,
    setStatusMessage(message) { this.message = message; },
    changeScene(id) { this.destination = id; }
  });
  const hallDoor = scene("village_square").exits.find(e => e.targetSceneId === scene("municipality").id);
  const officeDoor = scene("municipality").exits.find(e => e.targetSceneId === scene("mayor_office").id);
  game.performTargetAction(hallDoor);
  assert.equal(game.message, "registration.guard_blocked");
  assert.equal(game.destination, undefined);
  ctx.state.flags.campaignPosted = true;
  game.performTargetAction(hallDoor);
  assert.equal(game.destination, scene("municipality").id);
  game.performTargetAction(officeDoor);
  assert.equal(game.message, "registration.office_blocked");
  assert.equal(game.destination, scene("municipality").id);
  ctx.state.flags.journalistHasReceipt = true;
  game.performTargetAction(officeDoor);
  assert.equal(game.destination, scene("mayor_office").id);
});
