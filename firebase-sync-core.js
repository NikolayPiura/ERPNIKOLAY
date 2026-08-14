export const FIREBASE_STATE_KEY = 'piura_firebase_state_v1';
export const FIREBASE_DEVICE_KEY = 'piura_firebase_device_v1';

const EXCLUDED_KEYS = new Set([
  FIREBASE_STATE_KEY,
  FIREBASE_DEVICE_KEY,
  'piura_erp_cloud_v1',
  'piura_erp_local_backups_v1',
  'piura-erp-shell-module',
  'tt_dirty_v1',
  'tt_selected_date_v1',
]);

const EXCLUDED_PREFIXES = [
  'piura_cache_',
  'overview_finance_snapshot_',
  'overview_govee_climate_',
];

export function shouldSyncKey(key) {
  return Boolean(key)
    && !EXCLUDED_KEYS.has(key)
    && !EXCLUDED_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function durableSnapshot(storage) {
  const data = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (shouldSyncKey(key)) data[key] = storage.getItem(key);
  }
  return data;
}

export function hashValue(value) {
  const text = value == null ? '__PIURA_DELETED__' : String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function readSyncState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(FIREBASE_STATE_KEY) || '{}');
    return {
      version: 1,
      keys: parsed && typeof parsed.keys === 'object' ? parsed.keys : {},
      lastSyncAt: Number(parsed?.lastSyncAt || 0),
    };
  } catch {
    return { version: 1, keys: {}, lastSyncAt: 0 };
  }
}

export function writeSyncState(storage, state) {
  storage.setItem(FIREBASE_STATE_KEY, JSON.stringify({
    version: 1,
    keys: state.keys || {},
    lastSyncAt: Number(state.lastSyncAt || 0),
  }));
}

export function detectLocalChanges(snapshot, state, now = Date.now(), trackNew = true) {
  const changes = [];
  const allKeys = new Set([...Object.keys(snapshot), ...Object.keys(state.keys || {})]);

  for (const key of allKeys) {
    const value = Object.hasOwn(snapshot, key) ? snapshot[key] : null;
    const hash = hashValue(value);
    const previous = state.keys[key];
    if (!previous && !trackNew) continue;
    if (previous && previous.hash === hash) continue;
    state.keys[key] = { hash, updatedAt: now };
    changes.push({ key, value, deleted: value == null, updatedAt: now });
  }

  return changes;
}

export function mergeRemoteState(snapshot, remoteEntries, state, now = Date.now()) {
  const apply = [];
  const upload = [];
  const remoteByKey = new Map(remoteEntries.map(entry => [entry.key, entry]));

  for (const entry of remoteEntries) {
    if (!shouldSyncKey(entry.key)) continue;
    const localExists = Object.hasOwn(snapshot, entry.key);
    const localValue = localExists ? snapshot[entry.key] : null;
    const localMeta = state.keys[entry.key];
    const localUpdatedAt = Number(localMeta?.updatedAt || 0);
    const remoteUpdatedAt = Number(entry.updatedAt || 0);

    if (localUpdatedAt > remoteUpdatedAt) {
      upload.push({
        key: entry.key,
        value: localValue,
        deleted: !localExists,
        updatedAt: localUpdatedAt,
      });
      continue;
    }

    const remoteValue = entry.deleted ? null : String(entry.value ?? '');
    if (localValue !== remoteValue) {
      apply.push({ key: entry.key, value: remoteValue, deleted: Boolean(entry.deleted) });
    }
    state.keys[entry.key] = {
      hash: hashValue(remoteValue),
      updatedAt: remoteUpdatedAt || now,
    };
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (remoteByKey.has(key)) continue;
    const updatedAt = Number(state.keys[key]?.updatedAt || now);
    state.keys[key] = { hash: hashValue(value), updatedAt };
    upload.push({ key, value, deleted: false, updatedAt });
  }

  return { apply, upload };
}

export function keyToDocumentId(key) {
  const bytes = new TextEncoder().encode(key);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}
