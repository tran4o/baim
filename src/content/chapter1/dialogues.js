import { electionDialogue } from "./election.js";
import { wireRegistrationDialogues } from "./registration.js";
import { babaFountainDialogue, oilRefillRule } from "./fountain.js";
import { campaignDialogues } from "./campaign.js";

const baseDialogues = [
  electionDialogue,
  ...campaignDialogues,
  {
    id: "dialogue.municipality_clerk",
    npcId: "npc.municipality_clerk",
    nodes: {
      start: {
        lineKey: "dialogue.municipality_clerk.start",
        choices: [
          {
            textKey: "dialogue.municipality_clerk.choice.present_credentials",
            requirements: {
              items: ["item.fake_diploma"],
              notFlags: ["municipalityCredentialsAccepted"]
            },
            next: "credentials_accepted",
            effect: {
              effects: [{ type: "setFlag", key: "municipalityCredentialsAccepted" }]
            }
          },
          {
            textKey: "dialogue.municipality_clerk.choice.ask_registration",
            requirements: { notFlags: ["municipalityCredentialsAccepted"] },
            next: "credentials_missing",
            effect: {
              effects: [{ type: "setFlag", key: "municipalityCredentialsHinted" }]
            }
          },
          {
            textKey: "dialogue.municipality_clerk.choice.registration_status",
            requirements: {
              flags: ["municipalityCredentialsAccepted"],
              notFlags: ["candidateRegistrationStamped"]
            },
            next: "credentials_registered"
          },
          {
            textKey: "dialogue.municipality_clerk.choice.registration_status",
            requirements: { flags: ["candidateRegistrationStamped"] },
            next: "registration_stamped"
          },
          { textKey: "dialogue.municipality_clerk.choice.leave" }
        ]
      },
      credentials_missing: {
        lineKey: "dialogue.municipality_clerk.credentials_missing",
        choicesFrom: "start"
      },
      credentials_accepted: {
        lineKey: "dialogue.municipality_clerk.credentials_accepted",
        choices: [{ textKey: "dialogue.municipality_clerk.choice.leave" }]
      },
      credentials_registered: {
        lineKey: "dialogue.municipality_clerk.credentials_registered",
        choicesFrom: "start"
      },
      registration_stamped: {
        lineKey: "dialogue.municipality_clerk.registration_stamped",
        choicesFrom: "start"
      }
    }
  },
  {
    id: "dialogue.square.mehana_menu",
    nodes: {
      start: {
        lineKey: "dialogue.square.mehana_menu.title",
        entries: [
          { kind: "heading", textKey: "dialogue.square.mehana_menu.food_heading" },
          { textKey: "dialogue.square.mehana_menu.meatballs" },
          { textKey: "dialogue.square.mehana_menu.shopska" },
          { textKey: "dialogue.square.mehana_menu.mash" },
          { kind: "heading", textKey: "dialogue.square.mehana_menu.drinks_heading" },
          { textKey: "dialogue.square.mehana_menu.rakia" },
          { textKey: "dialogue.square.mehana_menu.wine" },
          { textKey: "dialogue.square.mehana_menu.beer" },
          { textKey: "dialogue.square.mehana_menu.water" }
        ],
        choices: [{ textKey: "dialogue.square.mehana_menu.close" }]
      }
    }
  },
  {
    id: "dialogue.tony_fridge",
    npcId: "npc.tony_fridge",
    nodes: {
      start: {
        lineKey: "dialogue.tony.start",
        choices: [
          {
            textKey: "dialogue.tony.choice.challenge",
            requirements: {
              notFlags: ["tonyChallengeStarted"],
              state: { tonyVote: false }
            },
            next: "challenge"
          },
          {
            textKey: "dialogue.tony.choice.challenge_status",
            requirements: {
              flags: ["tonyChallengeStarted"],
              state: { swappedOwnRakiaWithWater: false, tonyVote: false }
            },
            next: "challenge_waiting"
          },
          {
            textKey: "dialogue.tony.choice.finish_challenge",
            requirements: { state: { swappedOwnRakiaWithWater: true, tonyVote: false } },
            next: "contest_result",
            effect: {
              effects: [
                { type: "setFlag", key: "tonyChallengeResolved" },
                { type: "setState", key: "tonyVote", value: true },
                { type: "setState", key: "tonyFavorOwed", value: true },
                { type: "adjustState", key: "influence", amount: 25 },
                { type: "adjustState", key: "suspicion", amount: 10 },
                { type: "adjustState", key: "publicMood", amount: 5 },
                { type: "completeQuest", questId: "quest.chapter1.tony_vote" }
              ]
            }
          },
          {
            textKey: "dialogue.tony.choice.confirm_support",
            requirements: { state: { tonyVote: true } },
            next: "support_confirmed"
          },
          { textKey: "dialogue.tony.choice.politics", next: "politics" },
          { textKey: "dialogue.tony.choice.leave" }
        ]
      },
      politics: {
        lineKey: "dialogue.tony.politics",
        choicesFrom: "start"
      },
      challenge: {
        lineKey: "dialogue.tony.challenge",
        choices: [
          {
            textKey: "dialogue.tony.choice.accept",
            next: "challenge_accepted",
            effect: {
              effects: [
                { type: "setFlag", key: "tonyChallengeStarted" },
                { type: "setFlag", key: "tonyChallengeDeferred", value: false }
              ]
            }
          },
          {
            textKey: "dialogue.tony.choice.refuse",
            next: "challenge_deferred",
            effect: {
              effects: [{ type: "setFlag", key: "tonyChallengeDeferred" }]
            }
          }
        ]
      },
      challenge_accepted: {
        lineKey: "dialogue.tony.challenge_accepted",
        reactionId: "confident_chuckle",
        choices: [{ textKey: "dialogue.tony.choice.prepare" }]
      },
      challenge_deferred: {
        lineKey: "dialogue.tony.challenge_deferred",
        reactionId: "slow_anger",
        choices: [{ textKey: "dialogue.tony.choice.prepare" }]
      },
      challenge_waiting: {
        lineKey: "dialogue.tony.challenge_waiting",
        reactionId: "skeptical_glance",
        choicesFrom: "start"
      },
      contest_result: {
        lineKey: "dialogue.tony.contest_result",
        reactionId: "approving_nod",
        choices: [{ textKey: "dialogue.tony.choice.leave" }]
      },
      support_confirmed: {
        lineKey: "dialogue.tony.support_confirmed",
        choicesFrom: "start"
      }
    }
  },
  babaFountainDialogue,
  {
    id: "dialogue.mehana_waiter",
    npcId: "npc.mehana_waiter",
    nodes: {
      start: {
        lineKey: "dialogue.waiter.start",
        choices: [
          {
            textKey: "fountain.kiro.choice.refill",
            requirements: oilRefillRule.requirements,
            effect: { ...oilRefillRule, sceneSequence: "kiro-oil-handover" }
          },
          { textKey: "fountain.kiro.choice.hint", next: "fountain_oil_hint" },
          {
            textKey: "dialogue.waiter.choice.rakia",
            next: "rakia_serving"
          },
          {
            textKey: "dialogue.waiter.choice.shopska",
            next: "shopska_serving"
          },
          {
            textKey: "dialogue.waiter.choice.tripe_soup",
            next: "tripe_soup_serving"
          },
          {
            textKey: "dialogue.waiter.choice.village_wine",
            next: "village_wine_serving"
          },
          {
            textKey: "dialogue.waiter.choice.tony_weakness",
            requirements: {
              flags: ["tonyChallengeDeferred"],
              notFlags: ["tonyChallengeStarted"],
              state: { tonyVote: false }
            },
            next: "tony_weakness"
          },
          {
            textKey: "dialogue.waiter.choice.tony_weakness",
            requirements: {
              flags: ["tonyChallengeStarted"],
              state: { tonyVote: false }
            },
            next: "tony_weakness"
          },
          { textKey: "dialogue.waiter.choice.people", next: "people" },
          { textKey: "dialogue.waiter.choice.leave" }
        ]
      },
      fountain_oil_hint: { lineKey: "fountain.kiro.hint", choicesFrom: "start" },
      people: {
        lineKey: "dialogue.waiter.people",
        choicesFrom: "start"
      },
      tony_weakness: {
        lineKey: "dialogue.waiter.tony_weakness",
        choicesFrom: "start"
      },
      rakia_serving: {
        lineKey: "dialogue.waiter.serving_question",
        choices: [
          {
            textKey: "dialogue.waiter.choice.for_here",
            effect: {
              effects: [
                { type: "setFlag", key: "mehanaOrderedRakia" },
                { type: "adjustState", key: "rakiaGlasses", amount: 1, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
              ],
              messageByState: {
                key: "rakiaGlasses",
                ranges: [
                  { max: 1, messageKey: "msg.rakia.level.daisy" },
                  { min: 2, max: 4, messageKey: "msg.rakia.level.merry" },
                  { min: 5, max: 7, messageKey: "msg.rakia.level.tipsy" },
                  { min: 8, messageKey: "msg.rakia.level.plastered" }
                ]
              }
            }
          },
          {
            textKey: "dialogue.waiter.choice.to_go",
            effect: {
              effects: [
                { type: "setFlag", key: "mehanaOrderedRakia" },
                { type: "addItem", itemId: "item.rakia" }
              ],
              messageKey: "msg.mehana.rakia_to_go"
            }
          }
        ]
      },
      shopska_serving: {
        lineKey: "dialogue.waiter.serving_question",
        choices: [
          {
            textKey: "dialogue.waiter.choice.for_here",
            effect: {
              effects: [{ type: "setFlag", key: "mehanaOrderedShopska" }],
              messageKey: "msg.mehana.shopska_ordered"
            }
          },
          {
            textKey: "dialogue.waiter.choice.to_go",
            effect: {
              effects: [
                { type: "setFlag", key: "mehanaOrderedShopska" },
                { type: "addItem", itemId: "item.shopska_salad" }
              ],
              messageKey: "msg.mehana.shopska_to_go"
            }
          }
        ]
      },
      tripe_soup_serving: {
        lineKey: "dialogue.waiter.serving_question",
        choices: [
          {
            textKey: "dialogue.waiter.choice.for_here",
            effect: {
              effects: [
                { type: "setFlag", key: "mehanaOrderedTripeSoup" },
                { type: "adjustState", key: "rakiaGlasses", amount: -2, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
              ],
              messageKey: "msg.mehana.tripe_soup"
            }
          },
          {
            textKey: "dialogue.waiter.choice.to_go",
            effect: {
              effects: [
                { type: "setFlag", key: "mehanaOrderedTripeSoup" },
                { type: "addItem", itemId: "item.tripe_soup" }
              ],
              messageKey: "msg.mehana.tripe_soup_to_go"
            }
          }
        ]
      },
      village_wine_serving: {
        lineKey: "dialogue.waiter.serving_question",
        choices: [
          {
            textKey: "dialogue.waiter.choice.for_here",
            effect: {
              effects: [
                { type: "setFlag", key: "mehanaOrderedVillageWine" },
                { type: "adjustState", key: "rakiaGlasses", amount: 1, min: 0, max: 10, timestampKey: "rakiaLastChangedAt" }
              ],
              messageKey: "msg.mehana.village_wine"
            }
          },
          {
            textKey: "dialogue.waiter.choice.to_go",
            effect: {
              effects: [
                { type: "setFlag", key: "mehanaOrderedVillageWine" },
                { type: "addItem", itemId: "item.village_wine" }
              ],
              messageKey: "msg.mehana.village_wine_to_go"
            }
          }
        ]
      }
    }
  },
  {
    id: "dialogue.journalist",
    npcId: "npc.journalist",
    nodes: {
      start: {
        lineKey: "dialogue.journalist.start",
        choices: [
          {
            textKey: "dialogue.journalist.choice.begin",
            requirements: { notFlags: ["journalistRoadsAnswered"] },
            next: "roads",
            effect: { effects: [{ type: "startQuest", questId: "quest.chapter1.journalist" }] }
          },
          {
            textKey: "dialogue.journalist.choice.continue",
            requirements: { flags: ["journalistRoadsAnswered"], notFlags: ["journalistComplaintsAnswered"] },
            next: "complaints"
          },
          {
            textKey: "dialogue.journalist.choice.continue",
            requirements: { flags: ["journalistComplaintsAnswered"], state: { journalistInterviewCompleted: false } },
            next: "ballot_box"
          },
          {
            textKey: "dialogue.journalist.choice.result",
            requirements: { state: { journalistInterviewCompleted: true } },
            next: "complete"
          },
          { textKey: "dialogue.journalist.choice.leave" }
        ]
      },
      roads: {
        lineKey: "dialogue.journalist.roads",
        choices: [
          {
            textKey: "dialogue.journalist.roads.choice.heritage",
            next: "complaints",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistRoadsAnswered" },
                { type: "adjustState", key: "publicMood", amount: 8, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 6, min: 0, max: 100 }
              ]
            }
          },
          {
            textKey: "dialogue.journalist.roads.choice.inventory",
            next: "complaints",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistRoadsAnswered" },
                { type: "adjustState", key: "influence", amount: 2, min: 0, max: 100 },
                { type: "adjustState", key: "publicMood", amount: -2, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 2, min: 0, max: 100 }
              ]
            }
          },
          {
            textKey: "dialogue.journalist.roads.choice.drive_around",
            next: "complaints",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistRoadsAnswered" },
                { type: "adjustState", key: "publicMood", amount: 3, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 1, min: 0, max: 100 }
              ]
            }
          }
        ]
      },
      complaints: {
        lineKey: "dialogue.journalist.complaints",
        choices: [
          {
            textKey: "dialogue.journalist.complaints.choice.counted",
            next: "ballot_box",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistComplaintsAnswered" },
                { type: "adjustState", key: "publicMood", amount: 5, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 4, min: 0, max: 100 }
              ]
            }
          },
          {
            textKey: "dialogue.journalist.complaints.choice.one_stop",
            next: "ballot_box",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistComplaintsAnswered" },
                { type: "adjustState", key: "publicMood", amount: 4, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 3, min: 0, max: 100 }
              ]
            }
          },
          {
            textKey: "dialogue.journalist.complaints.choice.not_ours",
            next: "ballot_box",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistComplaintsAnswered" },
                { type: "adjustState", key: "publicMood", amount: -4, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 1, min: 0, max: 100 }
              ]
            }
          }
        ]
      },
      ballot_box: {
        lineKey: "dialogue.journalist.ballot_box",
        choices: [
          {
            textKey: "dialogue.journalist.ballot_box.choice.pickles",
            next: "complete",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistBallotAnswered" },
                { type: "setState", key: "journalistSuspicionLevel", value: "medium" },
                { type: "setState", key: "journalistInterviewCompleted", value: true },
                { type: "adjustState", key: "publicMood", amount: 8, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 6, min: 0, max: 100 },
                { type: "completeQuest", questId: "quest.chapter1.journalist" }
              ]
            }
          },
          {
            textKey: "dialogue.journalist.ballot_box.choice.responsibility",
            next: "complete",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistBallotAnswered" },
                { type: "setState", key: "journalistSuspicionLevel", value: "low" },
                { type: "setState", key: "journalistInterviewCompleted", value: true },
                { type: "adjustState", key: "publicMood", amount: 4, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 3, min: 0, max: 100 },
                { type: "completeQuest", questId: "quest.chapter1.journalist" }
              ]
            }
          },
          {
            textKey: "dialogue.journalist.ballot_box.choice.training",
            next: "complete",
            effect: {
              effects: [
                { type: "setFlag", key: "journalistBallotAnswered" },
                { type: "setState", key: "journalistSuspicionLevel", value: "high" },
                { type: "setState", key: "journalistInterviewCompleted", value: true },
                { type: "adjustState", key: "publicMood", amount: 2, min: 0, max: 100 },
                { type: "adjustState", key: "suspicion", amount: 8, min: 0, max: 100 },
                { type: "completeQuest", questId: "quest.chapter1.journalist" }
              ]
            }
          }
        ]
      },
      complete: {
        lineKey: "dialogue.journalist.complete",
        choices: [{ textKey: "dialogue.journalist.choice.leave" }]
      }
    }
  }
];

export const dialogues = wireRegistrationDialogues(baseDialogues);
