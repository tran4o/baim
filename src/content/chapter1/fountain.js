const active = { chapter1Completed: false };
const startQuest = { type: "startQuest", questId: "quest.chapter1.baba_vote" };
const asked = { type: "setFlag", key: "babaFountainRequested" };
const diagnosed = { type: "setFlag", key: "fountainDiagnosed" };
const clue = { type: "setFlag", key: "fountainOilClue" };

export const fountainLookRules = [
  { requirements: { flags: ["fountainRepaired"] }, messageKey: "fountain.look.repaired" },
  { requirements: { flags: ["fountainValveOiled"] }, messageKey: "fountain.look.oiled" },
  { requirements: { state: active }, effects: [diagnosed], messageKey: "fountain.look.jammed" }
];

export const fountainUseRules = [
  { requirements: { flags: ["fountainRepaired"] }, messageKey: "fountain.use.already" },
  {
    requirements: { flags: ["fountainValveOiled"], state: active },
    effects: [{ type: "setFlag", key: "fountainRepaired" }],
    messageKey: "fountain.use.repaired"
  },
  {
    requirements: { flags: ["fountainValveTried"], state: active },
    effects: [diagnosed, clue], messageKey: "fountain.use.hint", reject: true
  },
  {
    requirements: { state: active },
    effects: [diagnosed, { type: "setFlag", key: "fountainValveTried" }],
    messageKey: "fountain.use.jammed", reject: true
  }
];

// Both targets reference these same rules: one reusable container, explicit Use only.
export const fountainRefillRules = [
  {
    itemId: "item.empty_rakia_bottle",
    requirements: { items: ["item.empty_rakia_bottle"], flags: ["fountainRepaired"], state: active },
    effects: [{ type: "replaceItem", itemId: "item.empty_rakia_bottle", withItemId: "item.fountain_water_bottle" }],
    messageKey: "bottle.filled"
  },
  {
    itemId: "item.empty_rakia_bottle",
    requirements: { items: ["item.empty_rakia_bottle"], notFlags: ["fountainRepaired"], state: active },
    messageKey: "bottle.no_flow", reject: true
  }
];

export const fountainRepairSequence = {
  id: "statue-fountain-repair", sceneId: "scene.chapter1.village_square",
  type: "fade", frames: [], durationMs: 850, commitAtMs: 350, revealAtMs: 500,
  requiredAssets: ["background", "fountainShallowWater", "fountainForeground"]
};

export const statueItemRules = [
  ...fountainRefillRules,
  {
    itemId: "item.sunflower_oil",
    requirements: { flags: ["fountainRepaired"] },
    messageKey: "fountain.oil.already", reject: true
  },
  {
    itemId: "item.sunflower_oil",
    requirements: { items: ["item.sunflower_oil"], notFlags: ["fountainRepaired"], state: active },
    sceneSequence: fountainRepairSequence.id,
    effects: [diagnosed, clue, { type: "replaceItem", itemId: "item.sunflower_oil", withItemId: "item.empty_rakia_bottle" },
      { type: "setFlag", key: "fountainValveOiled" }, { type: "setFlag", key: "fountainRepaired" }],
    messageKey: "fountain.oil.applied"
  },
  ...["item.rakia", "item.village_wine"].map(itemId => ({
    itemId, messageKey: "fountain.wrong_liquid", reject: true
  }))
];

export const fountainItemRules = [
  ...fountainRefillRules,
  { itemId: "item.sunflower_oil", messageKey: "fountain.oil.statue_only", reject: true },
  ...statueItemRules.filter(rule => ["item.rakia", "item.village_wine"].includes(rule.itemId))
];

export const oldMenRules = [
  { requirements: { flags: ["fountainRepaired"] }, messageKey: "fountain.chorus.repaired" },
  { requirements: { flags: ["fountainValveOiled"] }, messageKey: "fountain.chorus.oiled" },
  { requirements: { state: active }, effects: [diagnosed, clue], messageKey: "fountain.chorus.clue" }
];

