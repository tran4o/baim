import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Strip only the named, hash-bound Kiro opt-in additions before comparison
// with the ORIGINAL Baba baseline. Baseline hashes are never advanced to HEAD.
export function stripKiroIdleVariationExtension(path, source) {
  const replaceOnce = (text, original = '') => {
    assert.equal(source.split(text).length, 2, 'exact Kiro extension: ' + path);
    source = source.replace(text, original);
  };
  const method = (start, end, expected) => {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, path);
    const addition = source.slice(from, to);
    assert.equal(createHash('sha256').update(addition).digest('hex'), expected, 'bound Kiro method: ' + path);
    replaceOnce(addition);
  };
  if (path === 'src/engine/Game.js') {
    replaceOnce('import { SceneIdleVariations, sceneIdleVariationsBlocked } from "./SceneIdleVariations.js";\n');
    replaceOnce('    this.sceneIdleVariations = new SceneIdleVariations();\n');
    replaceOnce('    this.updateSceneIdleVariations(dt);\n');
    replaceOnce('    this.sceneIdleVariations?.reset();\n');
    method('  updateSceneIdleVariations(dt) {', '  bindInput() {', '0693de3b630cd0f4d394b77cd7d0602b040bfe3e43e280945b6a4b315c23dfbb');
  }
  if (path === 'src/engine/Renderer.js') {
    replaceOnce('    if (this.drawSceneIdleVariation(scene, layer)) return;\n');
    method('  drawSceneIdleVariation(scene, layer) {', '  sceneLayerIdleAnimation(scene, layer) {', 'ffd6c05dc3d3cd5c27861d475daddadf8dc46be0c31f291001f419fbb6fb2085');
  }
  return source;
}
