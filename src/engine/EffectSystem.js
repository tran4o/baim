export function requirementsMet(requirements = {}, context = {}) {
  if (requirements.disabled) return false;
  const state = context.state || {};
  const flags = state.flags || {};
  const inventory = context.inventory;
  if (requirements.anyOf?.length && !requirements.anyOf.some(rule => requirementsMet(rule, context))) return false;

  if ((requirements.items || []).some((itemId) => !inventory?.has(itemId))) return false;
  if ((requirements.absentItems || []).some((itemId) => (
    inventory?.has(itemId) || (state.droppedItems || []).some((record) => record.itemId === itemId)
  ))) return false;
  if ((requirements.flags || []).some((flag) => !flags[flag])) return false;
  if ((requirements.notFlags || []).some((flag) => Boolean(flags[flag]))) return false;
  if (requirements.anyStateTrue?.length && !requirements.anyStateTrue.some((key) => Boolean(state[key]))) return false;
  if (requirements.state && Object.entries(requirements.state).some(([key, value]) => state[key] !== value)) return false;
  if (requirements.stateMin && Object.entries(requirements.stateMin).some(([key, value]) => Number(state[key]) < Number(value))) return false;
  if (requirements.stateMax && Object.entries(requirements.stateMax).some(([key, value]) => Number(state[key]) > Number(value))) return false;
  return true;
}

export function firstMatchingRule(rules = [], context = {}) {
  return rules.find((rule) => requirementsMet(rule.requirements, context)) || null;
}

// Gameplay systems share this save-state object. Keep its existing containers
// alive on rollback, including arrays replaced by inventory/quest operations.
function checkpoint(value) {
  const entries = Object.entries(value);
  const children = entries.filter(([, child]) => child && typeof child === "object")
    .map(([, child]) => checkpoint(child));
  const length = Array.isArray(value) ? value.length : null;
  return () => {
    for (const key of Object.keys(value)) delete value[key];
    if (length !== null) value.length = length;
    for (const [key, child] of entries) value[key] = child;
    for (const restore of children) restore();
  };
}

// One synchronous batch: true commits all selected effects; false restores the
// shared gameplay state. Invalid content also rolls back, then throws loudly.
export function applyEffects(effects = [], context = {}) {
  const restore = checkpoint(context.state || {});
  try {
    if (!applyEffectBatch(effects, context)) {
      restore();
      return false;
    }
    return true;
  } catch (error) {
    restore();
    throw error;
  }
}

function applyEffectBatch(effects, context) {
  const state = context.state || {};
  state.flags ||= {};

  for (const effect of effects) {
    if (effect.requirements && !requirementsMet(effect.requirements, context)) continue;
    if (effect.type === "setFlag") {
      state.flags[effect.key] = effect.value ?? true;
    } else if (effect.type === "setState") {
      state[effect.key] = effect.value;
    } else if (effect.type === "adjustState") {
      const adjusted = (Number(state[effect.key]) || 0) + Number(effect.amount || 0);
      const minimum = Number.isFinite(Number(effect.min)) ? Number(effect.min) : -Infinity;
      const maximum = Number.isFinite(Number(effect.max)) ? Number(effect.max) : Infinity;
      state[effect.key] = Math.max(minimum, Math.min(maximum, adjusted));
      if (effect.timestampKey) state[effect.timestampKey] = state[effect.key] > minimum ? (context.now?.() ?? Date.now()) : null;
    } else if (effect.type === "addItem") {
      context.inventory?.add(effect.itemId);
    } else if (effect.type === "replaceItem") {
      if (!context.inventory?.replace(effect.itemId, effect.withItemId, { preserveSlot: effect.preserveSlot === true })) return false;
    } else if (effect.type === "removeItem") {
      context.inventory?.remove(effect.itemId);
    } else if (effect.type === "startQuest") {
      context.quests?.start?.(effect.questId);
    } else if (effect.type === "completeQuest") {
      context.quests?.complete?.(effect.questId);
    } else if (effect.type === "expireQuest") {
      context.quests?.expire?.(effect.questId);
    } else {
      throw new Error(`Unknown content effect type: ${effect.type}`);
    }
  }
  return true;
}
