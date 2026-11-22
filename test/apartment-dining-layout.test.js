import test from 'node:test';
import assert from 'node:assert/strict';
import { chapter1 } from '../src/content/chapter1/index.js';
import { findTargetAt, findWalkPath, isWalkable } from '../src/engine/SceneGeometry.js';

const apartment = chapter1.scenes.find(scene => scene.id === 'scene.chapter1.apartment');

test('the dining table responds at its new tabletop and releases the old floor', () => {
  const table = findTargetAt(apartment, { x: 530, y: 425 });
  assert.equal(table?.id, 'hotspot.apartment.table');
  assert.notEqual(findTargetAt(apartment, { x: 245, y: 505 })?.id, table.id);
  assert.equal(isWalkable(apartment, { x: 245, y: 505 }), true);
  for (const point of [{x: 394, y: 610}, {x: 530, y: 570}, {x: 694, y: 550}]) {
    assert.equal(isWalkable(apartment, point), false);
  }
});

test('the window, television and front aisle remain reachable around the dining set', () => {
  const destinations = [{ x: 830, y: 643 }, { x: 245, y: 505 }];
  for (const id of ['window', 'window.open', 'hotspot.apartment.tv', 'hotspot.apartment.adult_photo']) {
    const target = apartment.interactables.find(candidate => candidate.id === id);
    destinations.push(target.interactionApproach || target.actions.use.approach);
  }
  for (const destination of destinations) {
    assert.ok(isWalkable(apartment, destination), JSON.stringify(destination));
    assert.ok(findWalkPath(apartment, apartment.playerStart, destination).length, JSON.stringify(destination));
  }
});
