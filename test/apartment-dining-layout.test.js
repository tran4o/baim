import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { sceneZIndexForPoint } from '../src/engine/Renderer.js';
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

test('chairs cover Mitko from behind and the rear chair mask leaves the gap above its rail clear', () => {
  const layers = new Map(apartment.foregroundLayers.map(layer => [layer.id, layer]));
  const front = layers.get('layer.apartment.dining_front_chair');
  const rear = layers.get('layer.apartment.dining_back_chair');
  assert.ok(front.zIndex < sceneZIndexForPoint(apartment, { x: 299, y: 605 }));
  assert.ok(front.zIndex > sceneZIndexForPoint(apartment, { x: 460, y: 677 }));
  assert.ok(rear.zIndex < sceneZIndexForPoint(apartment, { x: 367, y: 478 }));
  assert.equal(isWalkable(apartment, { x: 315, y: 592 }), false);

  const mask = PNG.sync.read(readFileSync('assets/chapter1/scenes/apartment/dining-r01/dining-back-chair.png'));
  const opacity = (x, y) => mask.data[(y * mask.width + x) * 4 + 3];
  assert.equal(opacity(355, 386), 0);
  assert.equal(opacity(359, 395), 255);
});
