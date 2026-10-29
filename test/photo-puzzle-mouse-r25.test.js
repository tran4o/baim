import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{BEGINNER_PHOTO_PUZZLE as d,BEGINNER_PHOTO_PUZZLE_ID as id,initialPhotoPuzzle,validPhotoPuzzle,normalizeFirstPhotoPuzzleSave,FIRST_PHOTO_PUZZLE_VIEW}from'../src/content/chapter1/photoPuzzleBeginner.js';
import{initialPhotoPuzzle as initialR24,EASY_PHOTO_PUZZLE}from'../src/content/chapter1/photoPuzzleEasy.js';
import{PHOTO_PUZZLE,initialPuzzle,movePuzzle,puzzleHint,puzzleSolved}from'../src/engine/SlidingBlockPuzzle.js';
import{puzzleMoveTargets,puzzleDragDirection}from'../src/engine/PuzzlePointer.js';import{SaveSystem}from'../src/engine/SaveSystem.js';import{DEFAULT_SAVE}from'../src/engine/ids.js';import{stripPhotoPuzzleMouseR25}from'./helpers/photo-puzzle-mouse-r25-preservation.js';
const reload=s=>new SaveSystem({getItem:()=>JSON.stringify(s)}).load();
test('seven-piece default needs blocker clearance and five shortest legal slides, not a giveaway intro',()=>{
 assert.equal(DEFAULT_SAVE.photoPuzzle.definitionId,id);assert.equal(d.pieces.length,7);assert.equal(FIRST_PHOTO_PUZZLE_VIEW.directMouse,true);let s=initialPhotoPuzzle(),route=[];
 assert.equal(movePuzzle(s,'blue',0,1,d),null);assert.equal(movePuzzle(s,'red3',-1,0,d),null);assert.equal(movePuzzle(s,'red4',1,0,d),null);
 while(!puzzleSolved(s,d)&&route.length<9){const h=puzzleHint(s,d);assert.ok(h);route.push(h);s=movePuzzle(s,h.id,h.dx,h.dy,d);}assert.equal(route.length,5);assert.equal(s.moves,5);assert.ok(puzzleSolved(s,d));
});
test('empty-space targets exactly match legal newly occupied strips; no occupied or distant jump target',()=>{
 let s=initialPhotoPuzzle();assert.ok(puzzleMoveTargets(s,'blue',d).every(t=>t.dy===-1));const targets=puzzleMoveTargets(s,'yellow3',d);assert.ok(targets.some(t=>t.x===0&&t.y===2&&t.dy===-1));assert.ok(!targets.some(t=>t.y===4));
 for(const piece of d.pieces)for(const target of puzzleMoveTargets(s,piece.id,d)){assert.ok(movePuzzle(s,piece.id,target.dx,target.dy,d));for(const other of d.pieces){const p=s.positions[other.id];assert.ok(target.x<p.x||target.x>=p.x+other.w||target.y<p.y||target.y>=p.y+other.h);}}
 s=movePuzzle(s,'yellow3',0,-1,d);assert.ok(puzzleMoveTargets(s,'red3',d).some(t=>t.x===0&&t.y===4&&t.dx===-1));
});
test('drag has pixel and board-space thresholds, snaps to one dominant axis and cannot jump',()=>{
 const a={x:0,z:0};assert.equal(puzzleDragDirection(a,{x:.1,z:0},4),null);assert.equal(puzzleDragDirection(a,{x:.001,z:0},50),null);assert.deepEqual(puzzleDragDirection(a,{x:.4,z:.1},400),{dx:1,dy:0});assert.deepEqual(puzzleDragDirection(a,{x:.01,z:-.05},30),{dx:0,dy:-1});
 const s=initialPhotoPuzzle(),dir=puzzleDragDirection(a,{x:0,z:-.5},300),next=movePuzzle(s,'yellow3',dir.dx,dir.dy,d);assert.equal(next.positions.yellow3.y,2);assert.equal(next.moves,1);
});
test('r25 progress saves exactly; extra IDs or a stale definition cannot bind',()=>{
 const s=structuredClone(DEFAULT_SAVE);s.photoPuzzle=movePuzzle(s.photoPuzzle,'yellow3',0,-1,d);assert.deepEqual(reload(s).photoPuzzle,s.photoPuzzle);assert.ok(validPhotoPuzzle(s.photoPuzzle));assert.equal(validPhotoPuzzle({...s.photoPuzzle,positions:{...s.photoPuzzle.positions,red1:{x:0,y:0}}}),false);assert.equal(validPhotoPuzzle({...s.photoPuzzle,definitionId:'old'}),false);
});
test('rejected r24 and medium unfinished progress archived once; earned flags and inventory remain',()=>{
 for(const [old,key]of [[movePuzzle(initialR24(),'red3',-1,0,EASY_PHOTO_PUZZLE),'photoPuzzleR24Preserved'],[movePuzzle(initialPuzzle(),'yellow1',0,-1),'photoPuzzleMediumPreserved']]){const s=structuredClone(DEFAULT_SAVE);s.photoPuzzle=old;s.flags.keep=true;s.inventory=['item.mitko_photo'];const r=reload(s);assert.deepEqual(r[key],old);assert.deepEqual(r.photoPuzzle,initialPhotoPuzzle());assert.equal(r.flags.keep,true);assert.deepEqual(r.inventory,s.inventory);assert.deepEqual(reload(r),r);}
});
test('solved r24/medium converts coherently without reopening or awarding another school photo',()=>{
 for(const [def,initial,key]of [[EASY_PHOTO_PUZZLE,initialR24(),'photoPuzzleR24Preserved'],[PHOTO_PUZZLE,initialPuzzle(),'photoPuzzleMediumPreserved']]){let old=initial;while(!puzzleSolved(old,def)){const h=puzzleHint(old,def);old=movePuzzle(old,h.id,h.dx,h.dy,def);}const s=structuredClone(DEFAULT_SAVE);s.photoPuzzle=old;s.inventory=['item.mitko_child_photo'];s.flags.photoCupboardSolved=true;s.flags.childPhotoRecovered=true;const r=reload(s);assert.deepEqual(r[key],old);assert.ok(puzzleSolved(r.photoPuzzle,d));assert.equal(r.photoPuzzle.moves,old.moves);assert.deepEqual(r.inventory,s.inventory);assert.equal(r.flags.photoCupboardSolved,true);}
 const corrupt=structuredClone(DEFAULT_SAVE);corrupt.photoPuzzle.positions.blue.x=99;corrupt.photoPuzzleR24Preserved=initialR24();normalizeFirstPhotoPuzzleSave(corrupt);assert.deepEqual(corrupt.photoPuzzle,initialPhotoPuzzle());assert.deepEqual(corrupt.photoPuzzleR24Preserved,initialR24());
});
test('new GLB roots match seven-piece rules; r24 original asset remains named separately',()=>{
 const b=readFileSync(FIRST_PHOTO_PUZZLE_VIEW.modelUrl),g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString().trim());assert.deepEqual(g.nodes.filter(n=>n.extras?.pieceId).map(n=>n.extras.pieceId).sort(),d.pieces.map(p=>p.id).sort());assert.equal(g.asset.extras.variantId,id);assert.notEqual(FIRST_PHOTO_PUZZLE_VIEW.modelUrl,'assets/chapter1/puzzles/photo-cupboard-easy-five-c01.glb');
});
test('r25 inverse restores bound r24 sources without advancing historical hashes',()=>{const f=JSON.parse(readFileSync('test/fixtures/photo-puzzle-mouse-r25-deltas.json'));for(const[p,r]of Object.entries(f.records)){const s=readFileSync(p,'utf8');assert.equal(stripPhotoPuzzleMouseR25(p,s,true),r.before);assert.throws(()=>stripPhotoPuzzleMouseR25(p,s+'\n// unknown',true));}});
