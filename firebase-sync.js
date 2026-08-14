import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import {
  firebaseConfig,
  firebaseOwnerEmail,
  isFirebaseConfigured,
} from './firebase-config.js';
import {
  FIREBASE_DEVICE_KEY,
  detectLocalChanges,
  durableSnapshot,
  hashValue,
  keyToDocumentId,
  mergeRemoteState,
  readSyncState,
  writeSyncState,
} from './firebase-sync-core.js';

const MAX_VALUE_BYTES = 850_000;
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ login_hint: firebaseOwnerEmail });

let auth = null;
let db = null;
let currentUser = null;
let state = readSyncState(localStorage);
let unsubscribe = null;
let scanTimer = null;
let busy = false;
let lastStatus = {};
let autoSignInPending = false;
let autoSignInBlocked = false;
let gestureSignInHandler = null;

function deviceId() {
  let value = localStorage.getItem(FIREBASE_DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(FIREBASE_DEVICE_KEY, value);
  }
  return value;
}

function emit(phase, message, extra = {}) {
  lastStatus = {
    phase,
    message,
    configured: isFirebaseConfigured,
    signedIn: Boolean(currentUser),
    email: currentUser?.email || '',
    lastSyncAt: state.lastSyncAt || 0,
    ...extra,
  };
  window.dispatchEvent(new CustomEvent('piura-firebase-status', { detail: lastStatus }));
}

function userCollection() {
  if (!db || !currentUser) throw new Error('Войдите через Google');
  return collection(db, 'users', currentUser.uid, 'erpState');
}

function remoteTime(data) {
  return Number(data.clientUpdatedAt || data.updatedAt?.toMillis?.() || 0);
}

function snapshotEntries(snapshot) {
  return snapshot.docs
    .map(item => {
      const data = item.data() || {};
      return {
        key: String(data.key || ''),
        value: data.value,
        deleted: Boolean(data.deleted),
        updatedAt: remoteTime(data),
      };
    })
    .filter(entry => entry.key);
}

function applyRemote(operations) {
  let changed = false;
  for (const operation of operations) {
    if (operation.deleted) {
      if (localStorage.getItem(operation.key) != null) {
        localStorage.removeItem(operation.key);
        changed = true;
      }
    } else if (localStorage.getItem(operation.key) !== operation.value) {
      localStorage.setItem(operation.key, operation.value);
      changed = true;
    }
  }
  return changed;
}

function assertDocumentSize(operation) {
  if (operation.deleted) return;
  const bytes = new Blob([operation.value || '']).size;
  if (bytes > MAX_VALUE_BYTES) {
    throw new Error(`Раздел «${operation.key}» слишком большой для одного документа Firestore`);
  }
}

async function pushOperations(operations) {
  if (!operations.length) return 0;
  const unique = [...new Map(operations.map(operation => [operation.key, operation])).values()];
  unique.forEach(assertDocumentSize);
  const base = userCollection();

  for (let offset = 0; offset < unique.length; offset += 400) {
    const part = unique.slice(offset, offset + 400);
    const batch = writeBatch(db);
    for (const operation of part) {
      batch.set(doc(base, keyToDocumentId(operation.key)), {
        key: operation.key,
        value: operation.deleted ? null : String(operation.value ?? ''),
        deleted: Boolean(operation.deleted),
        clientUpdatedAt: Number(operation.updatedAt || Date.now()),
        updatedAt: serverTimestamp(),
        deviceId: deviceId(),
        schemaVersion: 1,
      });
    }
    await batch.commit();
  }
  return unique.length;
}

async function scanAndPush(force = false) {
  if (!currentUser || busy) return 0;
  busy = true;
  try {
    const snapshot = durableSnapshot(localStorage);
    let operations = detectLocalChanges(snapshot, state);
    if (force) {
      const updatedAt = Date.now();
      operations = Object.entries(snapshot).map(([key, value]) => {
        state.keys[key] = { hash: hashValue(value), updatedAt };
        return { key, value, deleted: false, updatedAt };
      });
    }
    const count = await pushOperations(operations);
    state.lastSyncAt = Date.now();
    writeSyncState(localStorage, state);
    emit('connected', count ? `Firebase · сохранено изменений: ${count}` : 'Firebase · все данные сохранены');
    return count;
  } catch (error) {
    emit('error', `Firebase · ${error.message}`);
    throw error;
  } finally {
    busy = false;
  }
}

function refreshErpAfterRemoteChange() {
  if (!sessionStorage.getItem('piura_firebase_initial_reload_v1')) {
    sessionStorage.setItem('piura_firebase_initial_reload_v1', '1');
    location.reload();
    return;
  }
  window.dispatchEvent(new CustomEvent('piura-firebase-data-applied'));
}

