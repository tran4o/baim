// Dialogue timing is owned by Game. This controller only blends fixed poses
// around that reading window; an ended mouth loop never continues playing.
export class SceneNpcSpeech {
  constructor() { this.reset(); }
  reset() { this.sceneId = null; this.entries = new Map(); this.seenTokens = new WeakSet(); }

  update(scene, deltaMs, { paused = false, canceled = false, visible = () => true,
    speech = () => null, conversation = () => false, available = () => true,
    idleSamples = () => null } = {}) {
    if (scene.id !== this.sceneId) { this.reset(); this.sceneId = scene.id; }
    const present = new Set(), dt = Math.max(0, Number(deltaMs) || 0);
    for (const layer of scene.foregroundLayers || []) {
      const config = layer.speechAnimation;
      if (!config || !visible(layer) || !scene.npcs?.some(n => n.id === config.npcId)) continue;
      present.add(layer.id);
      let state = this.entries.get(layer.id);
      if (!state) {
        state = { phase: 'idle', token: null, admitted: false, speechTime: 0,
          transitionTime: 0, transitionDuration: 0, fromSamples: [], idleTime: 0 };
        this.entries.set(layer.id, state);
      }
      const transition = (phase, duration) => {
        // Freeze the current composite, including interruptions mid-blend.
        state.fromSamples = state.phase === 'idle'
          ? idleSamples(layer) || this.presentation(scene.id, layer).samples
          : this.presentation(scene.id, layer).samples;
        state.phase = phase; state.transitionTime = 0; state.transitionDuration = duration;
      };
      if (canceled) {
        state.phase = 'idle'; state.admitted = false; state.fromSamples = [];
        state.transitionDuration = 0;
        state.token = speech(config.npcId)?.token || state.token;
        if (state.token) this.seenTokens.add(state.token);
        state.idleTime = 0; continue;
      }
      if (paused) continue;
      const line = speech(config.npcId), engaged = conversation(config.npcId);
      const canListen = available(config.listeningPose) || available(config);
      const newLine = line && line.token !== state.token;
      if (newLine) {
        state.token = line.token;
        state.admitted = !this.seenTokens.has(line.token) && available(config) && canListen;
        this.seenTokens.add(line.token);
        const target = state.admitted ? 'speaking' : engaged && canListen ? 'listening' : 'idle';
        transition(target, target === 'idle' ? 0 : state.phase === 'idle' ? config.entryDurationMs : config.transitionDurationMs);
        state.speechTime = line.elapsed;
      } else if (line && state.admitted && state.phase === 'speaking' && available(config)) {
        state.speechTime = line.elapsed; state.transitionTime += dt;
      } else if (engaged) {
        const target = canListen ? 'listening' : 'idle';
        if (state.phase !== target) {
          if (state.phase === 'speaking') state.admitted = false;
          transition(target, state.phase === 'idle' ? config.entryDurationMs : config.settleDurationMs);
        } else state.transitionTime += dt;
      } else if (state.phase === 'speaking' || state.phase === 'listening') {
        transition('returning', config.entryDurationMs); state.idleTime = 0;
      } else if (state.phase === 'returning') {
        state.transitionTime += dt;
        if (state.transitionTime >= state.transitionDuration) {
          state.phase = 'idle'; state.fromSamples = []; state.transitionDuration = 0;
        }
      }
      if (state.phase === 'idle' || state.phase === 'returning') state.idleTime += dt;
      state.transitionTime = Math.min(state.transitionTime, state.transitionDuration);
      // Admission survives ending/eviction: loading art late cannot replay a line.
    }
    for (const id of this.entries.keys()) if (!present.has(id)) this.entries.delete(id);
  }

  presentation(sceneId, layer) {
    if (sceneId !== this.sceneId) return null;
    const state = this.entries.get(layer.id);
    if (!state) return null;
    const t = state.transitionDuration ? Math.min(1, state.transitionTime / state.transitionDuration) : 1;
    const eased = t * t * (3 - 2 * t);
    const target = state.phase === 'speaking' ? { kind: 'speech', time: state.speechTime }
      : state.phase === 'listening' ? { kind: 'listener', time: 0 } : { kind: 'idle', time: state.idleTime };
    const samples = [...state.fromSamples.map(s => ({ ...s, weight: s.weight * (1 - eased) })),
      { ...target, weight: eased }].filter(s => s.weight > 0);
    const weight = kind => samples.filter(s => s.kind === kind).reduce((n,s)=>n+s.weight,0);
    return { ...state, samples, speechWeight: weight('speech'), listeningWeight: weight('listener'),
      idleWeight: weight('idle') + weight('snapshot'), blendComplete: t === 1 };
  }
}
