import { PHOTO_PUZZLE, initialPuzzle, validPuzzle, puzzleSolved, movePuzzle } from '../../engine/SlidingBlockPuzzle.js';

// Original ten-piece rules and native model remain the later medium candidate.
export const MEDIUM_PHOTO_PUZZLE = PHOTO_PUZZLE;
export const EASY_PHOTO_PUZZLE_ID = 'photo-puzzle-easy-five-c01';
const ids = ['blue', 'red3', 'red4', 'yellow2', 'yellow5'];
export const EASY_PHOTO_PUZZLE = Object.freeze({
  id: EASY_PHOTO_PUZZLE_ID, difficulty: 'easy', columns: 4, rows: 5,
  goal: Object.freeze({ ...PHOTO_PUZZLE.goal }),
  pieces: Object.freeze(ids.map(id => Object.freeze({ ...PHOTO_PUZZLE.pieces.find(p => p.id === id) })))
});
export const FIRST_PHOTO_PUZZLE_VIEW = Object.freeze({
  definition: EASY_PHOTO_PUZZLE,
  modelUrl: 'assets/chapter1/puzzles/photo-cupboard-easy-five-c01.glb',
  helpKey: 'easy_help', goalTextKey: 'easy_goal', selectedPieceId: 'red3', showExit: true, legalDirectionsOnly: true
});
export function initialPhotoPuzzle() {
  return { ...initialPuzzle(EASY_PHOTO_PUZZLE), definitionId: EASY_PHOTO_PUZZLE_ID };
}
export function validPhotoPuzzle(state) {
  const keys = Object.keys(state?.positions || {});
  return state?.definitionId === EASY_PHOTO_PUZZLE_ID && keys.length === ids.length
    && keys.every(id => ids.includes(id)) && validPuzzle(state, EASY_PHOTO_PUZZLE);
}
export function normalizeFirstPhotoPuzzleSave(save) {
  if (validPhotoPuzzle(save.photoPuzzle)) return save.photoPuzzle;
  const medium = validPuzzle(save.photoPuzzle, MEDIUM_PHOTO_PUZZLE) ? save.photoPuzzle : null;
  if (medium && !save.photoPuzzleMediumPreserved) {
    save.photoPuzzleMediumPreserved = structuredClone(medium);
  }
  save.photoPuzzle = initialPhotoPuzzle();
  if (medium && puzzleSolved(medium, MEDIUM_PHOTO_PUZZLE)) {
    for (const [id,dx,dy] of [['red3',-1,0],['red4',1,0],['blue',0,1]]) save.photoPuzzle=movePuzzle(save.photoPuzzle,id,dx,dy,EASY_PHOTO_PUZZLE);
    save.photoPuzzle.moves=medium.moves;
  }
  return save.photoPuzzle;
}
