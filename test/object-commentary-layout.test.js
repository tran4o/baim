import assert from 'node:assert/strict';
import test from 'node:test';
import { chapter1 } from '../src/content/chapter1/index.js';
import { objectRemark } from '../src/content/chapter1/objectCommentary.js';
import { findWalkPath, isWalkable } from '../src/engine/SceneGeometry.js';
import { placeSpeechBubble } from '../src/engine/SpeechPlacement.js';

test('each authored scene object has four distinct remarks in both languages', () => {
  for (const scene of chapter1.scenes) {
    for (const target of scene.interactables) {
      if (target.enabled === false || target.kind !== 'hotspot') continue;
      for (const language of ['bg', 'en']) {
        const lines = ['look', 'take', 'use', 'talk'].map(verb => objectRemark(target.id, verb, language));
        assert.ok(lines.every(line => typeof line === 'string' && line.length > 8), target.id + ' ' + language);
        assert.equal(new Set(lines).size, 4, target.id + ' ' + language);
      }
    }
  }
});

test('speech stays clear of Mitko at either edge and on both facing sides', () => {
  const metrics = { width: 350, height: 122, maxWidth: 350, maxHeight: 190 };
  for (const x of [90, 640, 1170]) {
    for (const facing of ['west', 'east']) {
      const body = { left: x - 90, right: x + 90, top: 251 };
      const { rect } = placeSpeechBubble(body, { x, y: 293 }, metrics, facing);
      assert.ok(rect.x >= 14 && rect.x + rect.w <= 1266 && rect.y >= 30);
      assert.ok(rect.x + rect.w <= body.left || rect.x >= body.right || rect.y + rect.h <= body.top);
      if (x === 640) assert.ok(facing === 'west' ? rect.x < x : rect.x > x);
    }
  }
});

test('apartment floor connects the doorway, rug and front aisle and excludes visible obstacles', () => {
  const scene = chapter1.scenes.find(s => s.id === 'scene.chapter1.apartment');
  const openFloor = [{ x: 980, y: 515 }, { x: 830, y: 643 }, { x: 578, y: 682 }, { x: 1152, y: 650 }];
  const obstacles = [{ x: 613, y: 587 }, { x: 1082, y: 508 }, { x: 868, y: 415 }, { x: 1020, y: 431 }, { x: 319, y: 668 }];
  assert.ok(openFloor.every(p => isWalkable(scene, p)));
  assert.ok(obstacles.every(p => !isWalkable(scene, p)));
  for (const p of openFloor.slice(1)) {
    const route = findWalkPath(scene, openFloor[0], p);
    assert.ok(route.length);
    for (let start = openFloor[0], i = 0; i < route.length; start = route[i], i++) {
      const end = route[i];
      const count = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y)));
      for (let sample = 0; sample <= count; sample++) {
        const t = sample / count;
        assert.ok(isWalkable(scene, { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }));
      }
    }
  }
});
