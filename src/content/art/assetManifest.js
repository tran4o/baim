import { kiroOilAssets } from "./kiroOilHandover.generated.js";
import { externalAnimationV1 } from "./externalAnimationRuntime.generated.js";
import { mitkoTurnPocketAssets } from "./mitkoTurnPocket.generated.js";
import { mitkoTurnAssets } from "./mitkoTurnPilot.generated.js";

export const assetManifest = {
  baseResolution: { width: 1280, height: 720 },
  runtimeSceneResolution: { width: 1280, height: 720 },
  scenes: {
    "scene.chapter1.archive": {
      background: "assets/chapter1/scenes/archive/open-v1.png",
      closed: "assets/chapter1/scenes/archive/closed-v1.png",
      jar: "assets/chapter1/scenes/archive/jar-v1.png",
      box: "assets/chapter1/scenes/archive/box-v1.png"
    },
    "scene.chapter1.apartment": {
      background: "assets/chapter1/scenes/apartment/background.png",
      droppedBelongingsPile: "assets/chapter1/items/dropped-belongings-pile-v1.png",
      foregroundTable: "assets/chapter1/scenes/apartment/foreground-table.png",
      billsOnTable: "assets/chapter1/scenes/apartment/bills-on-table.png",
      accordionOnChair: "assets/chapter1/scenes/apartment/accordion-on-chair.png",
      windowOpen: "assets/chapter1/scenes/apartment/window-open.png",
      windowOpenBack: "assets/chapter1/scenes/apartment/window-open-0.png"
    },
    "scene.chapter1.village_square": {
      campaignPoster: "assets/chapter1/scenes/village_square/campaign-poster-c05.png",
      fountainForeground: "assets/chapter1/scenes/village_square/fountain-foreground-c05.png",
      fountainShallowWater: "assets/chapter1/scenes/village_square/fountain-shallow-water-c05.png",
      squareFlagWind: "assets/chapter1/scenes/village_square/flag-wind-c01.png",
      squarePepaIdle: "assets/chapter1/scenes/village_square/pepa-idle-hydra-c14-r03.png",
      squarePepaStill: "assets/chapter1/scenes/village_square/pepa-idle-hydra-c14-r03-static.png",
      kioskCounterC05: "assets/chapter1/scenes/village_square/kiosk-counter-c05.png",
      electionSign: "assets/chapter1/scenes/village_square/election-sign-v1.png",
      journalistStanding: "assets/chapter1/characters/journalist/standing-v2.png",
      background: "assets/chapter1/scenes/village_square/background-redesign-c05.png",
      oldMenChorusSeated: "assets/chapter1/characters/old_men_chorus/seated-pair-v1.png",
      posterBefore: "assets/chapter1/scenes/village_square/poster-before-v1.png",
      babaStoyankaSeated: "assets/chapter1/characters/baba_stoyanka/seated-v2.png",
      babaStoyankaIdleSeated: "assets/chapter1/characters/baba_stoyanka/idle-seated-v1.webp",
      babaStoyankaTalkSeated: "assets/chapter1/characters/baba_stoyanka/talk-seated-v1.webp",
      babaStoyankaDelightedSeated: "assets/chapter1/characters/baba_stoyanka/delighted-seated-v1.webp",
      babaStoyankaSkepticalSeated: "assets/chapter1/characters/baba_stoyanka/skeptical-seated-v1.webp",
      kioskPapersPile: "assets/chapter1/scenes/village_square/kiosk-papers-pile-v1.png",
      droppedBelongingsPile: "assets/chapter1/items/dropped-belongings-pile-v1.png"
    },
    "scene.chapter1.mehana": {
      background: "assets/chapter1/scenes/mehana/background-clean-occlusion-v1.png",
      tonyTableOccluder: "assets/chapter1/scenes/mehana/tony-table-occluder-v1.png",
      leftTablePlayerOccluder: "assets/chapter1/scenes/mehana/left-table-player-occluder-v1.png",
      rightTablePlayerOccluder: "assets/chapter1/scenes/mehana/right-table-player-occluder-v1.png",
      ...kiroOilAssets,
      mehanaCounterFront: "assets/chapter1/scenes/mehana/kiro-counter-occluder-v1.png",
      mehanaCellarHatch: "assets/chapter1/scenes/mehana/cellar-hatch-preserved-v1.png",
      mehanaWaiterIdle: "assets/chapter1/characters/mehana_waiter/idle-bartender-v2.png",
      mehanaWaiterPolishingIdle: "assets/chapter1/characters/mehana_waiter/kiro-polishing-idle-web-c01.png",
      mehanaWaiterListeningC07: "assets/chapter1/characters/mehana_waiter/kiro-listening-c07-frame00-d01.png",
      mehanaWaiterListeningFinal: "assets/chapter1/characters/mehana_waiter/kiro-listening-final-frame08-d01.png",
      mehanaWaiterTalkingPolishing: "assets/chapter1/characters/mehana_waiter/kiro-talking-polishing-web-final-12d548cd.webp",
      mehanaWaiterTonyGlanceC05: "assets/chapter1/characters/mehana_waiter/kiro-tony-glance-keyframe-c05.webp",
      mehanaWaiterSneakyGlassSwap: "assets/chapter1/characters/mehana_waiter/kiro-spitting-fixed-owner-export-c01.webp",
      tonyFridgeSeated: "assets/chapter1/characters/tony_fridge/seated-v1.png",
      tonyFridgeIdleSeated: "assets/chapter1/characters/tony_fridge/idle-seated-v1.webp",
      tonyFridgeTalkSeated: "assets/chapter1/characters/tony_fridge/talk-seated-v1.webp",
      tonyFridgeChuckleSeated: "assets/chapter1/characters/tony_fridge/chuckle-seated-v1.webp",
      tonyFridgeSkepticalSeated: "assets/chapter1/characters/tony_fridge/skeptical-seated-v1.webp",
      tonyFridgeApprovingNodSeated: "assets/chapter1/characters/tony_fridge/approving-nod-seated-v1.webp",
      tonyFridgeAngerSeated: "assets/chapter1/characters/tony_fridge/anger-seated-v1.webp",
      mitkoCompetitionGlass: "assets/chapter1/scenes/mehana/competition-glass-v1.png",
      droppedBelongingsPile: "assets/chapter1/items/dropped-belongings-pile-v1.png"
    },
    "scene.chapter1.municipality": {
      background: "assets/chapter1/scenes/municipality/background-mayor-door-v1.png",
      archiveCabinet: "assets/chapter1/scenes/municipality/archive-cabinet-v6.png",
      stampTable: "assets/chapter1/scenes/municipality/stamp-table-v9.png",
      municipalitySeal: "assets/chapter1/scenes/municipality/municipality-seal-v1.png",
      candidateRegister: "assets/chapter1/scenes/municipality/candidate-register-v4.png",
      penkaChair: "assets/chapter1/scenes/municipality/penka-chair-v1.png",
      penkaSeated: "assets/chapter1/scenes/municipality/penka-seated-bordeaux-polka-v2.png",
      penkaDesk: "assets/chapter1/scenes/municipality/penka-desk-v10.png",
      securityOfficer: "assets/chapter1/scenes/municipality/policeman-security-guard-v2.png",
      securityTable: "assets/chapter1/scenes/municipality/security-table-v6.png",
      droppedBelongingsPile: "assets/chapter1/items/dropped-belongings-pile-v1.png"
    },
    "scene.chapter1.mayor_office": {
      journalistStanding: "assets/chapter1/characters/journalist/standing-v2.png",
      background: "assets/chapter1/scenes/mayor_office/background-v1.png",
      mayorStanding: "assets/chapter1/characters/mayor/standing-v1.png",
      droppedBelongingsPile: "assets/chapter1/items/dropped-belongings-pile-v1.png"
    },
    "scene.chapter1.election_booth": {
      penkaSeated: "assets/chapter1/scenes/election_booth/penka-seated-v1.png",
      tableOccluder: "assets/chapter1/scenes/election_booth/table-occluder-v1.png",
      background: "assets/chapter1/scenes/election_booth/background-v1.png",
      mayorStanding: "assets/chapter1/characters/mayor/standing-v1.png",
      journalistStanding: "assets/chapter1/characters/journalist/standing-v2.png",
      babaSeated: "assets/chapter1/characters/baba_stoyanka/seated-v2.png",
      tonySeated: "assets/chapter1/characters/tony_fridge/seated-v1.png",
      ballotBox: "assets/chapter1/scenes/archive/box-v1.png",
      creditors: "assets/chapter1/characters/creditors/pair-v1.png",
      droppedBelongingsPile: "assets/chapter1/items/dropped-belongings-pile-v1.png"
    }
  },
  characters: {
    "npc.bai_mitko": {
      type: "externalAnimation",
      ...externalAnimationV1.characterAssets,
      ...mitkoTurnAssets,
      ...mitkoTurnPocketAssets
    }
  },
  items: {
    "item.fake_diploma": { icon: "assets/chapter1/items/fake-diploma-v1.png", stampedIcon: "assets/chapter1/items/stamped-diploma-v1.png" },
    "item.campaign_pamphlets": { icon: "assets/chapter1/items/campaign-pamphlets-v1.png" },
    "item.suspicious_receipt": { icon: "assets/chapter1/items/suspicious-receipt-v1.png" },
    "item.rakia": { icon: "assets/chapter1/items/rakia-v1.png" },
    "item.shopska_salad": { icon: "assets/chapter1/items/shopska-salad-v1.png" },
    "item.tripe_soup": { icon: "assets/chapter1/items/tripe-soup-v1.png" },
    "item.village_wine": { icon: "assets/chapter1/items/village-wine-v1.png" },

    "item.pickle_jar": { icon: "assets/chapter1/scenes/archive/jar-v1.png" },
    "item.ballot_box": { icon: "assets/chapter1/scenes/archive/box-v1.png" },
    "item.municipality_stamp": {
      icon: "assets/chapter1/scenes/municipality/municipality-seal-v1.png"
    },
    "item.accordion": {
      icon: "assets/chapter1/items/accordion.png"
    },
    "item.unpaid_bills": {
      icon: "assets/chapter1/items/unpaid_bills.png"
    },
    "item.empty_envelope": {
      icon: "assets/chapter1/items/empty_envelope.png"
    },
    "item.sunflower_oil": {
      icon: "assets/chapter1/items/kiro-bottle/oil-200ml-r07.png"
    },
    "item.empty_rakia_bottle": {
      icon: "assets/chapter1/items/kiro-bottle/empty-r07.png",
      model: "assets/chapter1/items/kiro-bottle/empty-r08.glb"
    },
    "item.fountain_water_bottle": {
      icon: "assets/chapter1/items/kiro-bottle/fountain-water-c07.png",
      model: "assets/chapter1/items/kiro-bottle/fountain-water-c07.glb",
      liquidColor: null
    },
    "item.glass_of_water": {
      icon: "assets/chapter1/items/glass-of-water-v1.png"
    }
  }
};
