// Runtime-only quiet-idle scheduling. Rendering reads presentations; it never
// samples randomness, advances clocks, queues work or starts an animation.
export class SceneIdleVariations {
  constructor(random = Math.random) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.sceneId = null;
    this.entries = new Map();
  }

  interval(config) {
    const value = Math.max(0, Math.min(1, Number(this.random()) || 0));
    return config.intervalMinMs + value * (config.intervalMaxMs - config.intervalMinMs);
  }

  update(scene, deltaMs, { paused = false, blocked = false, visible = () => true, available = () => true } = {}) {
    if (this.sceneId !== scene.id) {
      this.reset();
      this.sceneId = scene.id;
    }
    const present = new Set();
    const elapsed = Math.max(0, Number(deltaMs) || 0);
    for (const layer of scene.foregroundLayers || []) {
      const config = layer.idleVariation;
      if (!config || !visible(layer) || !scene.npcs?.some(npc => npc.id === config.npcId)) continue;
      present.add(layer.id);
      let state = this.entries.get(layer.id);
      if (!state) {
        state = { phase: 'blocked', remainingMs: null, idleTime: 0, elapsed: 0, config };
        this.entries.set(layer.id, state);
      }
      if (blocked) {
        // Discard rather than suspend a conversation/scene-canceled occurrence.
        state.phase = 'blocked';
        state.remainingMs = null;
        state.idleTime = 0;
        state.elapsed = 0;
        continue;
      }
      if (paused) continue;
      if (!available(layer.animation)) continue;
      if (state.phase === 'blocked') {
        state.phase = 'idle';
        state.remainingMs = this.interval(config);
      }
      const animation = config.animation;
      const durationMs = animation.frameCount * (animation.frameDurationMs || 1000 / animation.fps);
      if (state.phase === 'playing') {
        state.elapsed += elapsed;
        if (state.elapsed >= durationMs || !available(animation)) {
          state.phase = 'idle';
          state.elapsed = 0;
          state.idleTime = 0;
          state.remainingMs = this.interval(config);
        }
      } else {
        state.idleTime += elapsed;
        state.remainingMs -= elapsed;
        if (state.remainingMs <= 0) {
          if (available(animation)) {
            state.phase = 'playing';
            state.elapsed = 0;
          } else {
            // Consume this occurrence. Late-loaded art waits a full new interval.
            state.remainingMs = this.interval(config);
          }
        }
      }
    }
    for (const id of this.entries.keys()) if (!present.has(id)) this.entries.delete(id);
  }

  presentation(sceneId, layer) {
    if (this.sceneId !== sceneId) return null;
    const state = this.entries.get(layer.id);
    if (!state || state.phase === 'blocked') return null;
    return { phase: state.phase, remainingMs: state.remainingMs, idleTime: state.idleTime,
      elapsed: state.elapsed, animation: state.phase === 'playing' ? state.config.animation : layer.animation };
  }
}

export function sceneIdleVariationsBlocked(game) {
  return Boolean(game.sceneAction?.active || game.dialogue?.current || game.speechBubble || game.pendingSpeechBubble
    || game.npcSpeechBubble || game.player?.speaking || game.player?.actionSequence
    || game.player?.animation === 'action' || game.sceneTransitionPending
    || game.devHome || game.editMode || game.animLab || game.simpleAnimTest || game.state?.chapter1Completed);
}
