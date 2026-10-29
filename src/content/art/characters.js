import { externalAnimationV1 } from "./externalAnimationRuntime.generated.js";

export const characterDefinitions = {
  "npc.bai_mitko": {
    id: "npc.bai_mitko",
    displayNameKey: "npc.bai_mitko.name",
    pivot: { x: 0.5, y: 0.98 },
    gameHeight: 188,
    render: {
      anchor: { x: 0.5, y: 0.98 },
      defaultFacing: "south",
      canonicalVisualHeight: 640,
      verticalDirectionBias: 1.6,
      sceneRegistrations: {
        "scene.chapter1.apartment": [
          { slot: "external_opens_window", visualHeight: 390, baselineY: 578, scale: 1, offsetY: 0 },
          { prefix: "external_talk_", visualHeight: 430, baselineY: 510, scale: 1 }
        ]
      },
      sceneHeights: {
        "scene.chapter1.apartment": { near: 409, far: 209 },
        "scene.chapter1.village_square": { near: 300, far: 109 },
        "scene.chapter1.mehana": { near: 344.4, far: 278 },
        "scene.chapter1.municipality": { near: 386, far: 225.75 }
      }
    },
    animations: {
      idle: {
        type: "frames",
        fps: 6,
        loop: true,
        directions: {
          south: externalAnimationV1.walkParts?.south?.rest,
          east: externalAnimationV1.walkParts?.east?.start,
          west: externalAnimationV1.walkParts?.west?.start,
          north: externalAnimationV1.walkParts?.north?.rest
        },
        fallback: "walkStartFrame0"
      },
      walk: {
        type: "phasedStrip",
        fps: 8,
        loop: true,
        parts: {
          east: externalAnimationV1.walkParts?.east,
          west: externalAnimationV1.walkParts?.west,
          north: externalAnimationV1.walkParts?.north,
          south: externalAnimationV1.walkParts?.south
        },
        directions: {
          east: externalAnimationV1.walkParts?.east?.loop,
          west: externalAnimationV1.walkParts?.west?.loop,
          north: externalAnimationV1.walkParts?.north?.loop,
          south: externalAnimationV1.walkParts?.south?.loop
        },
        fallback: "directionalIdle"
      }
    },
    animationSource: "external_animation_v1"
  }
};
