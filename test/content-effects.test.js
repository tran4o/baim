import { registerRule } from "../src/content/chapter1/registration.js";
import test from "node:test";
import assert from "node:assert/strict";
import { applyEffects, firstMatchingRule, requirementsMet } from "../src/engine/EffectSystem.js";
import { chapter1 } from "../src/content/chapter1/index.js";

function inventoryWith(...initialItems) {
  const items = new Set(initialItems);
  return {
    has: (itemId) => items.has(itemId),
    add: (itemId) => items.add(itemId),
    remove: (itemId) => items.delete(itemId),
    replace: (itemId, next) => { if (!items.has(itemId) || items.has(next)) return false; items.delete(itemId); items.add(next); return true; }
  };
}

test("content requirements combine inventory, flags, and state values", () => {
  const context = {
    state: { flags: { challengeStarted: true }, voteWon: false },
    inventory: inventoryWith("item.accordion")
  };
  assert.equal(requirementsMet({
    items: ["item.accordion"],
    flags: ["challengeStarted"],
    notFlags: ["guardAlerted"],
    state: { voteWon: false }
  }, context), true);
  assert.equal(requirementsMet({ items: ["item.missing"] }, context), false);
  assert.equal(requirementsMet({ stateMin: { cheapOffers: 2 }, stateMax: { cheapOffers: 4 } }, {
    state: { cheapOffers: 3 }
  }), true);
  assert.equal(requirementsMet({ stateMin: { cheapOffers: 4 } }, { state: { cheapOffers: 3 } }), false);
  assert.equal(requirementsMet({ stateMax: { cheapOffers: 2 } }, { state: { cheapOffers: 3 } }), false);
});

test("content effects update reusable state, inventory, and quest systems", () => {
  const completed = [];
  const inventory = inventoryWith();
  const state = { influence: 2, flags: {} };
  applyEffects([
    { type: "setFlag", key: "npcDistracted" },
    { type: "setState", key: "voteWon", value: true },
    { type: "adjustState", key: "influence", amount: 5 },
    { type: "addItem", itemId: "item.example" },
    { type: "completeQuest", questId: "quest.example" }
  ], {
    state,
    inventory,
    quests: { complete: (questId) => completed.push(questId) }
  });
  assert.equal(state.flags.npcDistracted, true);
  assert.equal(state.voteWon, true);
  assert.equal(state.influence, 7);
  assert.equal(inventory.has("item.example"), true);
  assert.deepEqual(completed, ["quest.example"]);
});

