import { accordionCue } from './audio.js';
import { normalizeFirstPhotoPuzzleSave } from './photoPuzzleBeginner.js';

const unfinished = { chapter1Completed: false };
export const adultPhotoReward = {
  requirements: { notFlags: ['adultPhotoTaken'], state: unfinished },
  effects: [{ type: 'setFlag', key: 'adultPhotoTaken' }, { type: 'addItem', itemId: 'item.mitko_photo' }],
  messageKey: 'photoquest.adult_found'
};
export const photoReward = {
  requirements: { notFlags: ['photoCupboardSolved'], state: unfinished },
  effects: [{ type: 'setFlag', key: 'photoCupboardSolved' }, { type: 'setFlag', key: 'childPhotoRecovered' }, { type: 'addItem', itemId: 'item.mitko_child_photo' }],
  messageKey: 'photoquest.photo_found'
};
export const childPhotoRecovery = {
  requirements: { flags: ['photoCupboardSolved'], notFlags: ['childPhotoRecovered'], state: unfinished },
  effects: [{ type: 'setFlag', key: 'childPhotoRecovered' }, { type: 'addItem', itemId: 'item.mitko_child_photo' }],
  messageKey: 'photoquest.photo_found'
};
export const pepaMusicRule = {
  itemId: 'item.accordion', targetIds: ['hotspot.square.kiosk'],
  requirements: { items: ['item.accordion'], notFlags: ['pepaMusicPlayed'], state: unfinished },
  soundCue: accordionCue,
  effects: [{ type: 'setFlag', key: 'pepaMusicPlayed' }], messageKey: 'photoquest.music_done'
};
export const pepaPosterRule = {
  requirements: { items: ['item.mitko_photo'], flags: ['pepaMusicPlayed'], notFlags: ['kioskPamphletsIssued', 'campaignPosted'], state: unfinished },
  effects: [{ type: 'addItem', itemId: 'item.campaign_pamphlets' }, { type: 'setFlag', key: 'kioskPamphletsIssued' }],
  messageKey: 'photoquest.poster_done'
};
export const pepaDiplomaRule = {
  requirements: { items: ['item.mitko_child_photo', 'item.tony_diploma'], flags: ['pepaMusicPlayed'], notFlags: ['pepaDiplomaAltered'], state: { ...unfinished, hasFakeDiploma: false } },
  effects: [{ type: 'removeItem', itemId: 'item.tony_diploma' }, { type: 'addItem', itemId: 'item.fake_diploma' },
    { type: 'setState', key: 'hasFakeDiploma', value: true }, { type: 'setFlag', key: 'pepaDiplomaAltered' }, { type: 'setFlag', key: 'childhoodDiplomaEdition' },
    { type: 'adjustState', key: 'suspicion', amount: 4 }],
  messageKey: 'photoquest.diploma_done'
};
export const pepaItemRules = [
  pepaMusicRule,
  { itemId: 'item.accordion', requirements: { flags: ['pepaMusicPlayed'] }, soundCue: accordionCue, effects: [], messageKey: 'photoquest.music_again' },
  { itemId: 'item.mitko_photo', ...pepaPosterRule },
  { itemId: 'item.mitko_child_photo', ...pepaDiplomaRule },
  { itemId: 'item.tony_diploma', ...pepaDiplomaRule },
  { itemId: 'item.mitko_photo', requirements: { notFlags: ['pepaMusicPlayed'] }, reject: true, messageKey: 'photoquest.music_first' },
  { itemId: 'item.mitko_photo', reject: true, messageKey: 'photoquest.adult_poster_only' },
  ...['item.mitko_child_photo','item.tony_diploma'].flatMap(itemId => [
    { itemId, requirements: { notFlags: ['pepaMusicPlayed'] }, reject: true, messageKey: 'photoquest.music_first' },
    { itemId, requirements: { absentItems: ['item.mitko_child_photo'] }, reject: true, messageKey: 'photoquest.need_photo' },
    { itemId, effects: [], messageKey: 'photoquest.pepa_waiting' }
  ]),
  { itemId: 'item.unpaid_bills', reject: true, messageKey: 'photoquest.bills_not_diploma' }
];
export const diplomaTakeRule = {
  requirements: { flags: ['tonyPassedOut'], notFlags: ['tonyDiplomaTaken'], state: unfinished },
  effects: [{ type: 'addItem', itemId: 'item.tony_diploma' }, { type: 'setFlag', key: 'tonyDiplomaTaken' }],
  messageKey: 'photoquest.diploma_taken'
};
export const photoQuestStages = [
  { id: 'stage.photo.adult', titleKey: 'photoquest.stage.adult', requirements: { notFlags: ['adultPhotoTaken', 'kioskPamphletsIssued', 'campaignPosted'], state: { hasFakeDiploma: false } } },
  { id: 'stage.photo.cupboard', titleKey: 'photoquest.stage.photo', requirements: { notFlags: ['photoCupboardSolved'], state: { hasFakeDiploma: false } } },
  { id: 'stage.photo.music', titleKey: 'photoquest.stage.music', requirements: { notFlags: ['pepaMusicPlayed'], state: { hasFakeDiploma: false } } },
  { id: 'stage.photo.tony', titleKey: 'photoquest.stage.tony', requirements: { notFlags: ['tonyPassedOut'], state: { hasFakeDiploma: false } } },
  { id: 'stage.photo.take_diploma', titleKey: 'photoquest.stage.take_diploma', requirements: { flags: ['tonyPassedOut'], notFlags: ['tonyDiplomaTaken'], state: { hasFakeDiploma: false } } },
  { id: 'stage.photo.pepa', titleKey: 'photoquest.stage.pepa', requirements: { flags: ['tonyDiplomaTaken'], state: { hasFakeDiploma: false } } }
];
export function normalizePhotoQuestSave(save, previousVersion = 0) {
  const version = typeof previousVersion === 'boolean' ? (previousVersion ? 0 : 2) : Number(previousVersion) || 0;
  const legacy = version < 2;
  normalizeFirstPhotoPuzzleSave(save);
  if (legacy && (save.hasFakeDiploma || save.inventory.includes('item.fake_diploma')
    || save.droppedItems.some(i => i.itemId === 'item.fake_diploma') || save.flags.candidateRegistrationStamped)) {
    save.flags.legacyPhotoCredentials = true; // Preserve earned papers; do not invent a played song/photo.
  }
  if (legacy && save.tonyVote && save.flags.tonyChallengeResolved) save.flags.tonyPassedOut = true;
  if (version < 3) {
    const possessed = id => save.inventory.includes(id) || save.droppedItems.some(i => i.itemId === id);
    if (possessed('item.mitko_photo') || save.flags.photoCupboardSolved || save.flags.kioskPamphletsIssued || save.flags.campaignPosted) save.flags.adultPhotoTaken = true;
    if (possessed('item.mitko_child_photo')) save.flags.childPhotoRecovered = true;
    // Solved v2 cupboards offer the new childhood photo on Use, without a replay.
    // Earned diploma editions are left unchanged; only a NEW transaction sets it.
  }
  save.photoQuestVersion = 3;
  return save;
}
