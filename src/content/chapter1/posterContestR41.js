// R41 is a presentation-only correction; R40 inventory and quest rules remain intact.
export function stagePosterContestR41(scenes) {
  return scenes.map(s => s.id === 'scene.chapter1.village_square' ? { ...s,
    foregroundLayers: s.foregroundLayers.map(l => l.id === 'layer.square.campaign_poster'
      ? { ...l, asset: 'affinityPosterR41' } : l) }
    : s.id !== 'scene.chapter1.mehana' ? s : { ...s,
    foregroundLayers: s.foregroundLayers.map(l => l.id === 'layer.mehana.tony_rakia_empty_side'
      ? { ...l, left: 1035, top: 460 } : l) });
}
