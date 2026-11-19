const flags = {
  chapter1OpeningHeard: true, campaignPosted: true,
  municipalityCredentialsAccepted: true, mayorDiplomaStamped: true,
  candidateRegistrationStamped: true, ballotBoxRecovered: true,
  archiveOpened: true, archiveLedgerRead: true, archiveJarPlaced: true,
  fountainRepaired: true, electionCredentialsAnswered: true,
  electionEvidenceAnswered: true, electionContainerAnswered: true
};
const base = {
  currentSceneId: "scene.chapter1.election_booth", inventory: ["item.accordion", "item.fake_diploma", "item.ballot_box"],
  hasFakeDiploma: true, hasBallotBox: true, journalistInterviewCompleted: true,
  flags, babaStoyankaVote: true, tonyVote: true, influence: 40, publicMood: 75, suspicion: 15,
  activeQuests: ["quest.chapter1.main"], completedQuests: ["quest.chapter1.fake_diploma", "quest.chapter1.ballot_box", "quest.chapter1.journalist", "quest.chapter1.baba_vote", "quest.chapter1.tony_vote"]
};
export const reviewPresets = {
  election: { state: { ...base, flags: { ...flags, electionCredentialsAnswered: false, electionEvidenceAnswered: false, electionContainerAnswered: false } } },
  convincing_win: { state: { ...base }, resolveGroup: "ending.chapter1" },
  narrow_win: { state: { ...base, influence: 15, suspicion: 65, publicMood: 40 }, resolveGroup: "ending.chapter1" },
  loss: { state: { ...base, flags: { ...flags, fountainRepaired: false }, babaStoyankaVote: false, tonyVote: false, influence: 0, publicMood: 45,
    activeQuests: ["quest.chapter1.main", "quest.chapter1.baba_vote", "quest.chapter1.tony_vote"], completedQuests: ["quest.chapter1.fake_diploma", "quest.chapter1.ballot_box", "quest.chapter1.journalist"] }, resolveGroup: "ending.chapter1" }
};