test("bounded state effects clamp counters and record a deterministic change time", () => {
  const state = { rakiaGlasses: 9, flags: {} };
  applyEffects([
    { type: "adjustState", key: "rakiaGlasses", amount: 4, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
  ], { state, now: () => 123456 });
  assert.equal(state.rakiaGlasses, 10);
  assert.equal(state.rakiaLastChangedAt, 123456);

  applyEffects([
    { type: "adjustState", key: "rakiaGlasses", amount: -20, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
  ], { state, now: () => 789000 });
  assert.equal(state.rakiaGlasses, 0);
  assert.equal(state.rakiaLastChangedAt, null);
});

test("unknown content effect types fail loudly", () => {
  assert.throws(
    () => applyEffects([{ type: "misspelledEffect" }], { state: { flags: {} } }),
    /Unknown content effect type/
  );
});

test("Tony vote rules remain reachable with only the fountain water bottle", () => {
  const mehana = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.mehana");
  const accordion = chapter1.items.find((item) => item.id === "item.accordion");
  const tony = mehana.npcs.find((target) => target.id === "npc.tony_fridge");
  const mitkoGlass = mehana.interactables.find(
    (target) => target.id === "hotspot.mehana.bai_mitko_rakia_glass"
  );
  const tonyDialogue = chapter1.dialogues.find((dialogue) => dialogue.id === "dialogue.tony_fridge");
  const inventory = inventoryWith();
  const state = {
    tonyVote: false,
    swappedOwnRakiaWithWater: false,
    influence: 0,
    suspicion: 0,
    publicMood: 50,
    flags: { tonyChallengeStarted: true }
  };
  const completed = [];
  const context = {
    state,
    inventory,
    quests: { complete: (questId) => completed.push(questId) }
  };

  const distraction = firstMatchingRule(
    tony.itemUseRules.filter((rule) => rule.itemId === "item.accordion"),
    context
  );
  assert.equal(distraction, null);
  assert.equal(inventory.has(accordion.id), false);
  inventory.add("item.fountain_water_bottle");
  const swap = firstMatchingRule(
    mitkoGlass.itemUseRules.filter((rule) => rule.itemId === "item.fountain_water_bottle"),
    context
  );
  assert.equal(swap.messageKey, "msg.water_swap_ready");
  applyEffects(swap.effects, context);

  assert.equal(state.swappedOwnRakiaWithWater, true);
  assert.equal(state.tonyVote, false);
  const finish = firstMatchingRule(tonyDialogue.nodes.start.choices, context);
  const finishChoice = tonyDialogue.nodes.start.choices.find(
    (choice) => choice.textKey === "dialogue.tony.choice.finish_challenge"
  );
  assert.equal(finish, finishChoice);
  applyEffects(finishChoice.effect.effects, context);

  assert.equal(state.tonyVote, true);
  assert.equal(state.influence, 25);
  assert.equal(state.suspicion, 10);
  assert.equal(state.publicMood, 55);
  assert.equal(inventory.has("item.fountain_water_bottle"), false);
  assert.deepEqual(completed, ["quest.chapter1.tony_vote"]);
});

test("obsolete bills and envelope recipe cannot bypass the new diploma quest", () => {
  const bills = chapter1.items.find((item) => item.id === "item.unpaid_bills");
  const inventory = inventoryWith("item.unpaid_bills", "item.empty_envelope");
  const state = {
    hasUnpaidBills: true,
    hasEmptyEnvelope: true,
    hasFakeDiploma: false,
    suspicion: 0,
    flags: {}
  };
  const completed = [];
  const context = {
    state,
    inventory,
    quests: { complete: (questId) => completed.push(questId) }
  };
  const assembly = firstMatchingRule(
    bills.itemUseRules.filter((rule) => rule.itemId === "item.empty_envelope"),
    context
  );

  assert.ok(assembly);
  applyEffects(assembly.effects, context);
  assert.equal(assembly.reject, true);
  assert.equal(inventory.has("item.unpaid_bills"), true);
  assert.equal(inventory.has("item.empty_envelope"), true);
  assert.equal(inventory.has("item.fake_diploma"), false);
  assert.equal(state.hasFakeDiploma, false);
  assert.equal(state.suspicion, 0);
  assert.deepEqual(completed, []);
});

test("fake diploma quest exposes its collection and assembly stages in order", () => {
  const quest = chapter1.quests.find((candidate) => candidate.id === "quest.chapter1.fake_diploma");
  const objectiveFor = (state, ...items) => firstMatchingRule(quest.stages, {
    state: { flags: {}, hasFakeDiploma: false, ...state },
    inventory: inventoryWith(...items)
  });

  assert.equal(objectiveFor({ hasUnpaidBills: false, hasEmptyEnvelope: false }).id,
    'stage.photo.adult');
  assert.equal(objectiveFor({ flags: { adultPhotoTaken: true } }, 'item.mitko_photo').id,
    'stage.photo.cupboard');
  assert.equal(objectiveFor({ flags: { adultPhotoTaken: true, photoCupboardSolved: true } }, 'item.mitko_photo', 'item.mitko_child_photo').id,
    'stage.photo.music');
  assert.equal(objectiveFor(
    { flags: { adultPhotoTaken: true, photoCupboardSolved: true, pepaMusicPlayed: true } }, 'item.mitko_photo', 'item.mitko_child_photo'
  ).id, 'stage.photo.tony');
});

test("the village-square envelope is a one-time recoverable diploma component", () => {
  const square = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.village_square");
  const envelope = square.interactables.find((target) => target.id === "hotspot.square.empty_envelope");

  assert.equal(envelope.takeItemId, "item.empty_envelope");
  assert.equal(envelope.flagOnTake, "hasEmptyEnvelope");
  assert.deepEqual(envelope.requirements, { state: { hasEmptyEnvelope: false } });
});

test("removed apartment papers have no pickup while old inventory items stay supported", () => {
  const apartment = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.apartment");
  const bills = apartment.interactables.find((target) => target.id === "hotspot.apartment.unpaid_bills");

  assert.equal(bills, undefined);
  assert.ok(chapter1.items.some(item=>item.id==='item.unpaid_bills'));
});

test("the municipality clerk checks but does not register an unstamped diploma", () => {
  const municipality = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.municipality");
  const clerk = municipality.npcs.find((npc) => npc.id === "npc.municipality_clerk");
  const inventory = inventoryWith("item.fake_diploma");
  const state = { flags: {}, chapter1Completed: false };
  const context = { state, inventory };
  const credentialRule = firstMatchingRule(
    clerk.itemUseRules.filter((rule) => rule.itemId === "item.fake_diploma"),
    context
  );

  assert.equal(credentialRule.messageKey, "registration.clerk_rejects");
  applyEffects(credentialRule.effects, context);
  assert.equal(state.flags.municipalityCredentialsAccepted, true);
  assert.equal(inventory.has("item.fake_diploma"), true);
  assert.equal(firstMatchingRule(
    clerk.itemUseRules.filter((rule) => rule.itemId === "item.fake_diploma"),
    context
  ).messageKey, "registration.clerk_rejects");
});

test("municipality dialogue exposes a recoverable credentials check", () => {
  const dialogue = chapter1.dialogues.find((candidate) => candidate.id === "dialogue.municipality_clerk");
  const choices = dialogue.nodes.start.choices;
  const withoutDiploma = { state: { flags: {}, chapter1Completed: false }, inventory: inventoryWith() };
  const withDiploma = { state: { flags: {}, chapter1Completed: false }, inventory: inventoryWith("item.fake_diploma") };
  const missingChoice = choices.find((choice) => choice.textKey === "registration.need" && requirementsMet(choice.requirements, withoutDiploma));
  const presentChoice = choices.find((choice) => choice.textKey === "registration.present" && !choice.requirements.flags);

  assert.equal(requirementsMet(missingChoice.requirements, withoutDiploma), true);
  assert.equal(requirementsMet(presentChoice.requirements, withoutDiploma), false);
  assert.equal(requirementsMet(presentChoice.requirements, withDiploma), true);
  applyEffects(presentChoice.effect.effects, withDiploma);
  assert.equal(withDiploma.state.flags.municipalityCredentialsAccepted, true);
});

test("Mayor-validated diploma enables clerk registration then the archive clue", () => {
  const municipality = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.municipality");
  const register = municipality.interactables.find(
    (target) => target.id === "hotspot.municipality.candidate_register"
  );
  const archive = municipality.interactables.find(
    (target) => target.id === "hotspot.municipality.archive_cabinet"
  );
  const inventory = inventoryWith("item.municipality_stamp", "item.fake_diploma");
  const state = {
    hasMunicipalityStamp: true,
    chapter1Completed: false,
    hasBallotBox: false,
    flags: { municipalityCredentialsAccepted: true, mayorDiplomaStamped: true }
  };
  const started = [];
  const context = {
    state,
    inventory,
    quests: { start: (questId) => started.push(questId), complete() {} }
  };

  const stamp = firstMatchingRule(register.itemUseRules, context);
  assert.equal(stamp.itemId, "item.municipality_stamp");
  applyEffects(stamp.effects, context);
  assert.equal(inventory.has("item.municipality_stamp"), true);
  assert.equal(state.flags.candidateRegistrationStamped, undefined);
  applyEffects(registerRule.effects, context);
  assert.equal(state.flags.candidateRegistrationStamped, true);

  const clue = firstMatchingRule(archive.useRules, context);
  assert.equal(clue.sceneTransition.sceneId, "scene.chapter1.archive");
  applyEffects(clue.effects, context);
  assert.equal(state.flags.ballotBoxArchiveClue, true);
  assert.deepEqual([...new Set(started)], ["quest.chapter1.ballot_box"]);

  const quest = chapter1.quests.find((candidate) => candidate.id === "quest.chapter1.ballot_box");
  assert.equal(firstMatchingRule(quest.stages, context).id, "stage.ballot_box.follow_archive_clue");
});

test("legacy cellar flags cannot expose a second ballot box", () => {
  const mehana = chapter1.scenes.find(scene => scene.id === "scene.chapter1.mehana");
  const box = mehana.interactables.find(target => target.id === "hotspot.mehana.ballot_box");
  assert.equal(requirementsMet(box.requirements, { state: { hasBallotBox: false, flags: { mehanaCellarOpened: true, ballotBoxArchiveClue: true } } }), false);
  assert.equal(box.takeItemId, undefined);
});

test("Tony quest exposes one outstanding objective for each unresolved puzzle stage", () => {
  const quest = chapter1.quests.find((candidate) => candidate.id === "quest.chapter1.tony_vote");
  const objectiveFor = (flags, state = {}) => firstMatchingRule(quest.stages, {
    state: { tonyVote: false, swappedOwnRakiaWithWater: false, flags, ...state },
    inventory: inventoryWith()
  });

  assert.equal(objectiveFor({}).id, "stage.tony.accept_challenge");
  assert.equal(objectiveFor({ tonyChallengeStarted: true }).id, "stage.tony.swap_water");
  assert.equal(objectiveFor({ tonyChallengeStarted: true, tonyDistracted: true }).id, "stage.tony.swap_water");
  assert.equal(objectiveFor(
    { tonyChallengeStarted: true, tonyDistracted: true },
    { swappedOwnRakiaWithWater: true }
  ).id, "stage.tony.finish_challenge");
});

test("refusing Tony safely defers the challenge, reveals Kiro's clue, and permits later acceptance", () => {
  const dialogue = chapter1.dialogues.find((candidate) => candidate.id === "dialogue.tony_fridge");
  const waiter = chapter1.dialogues.find((candidate) => candidate.id === "dialogue.mehana_waiter");
  const refuse = dialogue.nodes.challenge.choices.find(
    (choice) => choice.textKey === "dialogue.tony.choice.refuse"
  );
  const accept = dialogue.nodes.challenge.choices.find(
    (choice) => choice.textKey === "dialogue.tony.choice.accept"
  );
  const clue = waiter.nodes.start.choices.find(
    (choice) => choice.textKey === "dialogue.waiter.choice.tony_weakness"
      && choice.requirements.notFlags?.includes("tonyChallengeStarted")
  );
  const state = {
    tonyVote: false,
    swappedOwnRakiaWithWater: false,
    suspicion: 7,
    flags: {}
  };
  const context = { state, inventory: inventoryWith() };

  applyEffects(refuse.effect.effects, context);
  assert.equal(state.flags.tonyChallengeDeferred, true);
  assert.equal(state.flags.tonyChallengeStarted, undefined);
  assert.equal(state.suspicion, 7);
  assert.equal(requirementsMet(clue.requirements, context), true);
  const challengeAgain = dialogue.nodes.start.choices.find(
    (choice) => choice.textKey === "dialogue.tony.choice.challenge"
  );
  assert.equal(requirementsMet(challengeAgain.requirements, context), true);

  applyEffects(accept.effect.effects, context);
  assert.equal(state.flags.tonyChallengeStarted, true);
  assert.equal(state.flags.tonyChallengeDeferred, false);
});

test("Tony water preparation needs no distraction, adds no suspicion and cannot consume twice", () => {
  const mehana = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.mehana");
  const mitkoGlass = mehana.interactables.find(
    (target) => target.id === "hotspot.mehana.bai_mitko_rakia_glass"
  );
  const inventory = inventoryWith("item.fountain_water_bottle");
  const state = {
    tonyVote: false,
    swappedOwnRakiaWithWater: false,
    suspicion: 0,
    flags: { tonyChallengeStarted: true }
  };
  const context = { state, inventory };
  const waterRules = mitkoGlass.itemUseRules.filter((rule) => rule.itemId === "item.fountain_water_bottle");

  const caught = firstMatchingRule(waterRules, context);
  assert.equal(caught.messageKey, "msg.water_swap_ready");
  applyEffects(caught.effects, context);
  assert.equal(state.flags.tonyCaughtWaterAttempt, undefined);
  assert.equal(state.flags.tonyDistracted, undefined);
  assert.equal(state.flags.pepaMusicPlayed, undefined);
  assert.equal(state.swappedOwnRakiaWithWater, true);
  assert.equal(state.suspicion, 0);
  assert.equal(inventory.has("item.fountain_water_bottle"), false);
  assert.equal(inventory.has("item.empty_rakia_bottle"), true);

  const repeated = firstMatchingRule(waterRules, context);
  assert.equal(repeated, null);
  assert.equal(state.suspicion, 0);
  assert.equal(inventory.has("item.fountain_water_bottle"), false);
});

test("Tony's challenge invitation disappears after acceptance or vote completion", () => {
  const dialogue = chapter1.dialogues.find((candidate) => candidate.id === "dialogue.tony_fridge");
  const challenge = dialogue.nodes.start.choices.find(
    (choice) => choice.textKey === "dialogue.tony.choice.challenge"
  );
  const available = (state) => requirementsMet(challenge.requirements, {
    state,
    inventory: inventoryWith()
  });

  assert.equal(available({ tonyVote: false, flags: {} }), true);
  assert.equal(available({ tonyVote: false, flags: { tonyChallengeStarted: true } }), false);
  assert.equal(available({ tonyVote: true, flags: {} }), false);
});

test("Mehana waiter asks for here or to go before serving every order", () => {
  const waiterDialogue = chapter1.dialogues.find((dialogue) => dialogue.id === "dialogue.mehana_waiter");
  const choices = waiterDialogue.nodes.start.choices;
  const rakiaOrder = choices.find((choice) => choice.textKey === "dialogue.waiter.choice.rakia");
  const shopskaOrder = choices.find((choice) => choice.textKey === "dialogue.waiter.choice.shopska");
  const soupOrder = choices.find((choice) => choice.textKey === "dialogue.waiter.choice.tripe_soup");
  const wineOrder = choices.find((choice) => choice.textKey === "dialogue.waiter.choice.village_wine");
  assert.equal(rakiaOrder.next, "rakia_serving");
  assert.equal(shopskaOrder.next, "shopska_serving");
  assert.equal(soupOrder.next, "tripe_soup_serving");
  assert.equal(wineOrder.next, "village_wine_serving");

  const forHere = (nodeId) => waiterDialogue.nodes[nodeId].choices
    .find((choice) => choice.textKey === "dialogue.waiter.choice.for_here");
  const toGo = (nodeId) => waiterDialogue.nodes[nodeId].choices
    .find((choice) => choice.textKey === "dialogue.waiter.choice.to_go");
  const inventory = inventoryWith();
  const state = { flags: {}, rakiaGlasses: 4 };

  applyEffects(forHere("rakia_serving").effect.effects, { state, inventory });
  applyEffects(forHere("shopska_serving").effect.effects, { state, inventory });
  applyEffects(forHere("tripe_soup_serving").effect.effects, { state, inventory });
  applyEffects(forHere("village_wine_serving").effect.effects, { state, inventory });

  assert.equal(inventory.has("item.rakia"), false);
  assert.equal(inventory.has("item.shopska_salad"), false);
  assert.equal(inventory.has("item.tripe_soup"), false);
  assert.equal(inventory.has("item.village_wine"), false);
  assert.equal(state.flags.mehanaOrderedRakia, true);
  assert.equal(state.flags.mehanaOrderedShopska, true);
  assert.equal(state.flags.mehanaOrderedTripeSoup, true);
  assert.equal(state.rakiaGlasses, 4);

  const takeawayInventory = inventoryWith();
  const takeawayState = { flags: {}, rakiaGlasses: 0 };
  applyEffects(toGo("rakia_serving").effect.effects, { state: takeawayState, inventory: takeawayInventory });
  applyEffects(toGo("shopska_serving").effect.effects, { state: takeawayState, inventory: takeawayInventory });
  applyEffects(toGo("tripe_soup_serving").effect.effects, { state: takeawayState, inventory: takeawayInventory });
  applyEffects(toGo("village_wine_serving").effect.effects, { state: takeawayState, inventory: takeawayInventory });

  assert.equal(takeawayInventory.has("item.rakia"), true);
  assert.equal(takeawayInventory.has("item.shopska_salad"), true);
  assert.equal(takeawayInventory.has("item.tripe_soup"), true);
  assert.equal(takeawayInventory.has("item.village_wine"), true);
  assert.equal(takeawayState.rakiaGlasses, 0);
});

test("every takeaway Mehana purchase can be offered to each authored NPC", () => {
  const purchases = ["item.rakia", "item.shopska_salad", "item.tripe_soup", "item.village_wine"];
  const square = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.village_square");
  const mehana = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.mehana");
  const recipients = [
    square.npcs.find((npc) => npc.id === "npc.baba_stoyanka"),
    mehana.npcs.find((npc) => npc.id === "npc.mehana_waiter"),
    mehana.npcs.find((npc) => npc.id === "npc.tony_fridge")
  ];

  for (const recipient of recipients) {
    for (const itemId of purchases) {
      assert.ok(
        recipient.itemUseRules?.some((rule) => rule.itemId === itemId),
        `${itemId} should be offerable to ${recipient.id}`
      );
    }
  }
});

test("self-use rules consume refreshments and adjust intoxication in the intended direction", () => {
  const items = Object.fromEntries(chapter1.items.map((item) => [item.id, item]));
  const inventory = inventoryWith(
    "item.rakia", "item.village_wine", "item.glass_of_water", "item.tripe_soup", "item.shopska_salad"
  );
  const state = { rakiaGlasses: 4, rakiaLastChangedAt: 1, flags: {} };
  const context = { state, inventory, now: () => 123 };
  const useSelf = (itemId) => {
    const rule = firstMatchingRule(items[itemId].selfUseRules, context);
    assert.ok(rule);
    applyEffects(rule.effects, context);
  };

  useSelf("item.rakia");
  assert.equal(state.rakiaGlasses, 6);
  useSelf("item.village_wine");
  assert.equal(state.rakiaGlasses, 7);
  useSelf("item.glass_of_water");
  assert.equal(state.rakiaGlasses, 6);
  useSelf("item.shopska_salad");
  assert.equal(state.rakiaGlasses, 5);
  useSelf("item.tripe_soup");
  assert.equal(state.rakiaGlasses, 3);
  assert.equal(state.rakiaLastChangedAt, 123);
  assert.equal([
    "item.rakia", "item.village_wine", "item.glass_of_water", "item.shopska_salad", "item.tripe_soup"
  ].every((itemId) => !inventory.has(itemId)), true);
  assert.equal(items["item.accordion"].selfUseRules[0].effects.length, 0);
});

test("accordion target reactions remain non-consuming and data-driven", () => {
  const accordion = chapter1.items.find((item) => item.id === "item.accordion");
  assert.ok(accordion.targetUseRules.some((rule) => rule.targetIds?.includes("npc.baba_stoyanka")));
  assert.ok(accordion.targetUseRules.some((rule) => rule.targetKinds?.includes("npc")));
  assert.ok(accordion.targetUseRules.some((rule) => rule.targetTags?.includes("animal")));
  assert.equal(accordion.targetUseRules.every((rule) => (
    !rule.effects.some((effect) => effect.type === "removeItem" && effect.itemId === "item.accordion")
  )), true);
});

test("informational dialogue answers expose the parent options without a Back choice", () => {
  for (const dialogue of chapter1.dialogues) {
    for (const node of Object.values(dialogue.nodes)) {
      assert.equal(
        node.choices?.some((choice) => choice.textKey === "dialogue.common.back") || false,
        false,
        `${dialogue.id} should not author a Back-only answer step`
      );
      if (node.choicesFrom) assert.ok(dialogue.nodes[node.choicesFrom]);
    }
  }
});

test("Baba dialogue exposes a first-conversation choice that starts her vote quest", () => {
  const baba = chapter1.dialogues.find((dialogue) => dialogue.id === "dialogue.baba_stoyanka");
  const startChoice = baba.nodes.start.choices
    .find((choice) => choice.textKey === "dialogue.baba.choice.ask_vote");
  const started = [];
  const state = { flags: {}, babaStoyankaVote: false, chapter1Completed: false };

  assert.ok(startChoice);
  assert.equal(requirementsMet(startChoice.requirements, { state }), true);
  applyEffects(startChoice.effect.effects, {
    state,
    quests: { start: (questId) => started.push(questId), complete() {} }
  });

  assert.deepEqual(started, ["quest.chapter1.baba_vote"]);
  assert.equal(startChoice.next, "vote_terms");
  assert.equal(requirementsMet(startChoice.requirements, { state }), true);
});

test("apartment bottle, sofa-bed, water, and tripe soup author the intoxication loop", () => {
  const apartment = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.apartment");
  const mehana = chapter1.scenes.find((scene) => scene.id === "scene.chapter1.mehana");
  const waiter = chapter1.dialogues.find((dialogue) => dialogue.id === "dialogue.mehana_waiter");
  const bottle = apartment.interactables.find((target) => target.id === "hotspot.apartment.rakia_bottle");
  const bed = apartment.interactables.find((target) => target.id === "hotspot.apartment.bed");
  const water = chapter1.items.find(item=>item.id==='item.glass_of_water');
  const soup = waiter.nodes.tripe_soup_serving.choices
    .find((choice) => choice.textKey === "dialogue.waiter.choice.for_here");
  const inventory = inventoryWith("item.glass_of_water");
  const state = { rakiaGlasses: 5, tonyVote: false, flags: {} };
  const context = { state, inventory, now: () => 9000 };

  applyEffects(bottle.useRules[0].effects, context);
  assert.equal(state.rakiaGlasses, 6);
  applyEffects(bed.useRules[0].effects, context);
  assert.equal(state.rakiaGlasses, 3);
  applyEffects(firstMatchingRule(water.selfUseRules, context).effects, context);
  assert.equal(state.rakiaGlasses, 2);
  assert.equal(inventory.has("item.glass_of_water"), false);
  applyEffects(soup.effect.effects, context);
  assert.equal(state.rakiaGlasses, 0);
});
