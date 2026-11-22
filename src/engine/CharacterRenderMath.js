import { sceneCharacterHeight, sceneDepthT } from "./DepthMath.js";
import { clamp } from "./geometry.js";

export function characterForegroundScale(scene, characterId, position) {
  const placement = scene?.characterPlacement;
  const ramp = placement?.foregroundScale;
  if (!ramp || placement.characterId !== characterId || !Number.isFinite(position?.y)) return 1;
  const progress = clamp((position.y - ramp.startY) / (ramp.endY - ramp.startY), 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  return 1 + eased * (ramp.max - 1);
}

export function characterHeight(definition, scene, position) {
  const calibration = definition.render.sceneHeights[scene.id] || { near: definition.gameHeight, far: definition.gameHeight };
  const fixedHeight = sceneCharacterHeight(scene, position, definition.id);
  if (fixedHeight) return fixedHeight * characterForegroundScale(scene, definition.id, position);
  if (!scene.perspectiveScale) return calibration.near;
  const t = sceneDepthT(scene, position);
  return calibration.far + t * (calibration.near - calibration.far);
}
