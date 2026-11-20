// Painted scenery offers Look commentary only; none of these props grants an item.
export const apartmentCommentaryTargets = [
  ['icon', {x:12,y:52,w:70,h:70}],
  ['lamp', {x:550,y:0,w:145,h:58}],
  ['suitcase', {x:771,y:38,w:110,h:46}],
  ['bag', {x:881,y:35,w:84,h:50}],
  ['plant', {x:128,y:230,w:61,h:74}],
  ['radiator', {x:185,y:305,w:116,h:52}],
  ['empty_frame', {x:435,y:108,w:105,h:120}],
  ['wall_rug', {x:1152,y:58,w:116,h:220}]
].map(([name,rect])=>({
  id:'hotspot.apartment.'+name,kind:'hotspot',rect,hitPriority:5,
  nameKey:'apartment.scenery.'+name+'.name',lookKey:'apartment.scenery.'+name+'.look',
  plainUseAvailable:false,
  ...(name==='empty_frame'?{requirements:{flags:['adultPhotoTaken']}}:{})
}));
