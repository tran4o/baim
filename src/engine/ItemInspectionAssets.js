// A changed inventory print must select its matching native model, never another edition.
export function resolveItemInspectionAsset(asset = {}, iconSlot = 'icon') {
  const variant = iconSlot === 'icon' ? asset : asset.inspectionModels?.[iconSlot];
  const selected = variant ? { ...asset, ...variant } : {};
  if (!variant?.model || !variant.nativeSource?.endsWith('.blend')) {
    return { ...selected, model: null, inspectionFailure: variant ? 'missing-native-model' : 'missing-state-model', iconSlot };
  }
  return { ...selected, iconSlot };
}

export function mountUnavailableItemInspection(host, text, reason) {
  host.dataset.modelState = 'error';
  host.dataset.inspectionType = 'unavailable';
  host.dataset.modelError = reason;
  const status = document.createElement('span');
  status.className = 'item-model-status'; status.setAttribute('role', 'status');
  status.textContent = text.unavailable; host.append(status);
  return { dispose() { status.remove(); } };
}
