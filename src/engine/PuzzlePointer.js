import { movePuzzle } from './SlidingBlockPuzzle.js';

// The newly occupied strip is the clickable destination for one grid-safe slide.
export function puzzleMoveTargets(state, id, definition) {
  const piece = definition.pieces.find(p => p.id === id), p = state.positions[id];
  if (!piece || !p) return [];
  const targets = [];
  for (const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]) {
    if (!movePuzzle(state,id,dx,dy,definition)) continue;
    for(let y=p.y+dy;y<p.y+dy+piece.h;y++) for(let x=p.x+dx;x<p.x+dx+piece.w;x++) {
      if(x<p.x || x>=p.x+piece.w || y<p.y || y>=p.y+piece.h) targets.push({x,y,dx,dy});
    }
  }
  return targets;
}
export function puzzleDragDirection(start, end, pixelDistance, cellSize=.04) {
  if (pixelDistance < 12) return null;
  const dx=end.x-start.x, dy=end.z-start.z;
  if (Math.max(Math.abs(dx),Math.abs(dy)) < cellSize*.35) return null;
  return Math.abs(dx)>Math.abs(dy) ? {dx:Math.sign(dx),dy:0} : {dx:0,dy:Math.sign(dy)};
}

// Preview only: legal dominant-axis movement, bounded to one cell until release commits it.
export function puzzleDragPreview(state,id,start,end,definition,cellSize=.04) {
  if(!start||!end)return{x:0,z:0};
  const x=end.x-start.x,z=end.z-start.z,alongX=Math.abs(x)>Math.abs(z),delta=alongX?x:z;
  if(!delta||!movePuzzle(state,id,alongX?Math.sign(delta):0,alongX?0:Math.sign(delta),definition))return{x:0,z:0};
  const bounded=Math.max(-cellSize,Math.min(cellSize,delta));return alongX?{x:bounded,z:0}:{x:0,z:bounded};
}
