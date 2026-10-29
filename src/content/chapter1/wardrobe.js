// Stable inventory/source identity; the old chair hotspot stays disabled.
export const wardrobeAccordion = {
  id: 'hotspot.apartment.accordion', kind: 'hotspot',
  nameKey: 'item.accordion.name', lookKey: 'look.apartment.accordion',
  takeItemId: 'item.accordion', hiddenWhenItemOwned: 'item.accordion',
  flagOnTake: 'hasAccordion', takeMessageKey: 'wardrobe.accordion_taken'
};

export const wardrobePhotoPuzzle = {
  id: 'hotspot.apartment.wardrobe_photo_puzzle', kind: 'hotspot',
  nameKey: 'photoquest.cupboard', lookKey: 'photoquest.cupboard_look',
  puzzleId: 'photo_cupboard'
};

export const wardrobeCloseup = {
  id: 'closeup.apartment.wardrobe', titleKey: 'hotspot.wardrobe.name',
  descriptionKey: 'wardrobe.inside', placeholderKey: 'wardrobe.art_pending',
  // Owner-selected c04-A is empty; its photo box is decorative, not a second reward.
  backgroundAsset: 'wardrobeInteriorC04A',
  contentAspect: { width: 1027, height: 1531 },
  presentation: 'room', roomHintKey: 'wardrobe.room_hint',
  exitZones: [{ side: 'left', x: 0, w: 12 }, { side: 'right', x: 88, w: 12 }],
  propMode: 'wardrobe-puzzle-and-accordion-r08-context',
  // Reuse the original painting above the models at the physical shelf lip/divider.
  foregroundRegions: [
    'polygon(13.7% 74.85%,86.5% 74.85%,86.5% 75.8%,13.7% 75.8%)',
    'polygon(59.1% 60.2%,61% 60.2%,61% 74.85%,59.1% 74.85%)'
  ],
  decorations: [{ imageUrl: 'assets/chapter1/scenes/apartment/wardrobe-r34/bottles-D.png',
    rect: { x: 61.5, y: 61.6, w: 24.8, h: 13.2 } }],
  hintKey: 'wardrobe.objects_hint',
  solvedFlag: 'photoCupboardSolved', solvedStatusKey: 'photoquest.cupboard_empty',
  items: [{ target: wardrobeAccordion, rect: { x: 14.1, y: 59.344, w: 27.54, h: 15.606 },
    modelAsset: 'model', cameraDirection: [0.04, 0.12, 1], fitBounds: true, verticalAlign: 'bottom',
    shelfPose: { rotation: [0, 0.3817993877991494, 0], supportMesh: 'accordion_Aged_mahogany_varnish' } },
    { target: wardrobePhotoPuzzle, rect: { x: 42, y: 69, w: 15.5, h: 5.95 },
      modelUrl: 'assets/chapter1/puzzles/photo-puzzle-seven-plain-photo-r34.glb',
      cameraDirection: [0.03, 0.4, 1], fitBounds: true, verticalAlign: 'bottom',
      shelfPose: { rotation: [0, -0.15, 0] } }]
};
