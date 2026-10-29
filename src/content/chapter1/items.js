import { accordionCue } from "./audio.js";
import { pepaMusicRule } from './photoQuest.js';
export const items = [
  { id: 'item.mitko_photo', nameKey: 'photoquest.photo_name', descriptionKey: 'photoquest.photo_desc' },
  { id: 'item.mitko_child_photo', nameKey: 'photoquest.child_name', descriptionKey: 'photoquest.child_desc' },
  { id: 'item.tony_diploma', nameKey: 'photoquest.diploma_name', descriptionKey: 'photoquest.diploma_desc' },
  { id: "item.empty_rakia_bottle", nameKey: "bottle.empty.name", descriptionKey: "bottle.empty.desc" },
  { id: "item.fountain_water_bottle", nameKey: "bottle.water.name", descriptionKey: "bottle.water.desc" },
  {
    id: "item.accordion",
    nameKey: "item.accordion.name",
    descriptionKey: "item.accordion.desc",
    selfUseRules: [{ soundCue: accordionCue, effects: [], messageKey: "msg.self.accordion" }],
    targetUseRules: [
      pepaMusicRule,
      {
        targetIds: ["npc.baba_stoyanka"],
        requirements: { state: { babaStoyankaVote: false } },
        soundCue: accordionCue, effects: [],
        messageKey: "msg.accordion_baba_before_vote"
      },
      {
        targetIds: ["npc.baba_stoyanka"],
        requirements: { state: { babaStoyankaVote: true } },
        soundCue: accordionCue, effects: [],
        messageKey: "msg.accordion_baba_after_vote"
      },
      {
        targetIds: ["npc.mehana_waiter"],
        soundCue: accordionCue, effects: [],
        messageKey: "msg.accordion_kiro"
      },
      {
        targetTags: ["animal"],
        soundCue: accordionCue, effects: [],
        messageKey: "msg.accordion_animal"
      },
      {
        targetKinds: ["npc"],
        soundCue: accordionCue, effects: [],
        messageKey: "msg.accordion_generic_npc"
      }
    ]
  },
  {
    id: "item.unpaid_bills",
    nameKey: "item.unpaid_bills.name",
    descriptionKey: "item.unpaid_bills.desc",
    itemUseRules: [
      {
        itemId: "item.empty_envelope",
        effects: [], reject: true,
        messageKey: 'photoquest.bills_not_diploma'
      }
    ]
  },
  { id: "item.empty_envelope", nameKey: "item.empty_envelope.name", descriptionKey: "item.empty_envelope.desc" },
  { id: "item.fake_diploma", nameKey: "item.fake_diploma.name", descriptionKey: "item.fake_diploma.desc",
    iconRules: [{ requirements: { flags: ["mayorDiplomaStamped"] }, slot: "stampedIcon" },
      { requirements: { flags: ['childhoodDiplomaEdition'] }, slot: 'childIcon' },
      { requirements: { flags: ['pepaDiplomaAltered'] }, slot: 'pepaIcon' }] },
  {
    id: "item.rakia",
    nameKey: "item.rakia.name",
    descriptionKey: "item.rakia.desc",
    selfUseRules: [{
      effects: [
        { type: "removeItem", itemId: "item.rakia" },
        { type: "adjustState", key: "rakiaGlasses", amount: 2, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
      ],
      messageKey: "msg.self.rakia"
    }]
  },
  {
    id: "item.shopska_salad",
    nameKey: "item.shopska_salad.name",
    descriptionKey: "item.shopska_salad.desc",
    selfUseRules: [{
      effects: [
        { type: "removeItem", itemId: "item.shopska_salad" },
        { type: "adjustState", key: "rakiaGlasses", amount: -1, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
      ],
      messageKey: "msg.self.shopska"
    }]
  },
  {
    id: "item.tripe_soup",
    nameKey: "item.tripe_soup.name",
    descriptionKey: "item.tripe_soup.desc",
    selfUseRules: [{
      effects: [
        { type: "removeItem", itemId: "item.tripe_soup" },
        { type: "adjustState", key: "rakiaGlasses", amount: -2, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
      ],
      messageKey: "msg.self.tripe_soup"
    }]
  },
  {
    id: "item.village_wine",
    nameKey: "item.village_wine.name",
    descriptionKey: "item.village_wine.desc",
    selfUseRules: [{
      effects: [
        { type: "removeItem", itemId: "item.village_wine" },
        { type: "adjustState", key: "rakiaGlasses", amount: 1, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
      ],
      messageKey: "msg.self.village_wine"
    }]
  },
  {
    id: "item.sunflower_oil",
    nameKey: "item.sunflower_oil.name",
    descriptionKey: "item.sunflower_oil.desc",
    selfUseRules: [{ effects: [], messageKey: "bottle.keep_oil", reject: true }]
  },
  {
    id: "item.glass_of_water",
    nameKey: "item.glass_of_water.name",
    descriptionKey: "item.glass_of_water.desc",
    selfUseRules: [{
      effects: [
        { type: "removeItem", itemId: "item.glass_of_water" },
        { type: "adjustState", key: "rakiaGlasses", amount: -1, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
      ],
      messageKey: "msg.self.water"
    }]
  },
  { id: "item.campaign_pamphlets", nameKey: "item.campaign_pamphlets.name", descriptionKey: "item.campaign_pamphlets.desc" },
  { id: "item.suspicious_receipt", nameKey: "item.suspicious_receipt.name", descriptionKey: "item.suspicious_receipt.desc" },
  { id: "item.pickle_jar", nameKey: "item.pickle_jar.name", descriptionKey: "item.pickle_jar.desc" },
  { id: "item.ballot_box", nameKey: "item.ballot_box.name", descriptionKey: "item.ballot_box.desc" },
  { id: "item.municipality_stamp", nameKey: "item.municipality_stamp.name", descriptionKey: "item.municipality_stamp.desc" }
];
