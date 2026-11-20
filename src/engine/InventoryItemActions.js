import { actionIconUrl } from './ActionIcons.js';
// The panel owns selection; this view only positions and animates its two ears.
export function mountInventoryItemActions(panel, dock, item, { text, inspect, use, animate = true }) {
  const root = document.createElement('div');
  root.className = 'inventory-item-actions inventory-ear-actions is-open' + (animate ? ' is-entering' : '');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', text.group);
  for (const [side, verb, label, action] of [['left', 'look', text.inspect, inspect], ['right', 'use', text.use, use]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inventory-ear inventory-ear-' + side;
    button.setAttribute('aria-label', label);
    const icon = document.createElement('span');
    icon.className = 'inventory-ear-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.backgroundImage = 'url("' + actionIconUrl(verb) + '")';
    button.appendChild(icon);
    button.addEventListener('click', event => { event.stopPropagation(); action(); });
    root.appendChild(button);
  }
  panel.appendChild(root);
  let disposed = false;
  const position = () => {
    if (disposed || !item.isConnected) return;
    const p = panel.getBoundingClientRect(), r = item.getBoundingClientRect(), clip = dock.getBoundingClientRect();
    const scale = p.width / panel.offsetWidth;
    root.hidden = r.top < clip.top - 1 || r.bottom > clip.bottom + 1;
    root.style.left = (r.left - p.left) / scale - panel.clientLeft + 'px';
    root.style.top = (r.top - p.top) / scale - panel.clientTop + 'px';
    root.style.width = r.width / scale + 'px';
    root.style.height = r.height / scale + 'px';
  };
  dock.addEventListener('scroll', position);
  window.addEventListener('resize', position);
  queueMicrotask(position);
  const dispose = (keepRoot = false) => {
    disposed = true;
    dock.removeEventListener('scroll', position);
    window.removeEventListener('resize', position);
    if (!keepRoot) root.remove();
  };
  return { root, itemId: item.dataset.itemId, dispose, position,
    close() {
      if (!root.isConnected || root.hidden) { dispose(); return; }
      // Retain a short-lived visual copy outside renderUi, so a normal world/UI
      // click can continue while the ears slide back under a stationary slot.
      const host = panel.closest('#app'), h = host.getBoundingClientRect(), r = item.getBoundingClientRect(), scale = h.width / host.offsetWidth;
      const retiring = document.createElement('div');
      retiring.className = 'inventory-ears-retiring';
      retiring.setAttribute('aria-hidden', 'true');
      Object.assign(retiring.style, { left: (r.left - h.left) / scale + 'px', top: (r.top - h.top) / scale + 'px', width: r.width / scale + 'px', height: r.height / scale + 'px' });
      const cover = document.createElement('div');
      cover.append(...[...item.childNodes].map(child => child.cloneNode(true)));
      cover.className = 'inventory-ear-cover';
      cover.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
      root.classList.remove('inventory-item-actions', 'is-entering');
      root.querySelectorAll('button').forEach(button => { button.disabled = true; button.tabIndex = -1; });
      dispose(true);
      Object.assign(root.style, { left: '0px', top: '0px' });
      retiring.append(root, cover); host.appendChild(retiring);
      root.getBoundingClientRect();
      root.classList.remove('is-open');
      setTimeout(() => retiring.remove(), 170);
    }
  };
}
