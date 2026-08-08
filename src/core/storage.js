const CHANGE_EVENT = 'piura:storage';

export function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? structuredClone(fallback) : JSON.parse(value);
  } catch {
    return structuredClone(fallback);
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key, value } }));
  return value;
}

export function updateJson(key, fallback, updater) {
  const next = updater(readJson(key, fallback));
  return writeJson(key, next);
}

export function subscribeStorage(listener) {
  const localListener = event => listener(event.detail);
  const browserListener = event => listener({ key: event.key, value: event.newValue });
  window.addEventListener(CHANGE_EVENT, localListener);
  window.addEventListener('storage', browserListener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, localListener);
    window.removeEventListener('storage', browserListener);
  };
}

export const keys = Object.freeze({
  theme: 'piura_erp_theme_v2',
  density: 'piura_erp_density_v2',
  serviceSettings: 'piura_erp_service_settings_v1',
  cloud: 'piura_erp_cloud_v1',
  financeCache: 'piura_cache_finance_v1',
  effectiveness: 'pu_v9',
  morningBlocks: 'morn_v8_blocks',
  morningState: 'morn_v8_state',
  time: 'tt_v4',
  timeCategories: 'tt_cats_v1',
  weekly: 'wt5',
  admin: 'adminv6',
  roadmap: 'roadmap_items_v1',
  funds: 'piura_funds_v4',
  pffCache: 'piura_cache_pff_v1',
  moscowCache: 'piura_cache_msk_v1',
  safeCache: 'piura_cache_safe_v1'
});
