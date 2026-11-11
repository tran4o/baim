// One reusable container, including dropped-item ownership. Never alter rewards.
export const bottleItemIds = ["item.fountain_water_bottle", "item.empty_rakia_bottle", "item.sunflower_oil"];
export function normalizeBottleSave(state) {
  if (state.chapter1Completed) return;
  // Older saves split oiling and turning the valve. Keep the earned repair
  // when migrating to the combined oil-repair route, without granting support.
  if (state.flags.fountainValveOiled) state.flags.fountainRepaired = true;
  const held = bottleItemIds.find(id => state.inventory.includes(id));
  const dropped = state.droppedItems.find(record => bottleItemIds.includes(record.itemId));
  let selected = held || dropped?.itemId;
  const legacy = !state.flags.reusableBottleMigrated;
  if (legacy && !state.chapter1Completed && !selected
    && (state.hasSunflowerOil || state.drankOilBeforeTonyChallenge || state.flags.fountainValveOiled || state.flags.fountainRepaired)) {
    selected = "item.empty_rakia_bottle";
    state.inventory.push(selected);
  }
  if (legacy && selected === "item.sunflower_oil" && (state.flags.fountainValveOiled || state.flags.fountainRepaired)) {
    state.inventory = state.inventory.map(id => id === selected ? "item.empty_rakia_bottle" : id);
    state.droppedItems = state.droppedItems.map(record => record.itemId === selected ? { ...record, itemId: "item.empty_rakia_bottle" } : record);
    selected = "item.empty_rakia_bottle";
  }
  // Retain one physical bottle; prefer a held state over a conflicting dropped copy.
  let keptHeld = false, keptDropped = false;
  state.inventory = state.inventory.filter(id => {
    if (!bottleItemIds.includes(id)) return true;
    if (id !== selected || keptHeld) return false;
    keptHeld = true; return true;
  });
  state.droppedItems = state.droppedItems.filter(record => {
    if (!bottleItemIds.includes(record.itemId)) return true;
    if (keptHeld || keptDropped || record.itemId !== selected) return false;
    keptDropped = true; return true;
  });
  state.flags.reusableBottleMigrated = true;
}
