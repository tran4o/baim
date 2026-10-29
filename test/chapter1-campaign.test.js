import test from "node:test";
import assert from "node:assert/strict";
import { chapter1 } from "../src/content/chapter1/index.js";
import { campaignDialogues, kioskPaperRule, kioskPamphletRule, campaignPosterRules } from "../src/content/chapter1/campaign.js";
import { campaignBg, campaignEn } from "../src/content/localization/chapter1Campaign.js";
import { pepaMusicRule, pepaPosterRule, pepaDiplomaRule } from '../src/content/chapter1/photoQuest.js';
import { Game } from "../src/engine/Game.js";
import { InventorySystem } from "../src/engine/InventorySystem.js";
import { QuestSystem } from "../src/engine/QuestSystem.js";
import { SaveSystem } from "../src/engine/SaveSystem.js";
import { DEFAULT_SAVE, VERBS } from "../src/engine/ids.js";
import { applyEffects, firstMatchingRule, requirementsMet } from "../src/engine/EffectSystem.js";

function context(overrides = {}) {
  const state = { ...structuredClone(DEFAULT_SAVE), ...overrides };
  const index = (entries) => Object.fromEntries(entries.map(entry => [entry.id, entry]));
  return {
    state,
    inventory: new InventorySystem(index(chapter1.items), state),
    quests: new QuestSystem(index(chapter1.quests), state)
  };
}

function target(id) {
  return chapter1.scenes.flatMap(scene => scene.interactables).find(entry => entry.id === id);
}

function use(rule, ctx) {
  assert.ok(requirementsMet(rule.requirements, ctx));
  applyEffects(rule.effects, ctx);
}

test("AD television retains a one-time opening and persistent recap without changing inventory or meters", () => {
  const ctx = context();
  const beforeInventory = [...ctx.state.inventory];
  const tv = target("hotspot.apartment.tv");
  const opening = firstMatchingRule(tv.lookRules, ctx);
  assert.equal(opening.messageKey, "campaign.opening");
  use(opening, ctx);
  assert.equal(firstMatchingRule(tv.lookRules, ctx).messageKey, "campaign.opening_recap");
  assert.deepEqual(ctx.state.inventory, beforeInventory);
  assert.equal(ctx.state.suspicion, 0);
  let saved;
  const saves = new SaveSystem({ setItem(_key, value) { saved = value; }, getItem() { return saved; } });
  saves.save(ctx.state);
  const restored = context(saves.load());
  assert.equal(firstMatchingRule(tv.useRules, restored).messageKey, "campaign.opening_recap");
  assert.equal(firstMatchingRule(tv.lookRules, context({ chapter1Completed: true })).messageKey, "campaign.opening_recap");
});

test("photo and music issue a poster once, preserve the photo, and posting survives reload", () => {
  const ctx = context({ inventory: ['item.mitko_photo', 'item.accordion'], hasUnpaidBills: true });
  const kiosk = target("hotspot.square.kiosk");
  use(pepaMusicRule, ctx); use(pepaPosterRule, ctx);
  assert.deepEqual(ctx.state.inventory.sort(), ['item.accordion', 'item.campaign_pamphlets', 'item.mitko_photo']);
  assert.equal(ctx.state.hasFakeDiploma, false);
  assert.equal(ctx.state.completedQuests.includes("quest.chapter1.fake_diploma"), false);
  assert.equal(ctx.state.suspicion, 0);
  assert.equal(requirementsMet(pepaPosterRule.requirements, ctx), false);
  assert.equal(target("hotspot.apartment.unpaid_bills"), undefined, 'removed table papers expose no pickup');
  assert.equal(requirementsMet(kioskPamphletRule.requirements, ctx), false);

  // Dropping papers must not allow a second issuance or posting without possession.
  ctx.inventory.remove("item.campaign_pamphlets");
  ctx.state.droppedItems.push({ itemId: "item.campaign_pamphlets", sceneId: "scene.chapter1.village_square", x: 600, y: 540 });
  assert.equal(firstMatchingRule(campaignPosterRules, ctx), null);
  assert.equal(requirementsMet(kioskPamphletRule.requirements, ctx), false);
  ctx.inventory.add("item.campaign_pamphlets");
  ctx.state.droppedItems = [];
  use(firstMatchingRule(campaignPosterRules, ctx), ctx);
  assert.equal(ctx.state.flags.campaignPosted, true);
  assert.equal(ctx.inventory.has("item.campaign_pamphlets"), false);
  assert.equal(ctx.inventory.has('item.mitko_photo'), true);
  use(firstMatchingRule(campaignPosterRules, ctx), ctx);
  assert.equal(ctx.state.suspicion, 0);
  assert.equal(firstMatchingRule(target("hotspot.square.poster_board").lookRules, ctx).messageKey, "campaign.poster.posted");

  let saved;
  const saves = new SaveSystem({ setItem(_key, value) { saved = value; }, getItem() { return saved; } });
  saves.save(ctx.state);
  const restored = context(saves.load());
  assert.equal(restored.state.flags.campaignPosted, true);
  assert.equal(requirementsMet(kioskPamphletRule.requirements, restored), false);
});

