import { firstMatchingRule, requirementsMet } from './EffectSystem.js';
import { childPhotoRecovery } from '../content/chapter1/photoQuest.js';
import { isCharacterInteraction } from './InteractionApproach.js';

export const CURSOR_ART = Object.freeze({
  look: { id: 'LOOK-A', hotspot: [2, 2] },
  talk: { id: 'SPEAK-A', hotspot: [2, 2] },
  use: { id: 'USE-I', hotspot: [16, 16] },
  take: { id: 'TAKE-A', hotspot: [2, 2] }
});
export const NEUTRAL_CURSOR_ART = Object.freeze({ id: 'N-C', hotspot: [4, 3] });

export function meaningfulUseRule(rule) {
  return Boolean(rule && !rule.reject && (rule.effects?.length || rule.soundCue || rule.sceneSequence || rule.endingTrigger || rule.animation));
}

export function effectiveTargetVerb(game,target,verb=game.selectedVerb) {
  return !game.inventoryUseItemId && isCharacterInteraction(target) && (target.dialogueId || target.talkRules?.length || target.talkKey)
    && cursorTargetSupportsAction(game,target,'talk') ? 'talk' : verb;
}

export function cursorInteractionBlocked(game) {
  return Boolean(game.editMode || game.devHome || game.simpleAnimTest || game.objectCloseup || game.puzzleOpen || game.inspectedItemId
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
    return meaningfulUseRule(explicit || fallback);
  }
  if (target.kind === 'exit') return (verb === 'look' || verb === 'use')
    && requirementsMet(target.accessRequirements, context);
  if (target.droppedItemsPile) return ['look', 'use', 'take'].includes(verb);
  if (verb === 'look') {
    const rule = firstMatchingRule(target.lookRules, context);
    return rule ? accepts(rule) : Boolean(target.lookKey || target.nameKey);
  }
  if (verb === 'take' && target.takeItemId && game.inventory.has(target.takeItemId)) return false;
  if (verb === 'use' && target.plainUseAvailable === false) return false;
  const configured = target.actions?.[verb];
  const sequence = Array.isArray(configured) ? firstMatchingRule(configured, context) : configured;
  if (sequence && requirementsMet(sequence.requirements, context)) return accepts(sequence);
  if (verb === 'talk') {
    const rule = firstMatchingRule(target.talkRules, context);
    return rule ? accepts(rule) : Boolean(target.dialogueId || (isCharacterInteraction(target) && target.talkKey));
  }
  // Game routes both verbs to the same puzzle/recovery handler.
  if ((verb === 'use' || verb === 'take') && target.puzzleId === 'photo_cupboard') {
    return !game.state.flags?.photoCupboardSolved || requirementsMet(childPhotoRecovery.requirements, context);
  }
  if (verb === 'take' && target.takeItemId) {
    const rule = firstMatchingRule(target.takeRules, context);
    return rule ? accepts(rule) : true;
  }
  if (verb === 'use') {
    if (target.plainUseAvailable === false) return false;
    if (target.endingTrigger) return !game.state.chapter1Completed
      && requirementsMet(target.endingTrigger.requirements, context);
    return Boolean(target.objectCloseup || target.useDialogueId || target.television) || meaningfulUseRule(firstMatchingRule(target.useRules, context));
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
    this.itemOverlay=doc.createElement('img');this.itemOverlay.className='inventory-item-cursor';
    this.itemOverlay.setAttribute('aria-hidden','true');this.itemOverlay.draggable=false;
    this.itemOverlay.style.cssText='position:fixed;object-fit:contain;pointer-events:none;z-index:10001;display:none;';doc.body.append(this.itemOverlay);
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
    if(this.itemOverlay)this.itemOverlay.style.display='none';
  }

  update(game, now = globalThis.performance?.now?.() || 0) {
    this.game = game;
    if (!this.overlay || !this.ctx) return;
    const pointer = this.pointer;
    const underPointer = pointer && this.document.elementFromPoint(pointer.x, pointer.y);
    if (!pointer || this.document.hidden || !this.surface.contains(underPointer)) {
      this.itemOverlay.style.display='none';
      this.overlay.style.display = 'none';
      this.key = null;
      return;
    }
    const itemId=game.inventoryUseItemId;
    if(itemId&&!game.inventory.has(itemId)){game.clearInventoryInteraction();}
    if(itemId&&game.inventory.has(itemId)&&!cursorInteractionBlocked(game)){
      const size=game.inventoryCursorSize||{width:78,height:78};
      const imagePath=game.assets.getItemAssetPath(itemId,game.inventoryCursorSlot||'icon');
      if(this.itemOverlay.dataset.assetPath!==imagePath){this.itemOverlay.src=imagePath;this.itemOverlay.dataset.assetPath=imagePath;}
      Object.assign(this.itemOverlay.style,{width:size.width+'px',height:size.height+'px',left:(pointer.x-4)+'px',top:(pointer.y-4)+'px',display:'block'});
      this.itemOverlay.dataset.itemId=itemId;this.overlay.style.display='none';return;
    }
    this.itemOverlay.style.display='none';
    const point = game.renderer.screenToWorld(pointer.x, pointer.y);
    const target = !cursorInteractionBlocked(game) && underPointer === this.canvas ? game.sceneTargetAt(point) : null;
    const closeupButton=game.objectCloseup&&!game.puzzleOpen ? underPointer.closest?.('.object-closeup-item[data-closeup-action]') : null;
    const closeupVerb=closeupButton?.dataset.closeupAction;
    const verb = closeupButton&&['take','use'].includes(closeupVerb) ? closeupVerb : target && target.kind !== 'exit' ? effectiveTargetVerb(game,target) : 'neutral';
    const art = verb === 'neutral' ? NEUTRAL_CURSOR_ART : CURSOR_ART[verb], image = this.images[verb];
    if (!art || !image?.complete || !image.naturalWidth) {
      this.overlay.style.display = 'none';
      return;
    }
    const active = closeupButton ? !closeupButton.disabled : verb !== 'neutral' && cursorTargetSupportsAction(game, target,verb);
    const targetId=closeupButton?.dataset.itemId || target?.id || '';
    const key = `${verb}:${targetId || 'ground'}:${active}:${game.inventoryUseItemId || ''}`;
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
    this.overlay.dataset.target = targetId;
    this.canvas.style.cursor = 'none';
  }
}
