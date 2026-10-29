import { normalizeBottleSave } from "../content/chapter1/bottleSave.js";
import { normalizePhotoQuestSave } from '../content/chapter1/photoQuest.js';
import { DEFAULT_SAVE, SAVE_KEY } from "./ids.js";

export class SaveSystem {
  constructor(storage = globalThis.localStorage, key = SAVE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  load() {
    if (!this.storage) return structuredClone(DEFAULT_SAVE);
    const raw = this.storage.getItem(this.key);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    try {
      const parsed = JSON.parse(raw);
      return migrateSave({ ...structuredClone(DEFAULT_SAVE), ...parsed }, Number(parsed.photoQuestVersion) || 0);
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }

  save(state) {
    if (!this.storage) return;
    this.storage.setItem(this.key, JSON.stringify(state));
  }

  reset() {
    if (this.storage) this.storage.removeItem(this.key);
    return structuredClone(DEFAULT_SAVE);
  }
}

function migrateSave(save, previousPhotoVersion = 0) {
  const normalized = {
    ...save,
    audioVolume: Number.isFinite(Number(save.audioVolume)) ? Math.max(0, Math.min(1, Number(save.audioVolume))) : 0.6,
    flags: { ...(save.flags || {}) },
    inventory: Array.isArray(save.inventory) ? save.inventory : [],
    droppedItems: Array.isArray(save.droppedItems) ? save.droppedItems : [],
    activeQuests: Array.isArray(save.activeQuests) ? save.activeQuests : [],
    completedQuests: Array.isArray(save.completedQuests) ? save.completedQuests : [],
    expiredQuests: Array.isArray(save.expiredQuests) ? save.expiredQuests : []
  };
  normalizeBottleSave(normalized);
  normalizePhotoQuestSave(normalized, previousPhotoVersion);
  // Preserve earned registration in old saves, including saves from before the
  // registration flags existed. Never reopen a resolved chapter.
  if (!normalized.chapter1Completed) {
    if (normalized.hasBallotBox || normalized.inventory.includes("item.ballot_box") || normalized.droppedItems.some(record => record.itemId === "item.ballot_box") || normalized.flags.ballotBoxRecovered || normalized.ballotBoxDelivered) {
      normalized.flags.candidateRegistrationStamped = true;
      normalized.flags.ballotBoxRecovered = true;
      normalized.hasBallotBox = true;
      const boxQuest = "quest.chapter1.ballot_box";
      normalized.activeQuests = normalized.activeQuests.filter(id => id !== boxQuest);
      if (!normalized.completedQuests.includes(boxQuest)) normalized.completedQuests.push(boxQuest);
    }
    if (normalized.flags.candidateRegistrationStamped) {
      normalized.flags.mayorDiplomaStamped = true;
      normalized.flags.journalistInOffice = false;
    } else if (normalized.hasFakeDiploma) {
      const diplomaQuest = "quest.chapter1.fake_diploma";
      normalized.completedQuests = normalized.completedQuests.filter(id => id !== diplomaQuest);
      if (!normalized.activeQuests.includes(diplomaQuest) && !normalized.expiredQuests.includes(diplomaQuest)) normalized.activeQuests.push(diplomaQuest);
    }
  }
  const journalistQuestId = "quest.chapter1.journalist";
  if (
    normalized.hasBallotBox
    && !normalized.chapter1Completed
    && !normalized.journalistInterviewCompleted
    && !normalized.activeQuests.includes(journalistQuestId)
    && !normalized.completedQuests.includes(journalistQuestId)
  ) {
    normalized.activeQuests.push(journalistQuestId);
  }
  const babaQuestId = "quest.chapter1.baba_vote";
  if (
    !normalized.chapter1Completed
    && !normalized.expiredQuests.includes(babaQuestId)
    && !normalized.babaStoyankaVote
    && !normalized.activeQuests.includes(babaQuestId)
    && !normalized.completedQuests.includes(babaQuestId)
  ) {
    normalized.activeQuests.push(babaQuestId);
  }
  const oldStarterInventory = ["item.accordion", "item.unpaid_bills", "item.empty_envelope"];
  if (
    normalized.inventory.length === oldStarterInventory.length
    && oldStarterInventory.every((itemId) => normalized.inventory.includes(itemId))
    && !normalized.hasUnpaidBills
  ) {
    return { ...normalized, inventory: [] };
  }
  return normalized;
}
