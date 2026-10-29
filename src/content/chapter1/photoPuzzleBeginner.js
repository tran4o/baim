import { PHOTO_PUZZLE, initialPuzzle, validPuzzle, puzzleSolved, movePuzzle } from '../../engine/SlidingBlockPuzzle.js';
import { EASY_PHOTO_PUZZLE, validPhotoPuzzle as validR24 } from './photoPuzzleEasy.js';

export const BEGINNER_PHOTO_PUZZLE_ID = 'photo-puzzle-beginner-seven-c01';
const ids = ['blue', 'red3', 'red4', 'yellow2', 'yellow3', 'yellow4', 'yellow5'];
export const BEGINNER_PHOTO_PUZZLE = Object.freeze({
  id: BEGINNER_PHOTO_PUZZLE_ID, difficulty: 'beginner', columns: 4, rows: 5,
  goal: Object.freeze({ ...PHOTO_PUZZLE.goal }),
  pieces: Object.freeze(ids.map(id => Object.freeze({ ...PHOTO_PUZZLE.pieces.find(p => p.id === id) })))
});
export const FIRST_PHOTO_PUZZLE_VIEW = Object.freeze({
  definition: BEGINNER_PHOTO_PUZZLE, modelUrl: 'assets/chapter1/puzzles/photo-puzzle-seven-plain-photo-r34.glb',
  helpKey: null, goalTextKey: null, selectedPieceId: 'blue',
  showExit: false, legalDirectionsOnly: true, directMouse: true, dragOnly: true, minimal: true
});
export function initialPhotoPuzzle() {
  return { ...initialPuzzle(BEGINNER_PHOTO_PUZZLE), definitionId: BEGINNER_PHOTO_PUZZLE_ID };
}
export function validPhotoPuzzle(state) {
  const keys = Object.keys(state?.positions || {});
  return state?.definitionId === BEGINNER_PHOTO_PUZZLE_ID && keys.length === ids.length
    && keys.every(id => ids.includes(id)) && validPuzzle(state, BEGINNER_PHOTO_PUZZLE);
}
export function normalizeFirstPhotoPuzzleSave(save) {
  if (validPhotoPuzzle(save.photoPuzzle)) return save.photoPuzzle;
  const old = save.photoPuzzle, r24 = validR24(old), medium = !r24 && validPuzzle(old, PHOTO_PUZZLE);
  const archive = r24 ? 'photoPuzzleR24Preserved' : 'photoPuzzleMediumPreserved';
  if ((r24 || medium) && !save[archive]) save[archive] = structuredClone(old);
  save.photoPuzzle = initialPhotoPuzzle();
  if ((r24 || medium) && puzzleSolved(old, r24 ? EASY_PHOTO_PUZZLE : PHOTO_PUZZLE)) {
    for (const [id, dx, dy] of [['yellow3',0,-1],['yellow4',0,-1],['red3',-1,0],['red4',1,0],['blue',0,1]]) {
      save.photoPuzzle = movePuzzle(save.photoPuzzle, id, dx, dy, BEGINNER_PHOTO_PUZZLE);
    }
    save.photoPuzzle.moves = old.moves;
  }
  return save.photoPuzzle;
}
