export class InventorySystem {
  constructor(itemsById, state) {
    this.itemsById = itemsById;
    this.state = state;
  }

  has(itemId) {
    return this.state.inventory.includes(itemId);
  }

  add(itemId) {
    if (!this.has(itemId)) this.state.inventory.push(itemId);
  }

  remove(itemId) {
    this.state.inventory = this.state.inventory.filter((id) => id !== itemId);
  }

  // Contents change in one synchronous operation; stale duplicate events do nothing.
  replace(itemId, withItemId, { preserveSlot = false } = {}) {
    if (!this.has(itemId) || this.has(withItemId)
      || this.state.droppedItems?.some(record => record.itemId === withItemId)) return false;
    if (preserveSlot) this.state.inventory = this.state.inventory.map(id => id === itemId ? withItemId : id);
    else {
      this.state.inventory = this.state.inventory.filter(id => id !== itemId);
      this.state.inventory.push(withItemId);
    }
    return true;
  }

  list() {
    return this.state.inventory.map((id) => this.itemsById[id]).filter(Boolean);
  }
}
