import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { sceneZIndexForPoint } from '../src/engine/Renderer.js';
import { assetManifest } from '../src/content/art/assetManifest.js';
import { chapter1 } from '../src/content/chapter1/index.js';
import { findTargetAt, findWalkPath, isWalkable, nearestReachableWalkablePoint } from '../src/engine/SceneGeometry.js';

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
  assert.ok(rear.zIndex < sceneZIndexForPoint(apartment, { x: 367, y: 505 }));
  assert.equal(isWalkable(apartment, { x: 315, y: 592 }), false);

  const mask = PNG.sync.read(readFileSync('assets/chapter1/scenes/apartment/dining-r01/dining-back-chair-refined.png'));
  const opacity = (x, y) => mask.data[(y * mask.width + x) * 4 + 3];
  assert.equal(opacity(355, 386), 0);
  assert.equal(opacity(359, 395), 255);
  assert.equal(opacity(390, 385), 255);
  assert.equal(opacity(409, 410), 0);
});

test('the right chair leaves its leg gaps clear and the restored counter masks boots from behind', () => {
  const root = 'assets/chapter1/scenes/apartment/dining-r01/';
  const chair = PNG.sync.read(readFileSync(root + 'dining-right-chair.png'));
  const foreground = apartment.foregroundLayers.find(layer => layer.id === 'layer.apartment.table_foreground');
  const path = assetManifest.scenes[apartment.id][foreground.asset];
  assert.equal(path, 'assets/chapter1/scenes/apartment/dining-r01/counter-refined.png');
  assert.ok(foreground.zIndex < sceneZIndexForPoint(apartment, { x: 350, y: 678 }));
  const counter = PNG.sync.read(readFileSync(path));
  const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];
  assert.equal(alpha(chair, 687, 536), 0);
  assert.equal(alpha(chair, 700, 536), 255);
  assert.equal(alpha(counter, 346, 616), 0);
  assert.equal(alpha(counter, 346, 650), 255);
  for (const [x, y] of [[42,528],[86,527],[127,548],[455,707]]) assert.equal(alpha(counter,x,y),0);
  for (const [x, y] of [[35,524],[75,520],[118,538],[181,584],[443,708]]) assert.equal(alpha(counter,x,y),255);
  const dining = PNG.sync.read(readFileSync(root + 'dining-refined.png'));
  assert.equal(alpha(dining,413,404),0);
  assert.equal(alpha(dining,430,408),255);
  const front = PNG.sync.read(readFileSync(root + 'dining-front-chair-refined.png'));
  assert.equal(alpha(front,421,601),0);
  assert.equal(alpha(front,438,649),255);
  assert.equal(isWalkable(apartment, { x: 346, y: 675 }), false);
  assert.equal(isWalkable(apartment, { x: 490, y: 669 }), false);
  assert.equal(isWalkable(apartment, { x: 346, y: 687.5 }), true);
  assert.equal(isWalkable(apartment, { x: 346, y: 698 }), false);
});

test('Mitko stops on the mat and has a connected route around the front of the dining set', () => {
  const door = apartment.exits.find(exit => exit.id === 'exit.apartment.to_square');
  assert.ok(isWalkable(apartment, door.entryApproach));
  for (const point of [{ x: 1010, y: 505 }, { x: 1025, y: 520 }, { x: 1045, y: 545 }]) {
    assert.equal(isWalkable(apartment, point), false);
  }
  const path = findWalkPath(apartment, { x: 550, y: 680 }, { x: 280, y: 590 });
  assert.ok(path.some((point, i) => i && path[i - 1].x > 420 && point.x < 340 && Math.min(point.y, path[i - 1].y) > 670));
  assert.ok(path.every(point => point.y > 580));
});

test('walking around the right dining chair leaves space for Mitko’s stride', () => {
  const right = { x: 840, y: 550 };
  const front = { x: 550, y: 690 };
  for (const point of [{ x: 740, y: 520 }, { x: 733, y: 596 }, { x: 740, y: 620 }, { x: 700, y: 650 }]) {
    assert.equal(isWalkable(apartment, point), false);
    const stop = nearestReachableWalkablePoint(apartment, right, point);
    assert.ok(stop.x >= 785 || stop.y >= 630 || stop.y < 510);
    assert.ok(findWalkPath(apartment, right, stop).length);
  }
  for (const [from, to] of [[right, front], [front, right]]) {
    const path = findWalkPath(apartment, from, to);
    assert.deepEqual(path.at(-1), to);
    for (let previous = from, i = 0; i < path.length; previous = path[i++]) {
      const end = path[i];
      const samples = Math.max(1, Math.ceil(Math.hypot(end.x - previous.x, end.y - previous.y) * 2));
      for (let j = 0; j <= samples; j++) {
        const t = j / samples;
        const p = { x: previous.x + t * (end.x - previous.x), y: previous.y + t * (end.y - previous.y) };
        assert.ok(isWalkable(apartment, p), JSON.stringify(p));
        assert.ok(p.x >= 785 || p.y >= 625, JSON.stringify(p));
      }
    }
  }
});

test('the dresser footprint rejects walking while the floor in front stays connected', () => {
  assert.ok(apartment.foregroundLayers.every(layer => layer.id !== 'layer.apartment.cupboard_ad'));
  const start = { x: 985, y: 615 };
  const front = { x: 1152, y: 650 };
  assert.ok(isWalkable(apartment, front));
  assert.ok(findWalkPath(apartment, start, front).length);
  for (const point of [{ x: 1090, y: 555 }, { x: 1155, y: 575 }, { x: 1180, y: 592 }, { x: 1245, y: 640 }]) {
    assert.equal(isWalkable(apartment, point), false);
    const stop = nearestReachableWalkablePoint(apartment, start, point);
    assert.ok(stop && isWalkable(apartment, stop));
    assert.ok(stop.y > point.y || stop.x < point.x);
    const path = findWalkPath(apartment, start, stop);
    for (let previous = start, i = 0; i < path.length; previous = path[i++]) {
      const end = path[i];
      const samples = Math.max(1, Math.ceil(Math.hypot(end.x - previous.x, end.y - previous.y)));
      for (let j = 0; j <= samples; j++) {
        const t = j / samples;
        assert.ok(isWalkable(apartment, { x: previous.x + t * (end.x - previous.x), y: previous.y + t * (end.y - previous.y) }));
      }
    }
  }
});

test('the TV cabinet and near chair clearance leave reachable floor outside the furniture', () => {
  assert.equal(isWalkable(apartment, { x: 155, y: 478 }), false);
  assert.equal(isWalkable(apartment, { x: 310, y: 605 }), false);
  for (const point of [{ x: 215, y: 453 }, { x: 242.5, y: 487.5 }, { x: 298, y: 461 }, { x: 860, y: 450 }]) {
    assert.equal(isWalkable(apartment, point), false);
    const stop = nearestReachableWalkablePoint(apartment, apartment.playerStart, point);
    assert.ok(stop.y > point.y && findWalkPath(apartment, apartment.playerStart, stop).length);
  }
  const tv = apartment.interactables.find(target => target.id === 'hotspot.apartment.tv');
  assert.ok(isWalkable(apartment, tv.interactionApproach));
  assert.ok(findWalkPath(apartment, apartment.playerStart, tv.interactionApproach).length);
});
