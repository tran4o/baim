// Shared default for every collected 3D object; no animation or orbit loop.
export const INSPECTION_PROFILE = Object.freeze({ id: 'bottle-front-facing-v1', tiltLimit: Math.PI / 12, minZoom: 1, maxZoom: 1.5 });

export function mountInspectionControls(canvas, onChange) {
  const { tiltLimit, minZoom, maxZoom } = INSPECTION_PROFILE;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let pitch = 0, yaw = 0, zoom = 1, pointer = null, origin = null;
  const state = () => ({ pitch, yaw, zoom });
  const emit = () => onChange(state());
  const reset = () => { if (pointer !== null) up({ pointerId: pointer }); pitch = yaw = 0; zoom = 1; emit(); };
  const down = event => {
    if (event.button !== 0 || pointer !== null) return;
    pointer = event.pointerId; origin = { x: event.clientX, y: event.clientY, pitch, yaw };
    canvas.setPointerCapture(pointer); canvas.focus(); event.preventDefault();
  };
  const move = event => {
    if (event.pointerId !== pointer || !origin) return;
    const radius = Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight) / 2);
    yaw = clamp(origin.yaw + (event.clientX - origin.x) / radius * tiltLimit, -tiltLimit, tiltLimit);
    pitch = clamp(origin.pitch + (event.clientY - origin.y) / radius * tiltLimit, -tiltLimit, tiltLimit);
    emit();
  };
  const up = event => {
    if (event.pointerId !== pointer) return;
    const id = pointer; pointer = origin = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const wheel = event => {
    event.preventDefault(); event.stopPropagation();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    const next = clamp(zoom * Math.exp(-clamp(pixels, -200, 200) * .0015), minZoom, maxZoom);
    if (next === zoom) return;
    zoom = next; emit();
  };
  const key = event => { if (event.key === 'Home') { event.preventDefault(); reset(); } };
  const handlers = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up], ['wheel', wheel], ['keydown', key]];
  for (const [type, handler] of handlers) canvas.addEventListener(type, handler, type === 'wheel' ? { passive: false } : undefined);
  return { state, reset, dispose() {
    for (const [type, handler] of handlers) canvas.removeEventListener(type, handler);
    const id = pointer; pointer = origin = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  } };
}