async function mergeInitialData() {
  emit('syncing', 'Firebase · объединяем данные…');
  const local = durableSnapshot(localStorage);
  const remoteSnapshot = await getDocs(userCollection());
  const remote = snapshotEntries(remoteSnapshot);

  if (!remote.length) {
    detectLocalChanges(local, state);
    const initial = Object.entries(local).map(([key, value]) => ({
      key,
      value,
      deleted: false,
      updatedAt: Number(state.keys[key]?.updatedAt || Date.now()),
    }));
    await pushOperations(initial);
  } else {
    // On a new device, cloud wins conflicts because this browser has no
    // per-key history yet. Previously tracked offline edits keep their time.
    detectLocalChanges(local, state, Date.now(), false);
    const result = mergeRemoteState(local, remote, state);
    const changed = applyRemote(result.apply);
    await pushOperations(result.upload);
    if (changed) refreshErpAfterRemoteChange();
  }

  state.lastSyncAt = Date.now();
  writeSyncState(localStorage, state);
}

function subscribeToRemote() {
  unsubscribe?.();
  let firstSnapshot = true;
  unsubscribe = onSnapshot(userCollection(), snapshot => {
    if (firstSnapshot) {
      firstSnapshot = false;
      return;
    }
    const operations = [];
    for (const change of snapshot.docChanges()) {
      if (change.doc.metadata.hasPendingWrites) continue;
      const data = change.doc.data() || {};
      const key = String(data.key || '');
      if (!key || data.deviceId === deviceId()) continue;
      const updatedAt = remoteTime(data);
      const localMeta = state.keys[key];
      if (Number(localMeta?.updatedAt || 0) > updatedAt) continue;
      const value = data.deleted ? null : String(data.value ?? '');
      operations.push({ key, value, deleted: Boolean(data.deleted) });
      state.keys[key] = { hash: hashValue(value), updatedAt };
    }
    if (applyRemote(operations)) {
      state.lastSyncAt = Date.now();
      writeSyncState(localStorage, state);
      refreshErpAfterRemoteChange();
    }
  }, error => emit('error', `Firebase · ${error.message}`));
}

async function startSync(user) {
  currentUser = user;
  clearInterval(scanTimer);
  try {
    await mergeInitialData();
    subscribeToRemote();
    scanTimer = setInterval(() => scanAndPush().catch(() => {}), 2000);
    emit('connected', `Firebase · ${user.email || 'подключено'} · все данные сохранены`);
  } catch (error) {
    emit('error', `Firebase · ${error.message}`);
  }
}

function disarmGestureSignIn() {
  if (!gestureSignInHandler) return;
  window.removeEventListener('pointerdown', gestureSignInHandler, true);
  window.removeEventListener('keydown', gestureSignInHandler, true);
  gestureSignInHandler = null;
}

function armGestureSignIn() {
  if (gestureSignInHandler || currentUser || autoSignInBlocked) return;
  gestureSignInHandler = () => {
    disarmGestureSignIn();
    automaticSignIn();
  };
  window.addEventListener('pointerdown', gestureSignInHandler, { capture: true, once: true });
  window.addEventListener('keydown', gestureSignInHandler, { capture: true, once: true });
}

async function automaticSignIn() {
  if (!isFirebaseConfigured) {
    emit('setup', 'Firebase подготовлен · нужна конфигурация проекта');
    return;
  }
  if (!auth || currentUser || autoSignInPending || autoSignInBlocked) return;
  autoSignInPending = true;
  disarmGestureSignIn();
  emit('syncing', 'Firebase · автоматическое подключение…');
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const needsGesture = new Set([
      'auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment',
      'auth/popup-blocked',
      'auth/popup-closed-by-user',
    ]).has(error.code);
    if (needsGesture) {
      emit('ready', 'Firebase · подключится автоматически при первом действии');
      armGestureSignIn();
    } else {
      const message = error.code === 'auth/unauthorized-domain'
        ? 'домен приложения не разрешён в Firebase Authentication'
        : error.message;
      emit('error', `Firebase · ${message}`);
    }
  } finally {
    autoSignInPending = false;
  }
}

async function syncNow() {
  if (!currentUser) return automaticSignIn();
  emit('syncing', 'Firebase · синхронизация…');
  const remoteSnapshot = await getDocs(userCollection());
  const local = durableSnapshot(localStorage);
  detectLocalChanges(local, state);
  const result = mergeRemoteState(local, snapshotEntries(remoteSnapshot), state);
  const changed = applyRemote(result.apply);
  await pushOperations(result.upload);
  await scanAndPush();
  if (changed) refreshErpAfterRemoteChange();
}

window.piuraFirebase = {
  syncNow,
  getStatus: () => ({ ...lastStatus }),
};

if (!isFirebaseConfigured) {
  emit('setup', 'Firebase подготовлен · ожидается конфигурация проекта');
} else {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    await setPersistence(auth, browserLocalPersistence);
    onAuthStateChanged(auth, user => {
      if (user) {
        const isOwner = user.email?.toLowerCase() === firebaseOwnerEmail.toLowerCase()
          && user.emailVerified;
        if (!isOwner) {
          autoSignInBlocked = true;
          signOut(auth).finally(() => emit('error', 'Firebase · доступ разрешён только владельцу ERP'));
          return;
        }
        autoSignInBlocked = false;
        disarmGestureSignIn();
        startSync(user);
      } else {
        currentUser = null;
        unsubscribe?.();
        unsubscribe = null;
        clearInterval(scanTimer);
        scanTimer = null;
        if (!autoSignInBlocked) automaticSignIn();
      }
    });
  } catch (error) {
    emit('error', `Firebase · ${error.message}`);
  }
}
