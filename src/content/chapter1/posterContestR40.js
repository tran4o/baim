import { pepaPosterRule } from './photoQuest.js';
import { campaignPosterRules } from './campaign.js';
export const pepaPreparePosterR40 = {
  ...pepaPosterRule,
  requirements: { ...pepaPosterRule.requirements, absentItems: ['item.campaign_pamphlets'] },
  effects: [{ type: 'replaceItem', itemId: 'item.mitko_photo', withItemId: 'item.campaign_pamphlets', preserveSlot: true },
    { type: 'setFlag', key: 'kioskPamphletsIssued' }],
  messageKey: 'r40.poster.prepared'
};
export const placePosterR40 = {
  ...campaignPosterRules[0],
  requirements: { ...campaignPosterRules[0].requirements, flags: ['kioskPamphletsIssued'] },
  messageKey: 'r40.poster.placed'
};
export const diplomaTableRectR40 = { x: 925, y: 469, w: 104, h: 34 };
export function stagePosterContestR40(scenes) {
  return scenes.map(s => {
    if (s.id === 'scene.chapter1.village_square') return { ...s,
      foregroundLayers: s.foregroundLayers.map(l => l.id === 'layer.square.incumbent_poster' ? { ...l, asset: 'incumbentPosterR40' }
        : l.id === 'layer.square.campaign_poster' ? { ...l, asset: 'mitkoPosterR40' } : l),
      interactables: s.interactables.map(t => t.id === 'hotspot.square.kiosk' ? { ...t,
        itemUseRules: t.itemUseRules.map(r => r.itemId === 'item.mitko_photo' && r.effects?.some(e => e.key === 'kioskPamphletsIssued')
          ? { itemId: r.itemId, ...pepaPreparePosterR40 } : r) }
        : t.id === 'hotspot.square.poster_board' ? { ...t, itemUseRules: [placePosterR40, ...t.itemUseRules.slice(1)] } : t) };
    if (s.id !== 'scene.chapter1.mehana') return s;
    return { ...s, foregroundLayers: s.foregroundLayers.map(l => {
      if (l.id === 'layer.mehana.tony_diploma') return { ...l, left: diplomaTableRectR40.x, top: diplomaTableRectR40.y,
        width: diplomaTableRectR40.w, height: diplomaTableRectR40.h };
      if (l.id === 'layer.mehana.tony_rakia_half') return { ...l, left: 894, top: 411 };
      if (l.id === 'layer.mehana.tony_rakia_empty_side') return { ...l, left: 857, top: 458 };
      return l;
    }), interactables: s.interactables.map(t => {
      if (t.id !== 'hotspot.mehana.tony_diploma') return t;
      const r=diplomaTableRectR40;
      return { ...t, rect: {...r}, polygon: [{x:r.x,y:r.y+12},{x:r.x+78,y:r.y},{x:r.x+r.w,y:r.y+20},{x:r.x+26,y:r.y+r.h}] };
    }) };
  });
}
export function wirePosterDialoguesR40(dialogues) {
  return dialogues.map(d => d.id !== 'dialogue.penka_kiosk' ? d : { ...d, nodes: { ...d.nodes, start: { ...d.nodes.start,
    choices: d.nodes.start.choices.map(c => c.textKey !== 'photoquest.make_poster' ? c
      : { ...c, requirements: pepaPreparePosterR40.requirements, effect: pepaPreparePosterR40 }) } } });
}
