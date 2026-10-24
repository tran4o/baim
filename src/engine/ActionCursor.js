import { firstMatchingRule, requirementsMet } from './EffectSystem.js';

export const CURSOR_ART = Object.freeze({
  look: { id: 'LOOK-A', hotspot: [2, 2] },
  talk: { id: 'SPEAK-A', hotspot: [2, 2] },
  use: { id: 'USE-I', hotspot: [16, 16] },
  take: { id: 'TAKE-A', hotspot: [2, 2] }
});
export const NEUTRAL_CURSOR_ART = Object.freeze({ id: 'N-C', hotspot: [4, 3] });

export function cursorInteractionBlocked(game) {
  return Boolean(game.editMode || game.devHome || game.simpleAnimTest || game.puzzleOpen || game.inspectedItemId
    || game.sceneAction?.active || game.menuOpen || game.paused || game.dialogue?.current
    || game.sceneTransitionPending || game.player?.actionSequence || game.player?.animation === 'action');
}

// This query must never perform an interaction, change inventory or advance a quest.
export function cursorTargetSupportsAction(game, target, verb = game.selectedVerb) {
  if (!target || !game.targetAvailable(target)) return false;
  const context = game.effectContext();
  const accepts = rule => Boolean(rule && !rule.reject);
  if (game.inventoryUseItemId) {
    const id = game.inventoryUseItemId;
    if (!game.inventory.has(id)) return false;
    const explicit = firstMatchingRule((target.itemUseRules || []).filter(rule => rule.itemId === id), context);
    const fallback = firstMatchingRule((game.content.items[id]?.targetUseRules || [])
      .filter(rule => game.itemTargetRuleMatches(rule, target)), context);
    return accepts(explicit || fallback);
  }
  if (target.kind === 'exit') return (verb === 'look' || verb === 'use')
    && requirementsMet(target.accessRequirements, context);
  if (target.droppedItemsPile) return ['look', 'use', 'take'].includes(verb);
  if (verb === 'look') {
    const rule = firstMatchingRule(target.lookRules, context);
    return rule ? accepts(rule) : Boolean(target.lookKey || target.nameKey);
  }
  if (verb === 'take' && target.takeItemId && game.inventory.has(target.takeItemId)) return false;
  const configured = target.actions?.[verb];
  const sequence = Array.isArray(configured) ? firstMatchingRule(configured, context) : configured;
  if (sequence && requirementsMet(sequence.requirements, context)) return accepts(sequence);
  if (verb === 'talk') {
    const rule = firstMatchingRule(target.talkRules, context);
    return rule ? accepts(rule) : Boolean(target.talkKey || target.dialogueId);
  }
  if (verb === 'take' && target.takeItemId) {
    const rule = firstMatchingRule(target.takeRules, context);
    return rule ? accepts(rule) : true;
  }
  if (verb === 'use') {
    if (target.puzzleId === 'photo_cupboard') return !game.state.flags?.photoCupboardSolved;
    if (target.endingTrigger) return !game.state.chapter1Completed
      && requirementsMet(target.endingTrigger.requirements, context);
    return Boolean(target.useDialogueId) || accepts(firstMatchingRule(target.useRules, context));
  }
  return false;
}

export function cursorFrameAt(active, elapsedMs) {
  return active ? Math.floor(Math.max(0, elapsedMs) / 50) % 48 : 0;
}

export class ActionCursor {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointer = null;
    this.images = {};
    this.key = null;
    this.startedAt = 0;
    const doc = canvas?.ownerDocument;
    if (!doc?.createElement || !doc.defaultView?.Image) return;
    this.document = doc;
    this.view = doc.defaultView;
    this.surface = canvas.closest?.('#app') || canvas;
    const style = doc.createElement('style');
    style.textContent = '#app, #app * { cursor: none !important; }';
    doc.head.append(style);
    this.overlay = doc.createElement('canvas');
    this.overlay.width = this.overlay.height = 64;
    this.overlay.className = 'action-cursor';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.style.cssText = 'position:fixed;width:32px;height:32px;pointer-events:none;z-index:10000;display:none;';
    this.ctx = this.overlay.getContext('2d');
    doc.body.append(this.overlay);
    for (const verb of [...Object.keys(CURSOR_ART), 'neutral']) {
      const image = new this.view.Image();
      image.src = new URL(`../../assets/ui/action-cursors/${verb}.png`, import.meta.url).href;
      this.images[verb] = image;
    }
    this.surface.addEventListener('pointermove', event => {
      if (event.pointerType && event.pointerType !== 'mouse') { this.hide(); return; }
      this.pointer = { x: event.clientX, y: event.clientY };
      if (this.game) this.update(this.game);
    });
    this.surface.addEventListener('pointerleave', () => this.hide());
    this.view.addEventListener('blur', () => this.hide());
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) this.hide(); });
  }

  hide() {
    this.pointer = null;
    this.key = null;
    if (this.overlay) this.overlay.style.display = 'none';
  }

  update(game, now = globalThis.performance?.now?.() || 0) {
    this.game = game;
    if (!this.overlay || !this.ctx) return;
    const pointer = this.pointer;
    const underPointer = pointer && this.document.elementFromPoint(pointer.x, pointer.y);
    if (!pointer || this.document.hidden || !this.surface.contains(underPointer)) {
      this.overlay.style.display = 'none';
      this.key = null;
      return;
    }
    const point = game.renderer.screenToWorld(pointer.x, pointer.y);
    const target = !cursorInteractionBlocked(game) && underPointer === this.canvas ? game.sceneTargetAt(point) : null;
    const verb = target && target.kind !== 'exit' ? game.selectedVerb : 'neutral';
    const art = verb === 'neutral' ? NEUTRAL_CURSOR_ART : CURSOR_ART[verb], image = this.images[verb];
    if (!art || !image?.complete || !image.naturalWidth) {
      this.overlay.style.display = 'none';
      return;
    }
    const active = verb !== 'neutral' && cursorTargetSupportsAction(game, target);
    const key = `${verb}:${target?.id || 'ground'}:${active}:${game.inventoryUseItemId || ''}`;
    if (key !== this.key) { this.key = key; this.startedAt = now; }
    const frame = cursorFrameAt(active, now - this.startedAt);
    this.ctx.clearRect(0, 0, 64, 64);
    this.ctx.drawImage(image, frame % 8 * 96, Math.floor(frame / 8) * 96, 96, 96, 0, 0, 64, 64);
    this.overlay.style.left = `${pointer.x - art.hotspot[0]}px`;
    this.overlay.style.top = `${pointer.y - art.hotspot[1]}px`;
    this.overlay.style.display = 'block';
    this.overlay.dataset.verb = verb;
    this.overlay.dataset.active = String(active);
    this.overlay.dataset.frame = String(frame);
    this.overlay.dataset.target = target?.id || '';
    this.canvas.style.cursor = 'none';
  }
}
