// Foot positions belong to painted floor, independently of tall door hit areas.
// Arrival points use the same threshold on the other side of each doorway.
const doors = {
  'exit.apartment.to_square': [{ x: 1010, y: 570 }, 'east', { x: 460, y: 445 }],
  'exit.square.to_apartment': [{ x: 460, y: 445 }, 'north', { x: 1010, y: 570 }],
  'exit.square.to_mehana': [{ x: 147.5, y: 562.5 }, 'west', { x: 150, y: 585 }],
  'exit.mehana.to_square': [{ x: 150, y: 585 }, 'west', { x: 147.5, y: 562.5 }],
  'exit.square.to_municipality': [{ x: 897.5, y: 482.5 }, 'north', { x: 135, y: 550 }],
  'exit.municipality.to_square': [{ x: 135, y: 550 }, 'west', { x: 897.5, y: 482.5 }],
  'exit.square.to_election_booth': [{ x: 285, y: 625 }, 'north', { x: 172, y: 548 }],
  'exit.election_booth.to_square': [{ x: 172, y: 548 }, 'west', { x: 285, y: 625 }],
  'exit.municipality.to_mayor_office': [{ x: 710, y: 510 }, 'north', { x: 200, y: 545 }],
  'exit.mayor_office.to_municipality': [{ x: 200, y: 545 }, 'west', { x: 710, y: 510 }]
};

export function wireEntrances(scenes) {
  return scenes.map(scene => {
    const square = scene.id === 'scene.chapter1.village_square';
    return {
      ...scene,
      ...(square ? { walkMask: apartmentDoorFloor(scene.walkMask) } : {}),
      exits: scene.exits.map(exit => {
        const door = doors[exit.id];
        if (!door) return exit; // The archive is a close-up without a walking actor.
        return { ...exit, entryApproach: door[0], entryFacing: door[1], targetPosition: door[2],
          ...(exit.id === 'exit.square.to_apartment' ? {
            // Click the painted building; the floor threshold above stays independent.
            rect: { x: 355, y: 65, w: 235, h: 220 },
            polygon: [{ x: 355, y: 110 }, { x: 450, y: 65 }, { x: 550, y: 90 },
              { x: 590, y: 110 }, { x: 580, y: 265 }, { x: 465, y: 285 }, { x: 370, y: 265 }]
          } : {}) };
      })
    };
  });
}

function apartmentDoorFloor(mask) {
  // A narrow pavement connection to the owner-marked ground-floor doorway.
  // Do not open the fountain, Baba's seat or the surrounding wall for walking.
  const rows = mask.rows.map((row, y) => Array.from(row, (cell, x) => {
    const px = (x + .5) * mask.worldWidth / mask.width;
    const py = (y + .5) * mask.worldHeight / mask.height;
    return px >= 445 && px < 475 && py >= 440 && py < 485 ? 'c' : cell;
  }).join(''));
  return { ...mask, rows };
}