test("legacy credentials can collect pamphlets once without bills or additional suspicion", () => {
  const ctx = context({ hasFakeDiploma: true, inventory: ["item.fake_diploma"], flags: { legacyPhotoCredentials: true } });
  use(kioskPamphletRule, ctx);
  assert.equal(ctx.inventory.has("item.campaign_pamphlets"), true);
  assert.equal(ctx.state.suspicion, 0);
  assert.equal(requirementsMet(kioskPamphletRule.requirements, ctx), false);
  assert.equal(requirementsMet(kioskPaperRule.requirements, context()), false);
  assert.equal(requirementsMet(kioskPaperRule.requirements, context({ chapter1Completed: true, inventory: ["item.unpaid_bills"] })), false);
  assert.equal(requirementsMet(kioskPamphletRule.requirements, context({ chapter1Completed: true, hasFakeDiploma: true })), false);
});

test("kiosk dialogue and direct item handover share transaction requirements", () => {
  const choice = campaignDialogues[0].nodes.start.choices.find(entry => entry.effect === pepaDiplomaRule);
  assert.ok(choice);
  assert.equal(requirementsMet(choice.requirements, context()), false);
  assert.equal(requirementsMet(choice.requirements, context({ inventory: ['item.mitko_photo','item.tony_diploma'], flags: { pepaMusicPlayed: true } })), false);
  assert.equal(requirementsMet(choice.requirements, context({ inventory: ['item.mitko_child_photo','item.tony_diploma'], flags: { pepaMusicPlayed: true } })), true);
});

test("main quest guides opening, papers and posting, including legacy and dropped-paper states", () => {
  const ctx = context();
  const quest = chapter1.quests.find(entry => entry.id === "quest.chapter1.main");
  const stage = () => firstMatchingRule(quest.stages, ctx)?.id;
  assert.equal(stage(), "stage.main.hear_election");
  ctx.state.flags.chapter1OpeningHeard = true;
  assert.equal(stage(), "stage.main.prepare_campaign");
  ctx.state.hasFakeDiploma = true;
  ctx.state.flags.legacyPhotoCredentials = true;
  assert.equal(stage(), "stage.main.collect_pamphlets");
  use(kioskPamphletRule, ctx);
  assert.equal(stage(), "stage.main.post_campaign");
  ctx.inventory.remove("item.campaign_pamphlets");
  assert.equal(stage(), "stage.main.post_campaign");
  ctx.state.flags.campaignPosted = true;
  assert.equal(stage(), "stage.registration.evidence");
});

test("state-aware Look works through normal dispatch and after an authored approach sequence", () => {
  const ctx = context();
  const game = Object.create(Game.prototype);
  Object.assign(game, ctx, {
    selectedVerb: VERBS.LOOK,
    player: { animation: "idle" },
    t: key => key,
    save() {},
    renderUi() {},
    setStatusMessage(message) { this.message = message; },
    applyContentEffect(rule) { applyEffects(rule.effects, this.effectContext()); this.message = rule.messageKey; }
  });
  game.performTargetAction(target("hotspot.apartment.tv"));
  assert.equal(game.message, "campaign.opening");
  game.performTargetAction(target("hotspot.apartment.tv"));
  assert.equal(game.message, "campaign.opening_recap");
  ctx.state.flags.campaignPosted = true;
  const poster = target("hotspot.square.poster_board");
  game.completeInteractionActionSequence({ target: poster, verb: VERBS.LOOK, sequence: poster.actions.look });
  assert.equal(game.message, "campaign.poster.posted");
  game.performTargetAction({ id: "hotspot.other", lookKey: "look.other" });
  assert.equal(game.message, "look.other");
});

test("campaign strings and authored references are present in both languages", () => {
  assert.deepEqual(Object.keys(campaignBg).sort(), Object.keys(campaignEn).sort());
  const data = JSON.stringify([chapter1.scenes, chapter1.dialogues, chapter1.quests]);
  for (const [, key] of data.matchAll(/"(campaign\.[^"]+)"/g)) {
    assert.ok(campaignBg[key], `Missing Bulgarian: ${key}`);
    assert.ok(campaignEn[key], `Missing English: ${key}`);
    assert.equal(Array.isArray(campaignBg[key]), Array.isArray(campaignEn[key]));
  }
});
