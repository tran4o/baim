// Owner7November: the same kiosk panel changes candidate; Toni owns the only table props.
import { pepaPosterRule } from './photoQuest.js';
export const pepaReplacePosterRule = {
  ...pepaPosterRule,
  effects: [...pepaPosterRule.effects, { type: 'setFlag', key: 'campaignPosted' },
    { type: 'startQuest', questId: 'quest.chapter1.journalist' }]
};
export const toniWaterPrepareRule = {
  itemId: 'item.fountain_water_bottle',
  requirements: { items: ['item.fountain_water_bottle'], notFlags: ['tonyPassedOut', 'tonyChallengeResolved'],
    state: { swappedOwnRakiaWithWater: false, tonyVote: false, chapter1Completed: false } },
  effects: [{ type: 'setFlag', key: 'tonyChallengeStarted' },
    { type: 'setFlag', key: 'tonyChallengeDeferred', value: false },
    { type: 'replaceItem', itemId: 'item.fountain_water_bottle', withItemId: 'item.empty_rakia_bottle' },
    { type: 'setState', key: 'swappedOwnRakiaWithWater', value: true }],
  messageKey: 'r39.toni.water_ready'
};
export const toniWaterRules = [toniWaterPrepareRule,
  { itemId: 'item.fountain_water_bottle', effects: [], reject: true, messageKey: 'r39.toni.already_ready' }];
export const diplomaTableRectR39 = { x: 913, y: 466, w: 88, h: 28 };
export function stagePosterContestR39(scenes) {
  return scenes.map(scene => {
    if (scene.id === 'scene.chapter1.village_square') return { ...scene,
      foregroundLayers: [...scene.foregroundLayers.filter(l => l.id !== 'layer.square.campaign_poster'),
        { id: 'layer.square.incumbent_poster', asset: 'incumbentPosterR39', left: 0, top: 0, zIndex: 0.9, hiddenWhenFlag: 'campaignPosted' },
        { id: 'layer.square.campaign_poster', asset: 'mitkoPosterR39', left: 0, top: 0, zIndex: 0.9, visibleWhenFlag: 'campaignPosted' }],
      interactables: scene.interactables.map(t => t.id === 'hotspot.square.kiosk'
        ? { ...t, itemUseRules: t.itemUseRules.map(r => r.itemId === 'item.mitko_photo' && r.effects?.some(e => e.key === 'kioskPamphletsIssued') ? { itemId: r.itemId, ...pepaReplacePosterRule } : r) }
        : t.id === 'hotspot.square.poster_board' ? { ...t, rect: { x: 1052, y: 250, w: 66, h: 164 },
          polygon: [{x:1052,y:264},{x:1118,y:249},{x:1118,y:413},{x:1052,y:409}] } : t) };
    if (scene.id !== 'scene.chapter1.mehana') return scene;
    return { ...scene,
      foregroundLayers: [...scene.foregroundLayers.filter(l => !/^layer\.mehana\.mitko_.*(bottle|glass)/.test(l.id)).map(l => l.id === 'layer.mehana.tony_diploma'
        ? { ...l, asset: 'tonyDiplomaFlatR39', left: diplomaTableRectR39.x, top: diplomaTableRectR39.y, width: diplomaTableRectR39.w, height: diplomaTableRectR39.h } : l),
        { id: 'layer.mehana.tony_rakia_empty_side', asset: 'tonyRakiaEmptySide', left: 1022, top: 466, width: 61, height: 25,
          zIndex: 9, visibleWhenFlag: 'tonyPassedOut' }],
      // No invisible stand-in for removed Mitko props; water is used directly on Toni.
      interactables: scene.interactables.filter(t => t.id !== 'hotspot.mehana.bai_mitko_rakia_glass').map(t => {
        if (t.id !== 'hotspot.mehana.tony_diploma') return t;
        const r=diplomaTableRectR39;
        return { ...t, rect: {...r}, polygon: [{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}] };
      }),
      npcs: scene.npcs.map(n => n.id === 'npc.tony_fridge' ? { ...n, itemUseRules: [...toniWaterRules, ...n.itemUseRules] } : n) };
  });
}
export function wirePosterContestDialoguesR39(dialogues) {
  return dialogues.map(d => {
    if (d.id === 'dialogue.penka_kiosk') return { ...d, nodes: { ...d.nodes, start: { ...d.nodes.start,
      choices: d.nodes.start.choices.map(c => c.textKey === 'photoquest.make_poster' ? { ...c, requirements: pepaReplacePosterRule.requirements, effect: pepaReplacePosterRule } : c) } } };
    if (d.id !== 'dialogue.tony_fridge') return d;
    return { ...d, nodes: { ...d.nodes, start: { ...d.nodes.start, choices: [
      { textKey: 'r39.toni.prepare_choice', requirements: { ...toniWaterPrepareRule.requirements, flags: ['tonyChallengeStarted'] }, effect: toniWaterPrepareRule },
      ...d.nodes.start.choices.map(c => c.next === 'contest_result' ? { ...c,
        requirements: { ...c.requirements, flags: ['tonyChallengeStarted'], notFlags: ['tonyPassedOut','tonyChallengeResolved'] },
        effect: { ...c.effect, requirements: { ...c.effect.requirements, flags: ['tonyChallengeStarted'], notFlags: ['tonyPassedOut','tonyChallengeResolved'] } } } : c)
    ] } } };
  });
}
