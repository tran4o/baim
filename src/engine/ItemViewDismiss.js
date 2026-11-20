// Consume the closing click; a drag that starts on the model never dismisses it.
export function mountItemViewDismiss(panel, viewer, close) {
  panel.dataset.outsideDismiss = 'true';
  let gesture = null;
  panel.addEventListener('pointerdown', event => {
    gesture = { inside: viewer.contains(event.target), x: event.clientX, y: event.clientY, button: event.button };
  }, true);
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  panel.addEventListener('pointerup', event => event.stopPropagation());
  panel.addEventListener('pointercancel', () => { gesture = null; });
  panel.addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation();
    const start = gesture; gesture = null;
    if (viewer.contains(event.target) || start?.inside || (start && (start.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6))) return;
    close();
  }, true);
  panel.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); });
}
