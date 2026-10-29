import { findWalkPath, isWalkable, nearestReachableWalkablePoint, walkPathDistance } from './SceneGeometry.js';

// Use the current hit geometry: several redesigned hotspots retain legacy rects.
export function refusalTargetPoint(target, clickPoint = null) {
  if (clickPoint) return { ...clickPoint };
  if (target.polygon?.length) {
    const sum = target.polygon.reduce((p, q) => ({ x: p.x + q.x, y: p.y + q.y }), { x: 0, y: 0 });
    return { x: sum.x / target.polygon.length, y: sum.y / target.polygon.length };
  }
  const r = target.rect;
  return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
}

function prefixAtDistance(from, path, length) {
  const prefix = [];
  let previous = from, remaining = length;
  for (const point of path) {
    const segment = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (segment > remaining) {
      prefix.push({ x: previous.x + (point.x - previous.x) * remaining / segment,
        y: previous.y + (point.y - previous.y) * remaining / segment });
      break;
    }
    if (segment > 0) prefix.push({ ...point });
    remaining -= segment;
    previous = point;
    if (remaining <= 0) break;
  }
  return prefix;
}

// A couple of supported steps short of the NORMAL approach, never a retreat.
// Both proximity and shortening use floor routes, not a high click's distance to feet.
export function planRefusalApproach(scene, from, normalAnchor, targetPoint, visualHeight) {
  const gap = Math.max(32, Number(visualHeight || 300) * 0.24);
  const stay = reason => ({ point: { ...from }, path: [], gap, reason });
  if (!normalAnchor || !targetPoint) return stay('no-safe-anchor');
  const targetFloor = nearestReachableWalkablePoint(scene, from, targetPoint);
  const floorPath = targetFloor && findWalkPath(scene, from, targetFloor);
  if (!floorPath?.length) return stay('no-safe-target-route');
  const floorDistance = walkPathDistance(from, floorPath);
  if (floorDistance <= gap) return stay('already-near-target');
  const anchor = nearestReachableWalkablePoint(scene, from, normalAnchor);
  const normalPath = anchor && findWalkPath(scene, from, anchor);
  if (!normalPath?.length) return stay('no-safe-anchor-route');
  const normalDistance = walkPathDistance(from, normalPath);
  if (normalDistance <= gap) return stay('already-near-anchor');
  const path = prefixAtDistance(from, normalPath, normalDistance - gap);
  const point = path.at(-1);
  if (!point || !isWalkable(scene, point)) return stay('no-safe-prefix');
  const remaining = findWalkPath(scene, point, targetFloor);
  if (!remaining.length || walkPathDistance(point, remaining) >= floorDistance - 1) return stay('would-move-away');
  return { point, path, gap, reason: 'shortened-normal-route', normalAnchor: anchor, normalDistance, floorDistance };
}
