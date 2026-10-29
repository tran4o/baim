import { electionStages } from "./election.js";
import { archiveStages } from "./archive.js";
import { registrationStages } from "./registration.js";
import { fountainQuestStages } from "./fountain.js";
import { photoQuestStages } from './photoQuest.js';

export const quests = [
  {
    id: "quest.chapter1.main", titleKey: "quest.chapter1.main.title",
    stages: [
      {
        id: "stage.main.hear_election",
        titleKey: "campaign.quest.opening",
        requirements: { notFlags: ["chapter1OpeningHeard", "campaignPosted"], state: { hasFakeDiploma: false } }
      },
      {
        id: "stage.main.prepare_campaign",
        titleKey: "photoquest.stage.pepa",
        requirements: { state: { hasFakeDiploma: false } }
      },
      {
        id: "stage.main.collect_pamphlets",
        titleKey: "campaign.quest.pamphlets",
        requirements: { notFlags: ["kioskPamphletsIssued", "campaignPosted"] }
      },
      {
        id: "stage.main.post_campaign",
        titleKey: "campaign.quest.post",
        requirements: { notFlags: ["campaignPosted"] }
      },
      ...registrationStages,
      ...electionStages
    ]
  },
  {
    id: "quest.chapter1.fake_diploma",
    titleKey: "quest.chapter1.fake_diploma.title",
    stages: [
      ...registrationStages.map(stage => ({ ...stage, id: stage.id.replace("registration", "fake_diploma"), requirements: { ...stage.requirements, state: { hasFakeDiploma: true } } })),
      ...photoQuestStages
    ]
  },
  { id: "quest.chapter1.baba_vote", titleKey: "quest.chapter1.baba_vote.title", stages: fountainQuestStages },
  {
    id: "quest.chapter1.tony_vote",
    titleKey: "quest.chapter1.tony_vote.title",
    stages: [
      {
        id: "stage.tony.accept_challenge",
        titleKey: "quest.chapter1.tony_vote.stage.accept_challenge",
        requirements: { notFlags: ["tonyChallengeStarted"] }
      },
      {
        id: "stage.tony.swap_water",
        titleKey: "quest.chapter1.tony_vote.stage.swap_water",
        requirements: {
          flags: ["tonyChallengeStarted"],
          state: { swappedOwnRakiaWithWater: false }
        }
      },
      {
        id: "stage.tony.finish_challenge",
        titleKey: "quest.chapter1.tony_vote.stage.finish_challenge",
        requirements: { state: { swappedOwnRakiaWithWater: true, tonyVote: false } }
      }
    ]
  },
  {
    id: "quest.chapter1.journalist",
    titleKey: "quest.chapter1.journalist.title",
    stages: [
      ...registrationStages.map(stage => ({ ...stage, id: stage.id.replace("registration", "journalist") })),
      {
        id: "stage.journalist.find_reporter",
        titleKey: "quest.chapter1.journalist.stage.find_reporter",
        requirements: { notFlags: ["journalistRoadsAnswered"], state: { journalistInterviewCompleted: false } }
      },
      {
        id: "stage.journalist.finish_interview",
        titleKey: "quest.chapter1.journalist.stage.finish_interview",
        requirements: { flags: ["journalistRoadsAnswered"], state: { journalistInterviewCompleted: false } }
      }
    ]
  },
  {
    id: "quest.chapter1.ballot_box",
    titleKey: "quest.chapter1.ballot_box.title",
    stages: archiveStages
  }
];
