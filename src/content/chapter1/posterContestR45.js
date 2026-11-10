export const fullPosterPanelR45={"rect":{"x":1048,"y":237,"w":71,"h":184},"polygon":[{"x":1048,"y":250},{"x":1117,"y":237},{"x":1119,"y":421},{"x":1051,"y":416}]};
// Fill the existing panel surface; preserve all transaction/save/inventory behavior.
export function stagePosterContestR45(scenes) {
  return scenes.map(s=>s.id!=='scene.chapter1.village_square'?s:{...s,
    foregroundLayers:s.foregroundLayers.map(l=>l.id==='layer.square.campaign_poster'
      ? {id:l.id,asset:'mitkoPosterR45',left:0,top:0,zIndex:0.9,visibleWhenFlag:'campaignPosted'}:l),
    interactables:s.interactables.map(t=>t.id==='hotspot.square.poster_board'
      ? {...t,rect:{...fullPosterPanelR45.rect},polygon:fullPosterPanelR45.polygon.map(p=>({...p}))}:t)});
}
