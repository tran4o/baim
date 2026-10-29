import test from "node:test";
import assert from "node:assert/strict";
import { AudioSystem } from "../src/engine/AudioSystem.js";
import { SaveSystem } from "../src/engine/SaveSystem.js";
import { accordionCue } from "../src/content/chapter1/audio.js";
import { chapter1 } from "../src/content/chapter1/index.js";
import {game as lifecycleGame} from './helpers/restart-lifecycle-fixture.js';
import { archiveOpenRule } from "../src/content/chapter1/archive.js";

test("volume migrates old saves, persists zero, and clamps invalid levels", () => {
  const load = value => new SaveSystem({ getItem: () => JSON.stringify(value) }).load();
  assert.equal(load({}).audioVolume, 0.6);
  assert.equal(load({ audioVolume: 0 }).audioVolume, 0);
  assert.equal(load({ audioVolume: 2 }).audioVolume, 1);
  assert.equal(load({ audioVolume: -1 }).audioVolume, 0);
  assert.equal(load({ audioVolume: "invalid" }).audioVolume, 0.6);
  let raw;
  const saves = new SaveSystem({ getItem: () => raw, setItem: (_key, value) => { raw = value; } });
  saves.save({ audioEnabled: true, audioVolume: 0.37 });
  assert.equal(saves.load().audioVolume, 0.37);
});

test("volume changes live gain and stays silent while muted", () => {
  const audio = new AudioSystem();
  let gain;
  audio.context = { currentTime: 1 };
  audio.master = { gain: { setTargetAtTime: value => { gain = value; } } };
  audio.setVolume(1);
  assert.equal(gain, 0);
  audio.enabled = true;
  audio.setVolume(0.5);
  assert.equal(gain, 0.15);
  audio.setVolume(0);
  assert.equal(gain, 0);
});

test("all accordion performance routes play the phrase, but using the strap does not", async () => {
  const item = chapter1.items.find(item => item.id === "item.accordion");
  for (const rule of [...item.selfUseRules, ...item.targetUseRules]) assert.equal(rule.soundCue, accordionCue);
  const tony = chapter1.scenes.find(scene => scene.id === "scene.chapter1.mehana").npcs.find(npc => npc.id === "npc.tony_fridge");
  const g=lifecycleGame();await g.changeScene('scene.chapter1.mehana');g.inventory.add('item.accordion');
  const played=[];g.audio.play=cue=>played.push(cue);
  assert.equal(g.useInventoryItemOnTarget('item.accordion',tony),true);
  assert.deepEqual(played,[accordionCue],'real Tony dispatch uses current generic accordion performance');
  assert.equal(archiveOpenRule.soundCue, undefined);
  assert.ok(Math.max(...accordionCue.notes.map(note => note.at + note.duration)) < 2.5);
});

test("footsteps follow travelled distance and stop when paused, muted or teleported", () => {
  const audio = new AudioSystem();
  audio.enabled = true;
  const surface = { cutoff: 700, pitch: 100, volume: 0.6 };
  let steps = 0;
  audio.playFootstep = () => { steps++; };
  audio.updateFootsteps(20, 300, surface, true);
  audio.updateFootsteps(0, 300, surface, true);
  assert.equal(steps, 0);
  // A 300px character now steps every 63px rather than 42px: 2/3 cadence.
  audio.updateFootsteps(22, 300, surface, true);
  assert.equal(steps, 0);
  audio.updateFootsteps(22, 300, surface, true);
  assert.equal(steps, 1);
  audio.updateFootsteps(30, 300, surface, true);
  audio.updateFootsteps(0, 300, surface, false);
  audio.updateFootsteps(12, 300, surface, true);
  assert.equal(steps, 1);
  audio.updateFootsteps(500, 300, surface, true);
  assert.equal(steps, 1);
  audio.volume = 0;
  audio.updateFootsteps(65, 300, surface, true);
  assert.equal(steps, 1);
  audio.volume = 0.6;
  audio.updateFootsteps(65, 300, surface, true);
  assert.equal(steps, 2);
  audio.enabled = false;
  audio.updateFootsteps(65, 300, surface, true);
  assert.equal(steps, 2);
  audio.enabled = true;
  audio.updateFootsteps(65, 300, undefined, true);
  assert.equal(steps, 2);
});