export const babaSupportRule = {
  requirements: { flags: ["fountainRepaired"], state: { ...active, babaStoyankaVote: false } },
  effects: [
    { type: "setState", key: "babaStoyankaVote", value: true },
    { type: "setState", key: "babaTrust", value: "supportive" },
    { type: "adjustState", key: "influence", amount: 15 },
    { type: "adjustState", key: "publicMood", amount: 3 },
    { type: "completeQuest", questId: "quest.chapter1.baba_vote" }
  ],
  messageKey: "fountain.baba.support"
};

const giftKeys = [
  ["item.unpaid_bills", "offer_bills"],
  ["item.shopska_salad", "offer_shopska"], ["item.tripe_soup", "offer_tripe_soup"],
  ["item.rakia", "offer_rakia"], ["item.sunflower_oil", "offer_oil"],
  ["item.village_wine", "offer_wine"]
];

export const babaGiftRules = giftKeys.map(([itemId]) => ({
  itemId,
  requirements: { items: [itemId], state: { ...active, babaStoyankaVote: false } },
  effects: [startQuest, asked],
  messageKey: itemId === "item.sunflower_oil" ? "fountain.baba.oil" : "fountain.baba.no_gifts",
  reject: true
}));

export const babaFountainDialogue = {
  id: "dialogue.baba_stoyanka", npcId: "npc.baba_stoyanka",
  nodes: {
    start: {
      lineKey: "dialogue.baba.start",
      choices: [
        { textKey: "fountain.baba.choice.report", requirements: babaSupportRule.requirements, effect: babaSupportRule },
        {
          textKey: "dialogue.baba.choice.ask_vote",
          requirements: { state: { ...active, babaStoyankaVote: false }, notFlags: ["fountainRepaired"] },
          next: "vote_terms", effect: { effects: [startQuest, asked] }
        },
        { textKey: "dialogue.baba.choice.tradition", next: "tradition" },
        { textKey: "dialogue.baba.choice.promise", next: "promise" },
        ...giftKeys.map(([, key], index) => ({ textKey: `dialogue.baba.choice.${key}`, effect: babaGiftRules[index] })),
        { textKey: "dialogue.baba.choice.confirm_vote", requirements: { state: { babaStoyankaVote: true } }, next: "vote_confirmed" },
        { textKey: "dialogue.baba.choice.leave" }
      ]
    },
    vote_terms: { lineKey: "fountain.baba.terms", choicesFrom: "start" },
    tradition: { lineKey: "fountain.baba.tradition", choicesFrom: "start" },
    promise: { lineKey: "fountain.baba.promise", reactionId: "skeptical_disapproval", choicesFrom: "start" },
    vote_confirmed: { lineKey: "fountain.baba.confirmed", reactionId: "delighted_approval", choicesFrom: "start" }
  }
};

export const oilRefillRule = {
  requirements: {
    absentItems: ["item.sunflower_oil", "item.fountain_water_bottle"],
    anyOf: [{ items: ["item.empty_rakia_bottle"] }, { absentItems: ["item.empty_rakia_bottle"] }],
    notFlags: ["fountainValveOiled", "fountainRepaired"], state: active
  },
  effects: [
    { type: "removeItem", itemId: "item.empty_rakia_bottle", requirements: { items: ["item.empty_rakia_bottle"] } },
    { type: "addItem", itemId: "item.sunflower_oil" },
    { type: "setState", key: "hasSunflowerOil", value: true }, diagnosed, clue
  ],
  messageKey: "fountain.kiro.refill"
};

export const fountainQuestStages = [
  { id: "stage.baba.report_repair", titleKey: "fountain.quest.report", requirements: { flags: ["fountainRepaired"] } },
  { id: "stage.baba.turn_valve", titleKey: "fountain.quest.operate", requirements: { flags: ["fountainValveOiled"] } },
  { id: "stage.baba.oil_valve", titleKey: "fountain.quest.oil", requirements: { items: ["item.sunflower_oil"] } },
  { id: "stage.baba.find_oil", titleKey: "fountain.quest.find_oil", requirements: { flags: ["fountainOilClue"] } },
  { id: "stage.baba.ask_chorus", titleKey: "fountain.quest.chorus", requirements: { flags: ["fountainDiagnosed"] } },
  { id: "stage.baba.inspect_fountain", titleKey: "fountain.quest.inspect", requirements: { flags: ["babaFountainRequested"] } },
  { id: "stage.baba.ask_terms", titleKey: "fountain.quest.ask" }
];
