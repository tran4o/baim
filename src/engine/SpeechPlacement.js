import { clamp } from './geometry.js';

const world = { w: 1280, h: 720 };
const safe = { left: 14, right: 1266, top: 30, bottom: 696 };
const gap = 16;

export function placeSpeechBubble(body, mouth, metrics, facing, aboveOnly = false) {
  const { width, height } = metrics;
  const above = {
    x: clamp(mouth.x - width / 2, safe.left, safe.right - width),
    y: body.top - gap - height
  };
  const beside = side => ({
    x: side === 'west' ? body.left - gap - width : body.right + gap,
    y: clamp(mouth.y - height * 0.72, safe.top, safe.bottom - height)
  });
  const opposite = facing === 'west' ? 'east' : 'west';
  const candidates = aboveOnly ? [above] : [beside(facing), above, beside(opposite)];
  const point = candidates.find(({ x, y }) => x >= safe.left && x + width <= safe.right && y >= safe.top)
    || { ...above, y: Math.max(safe.top, above.y) };
  const x = clamp(mouth.x - point.x, 16, width - 16);
  const y = clamp(mouth.y - point.y, 16, height - 16);
  const tip = { x: mouth.x - point.x, y: mouth.y - point.y };
  const tail = mouth.x <= point.x
    ? `M0 ${y - 11} Q0 ${y + 9} ${tip.x} ${tip.y} Q10 ${y + 4} 5 ${y + 13}Z`
    : mouth.x >= point.x + width
      ? `M${width} ${y - 11} Q${width} ${y + 9} ${tip.x} ${tip.y} Q${width - 10} ${y + 4} ${width - 5} ${y + 13}Z`
      : `M${x - 13} ${height - 6} Q${x + 1} ${height} ${tip.x} ${tip.y} Q${x + 10} ${height - 4} ${x + 14} ${height - 7}Z`;
  return {
    left: point.x / world.w * 100,
    bottom: (world.h - point.y - height) / world.h * 100,
    width, maxWidth: metrics.maxWidth, maxHeight: metrics.maxHeight, tail,
    rect: { ...point, w: width, h: height }
  };
}
