import { initialPhotoPuzzle } from '../content/chapter1/photoPuzzleBeginner.js';
export const LANGUAGES = ["bg", "en"];

export const VERBS = {
  LOOK: "look",
  TALK: "talk",
  USE: "use",
  TAKE: "take"
};

export const SAVE_KEY = "comrade-candidate.save.v1";

export const DEFAULT_SAVE = {
  photoQuestVersion: 3,
  photoPuzzle: initialPhotoPuzzle(),
  currentChapter: 1,
  chapter1Completed: false,
  endingId: null,
  currentSceneId: "scene.chapter1.apartment",
  language: "bg",
  audioEnabled: false,
  audioVolume: 0.6,
  influence: 0,
  suspicion: 0,
  publicMood: 50,
  rakiaGlasses: 0,
  rakiaLastChangedAt: null,
  babaCheapOfferAttempts: 0,
  inventory: [],
  droppedItems: [],
  hasAccordion: false,
  hasUnpaidBills: false,
  hasEmptyEnvelope: false,
  hasFakeDiploma: false,
  hasSunflowerOil: false,
  hasRakia: false,
  hasGlassOfWater: false,
  hasBallotBox: false,
  ballotBoxDelivered: false,
  hasMunicipalityStamp: false,
  babaStoyankaVote: false,
  tonyVote: false,
  journalistSuspicionLevel: "low",
  journalistInterviewCompleted: false,
  mayorDefeated: false,
  wonMunicipalSeat: false,
  tonyFavorOwed: false,
  babaTrust: "neutral",
  drankOilBeforeTonyChallenge: false,
  swappedOwnRakiaWithWater: false,
  triedToSwapTonysRakia: false,
  completedQuests: [],
  expiredQuests: [],
  activeQuests: [
    "quest.chapter1.main",
    "quest.chapter1.fake_diploma",
    "quest.chapter1.baba_vote",
    "quest.chapter1.tony_vote"
  ],
  flags: {},
  chapter1Choices: {}
};
