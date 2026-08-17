import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCWjPv0ebJfcVHhCVRKRQOb1fP9PUFexwM",
  authDomain:        "asset-dashboard-fe500.firebaseapp.com",
  projectId:         "asset-dashboard-fe500",
  storageBucket:     "asset-dashboard-fe500.firebasestorage.app",
  messagingSenderId: "175617133654",
  appId:             "1:175617133654:web:95bbf1a67ab5ecdf74fff7"
};

// 동기화할 localStorage 키 목록 (대용량 CSV·민감 API키 제외)
const SYNC_KEYS = [
  'ad_settings',
  'ad_portfolio_kr',
  'ad_portfolio_us',
  'ad_manual_assets',
  'ad_toss_assets',
  'ad_realestate',
  'ad_locations',
  'ad_target_alloc',
  'ad_re_budget',
  'ad_snapshots',
  'ad_category_snapshots',
];

let _db, _auth, _uid = null, _unsubscribe = null, _saveTimer = null;

export function initFirebase(onAuthChange) {
  const app = initializeApp(firebaseConfig);
  _db  = getFirestore(app);
  _auth = getAuth(app);
  return new Promise(resolve => {
    onAuthStateChanged(_auth, user => {
      _uid = user?.uid ?? null;
      onAuthChange?.(user);
      resolve(user);
    });
  });
}

export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(_auth, provider);
  } catch (e) {
    const redirect = ['auth/popup-blocked', 'auth/popup-closed-by-user',
      'auth/cancelled-popup-request', 'auth/unauthorized-domain'];
    if (redirect.includes(e.code) || e.message?.includes('disallowed_useragent')) {
      await signInWithRedirect(_auth, provider);
    } else {
      console.warn('[FB] sign-in error:', e);
    }
  }
}

export async function handleRedirectResult() {
  if (!_auth) return null;
  try {
    const result = await getRedirectResult(_auth);
    return result?.user ?? null;
  } catch (e) { console.warn('[FB] redirect result:', e); return null; }
}

export async function signOutUser() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _uid = null;
  try { await signOut(_auth); } catch (e) { console.warn('[FB] sign-out:', e); }
}

function sharedDoc() {
  if (!_db || !_uid) return null;
  return doc(_db, 'shared', 'family');
}

export async function loadFromFirestore() {
  const ref = sharedDoc();
  if (!ref) return false;
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data();
    for (const key of SYNC_KEYS) {
      if (data[key] !== undefined) {
        localStorage.setItem(key, typeof data[key] === 'string'
          ? data[key] : JSON.stringify(data[key]));
      }
    }
    return true;
  } catch (e) { console.warn('[FB] load error:', e); return false; }
}

export function saveToFirestore() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const ref = sharedDoc();
    if (!ref) return;
    const data = {};
    for (const key of SYNC_KEYS) {
      const v = localStorage.getItem(key);
      if (v !== null) { try { data[key] = JSON.parse(v); } catch { data[key] = v; } }
    }
    try { await setDoc(ref, data, { merge: true }); }
    catch (e) { console.warn('[FB] save error:', e); }
  }, 800);
}

export function subscribeSync(onUpdate) {
  if (_unsubscribe) _unsubscribe();
  const ref = sharedDoc();
  if (!ref) return;
  _unsubscribe = onSnapshot(ref, snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    for (const key of SYNC_KEYS) {
      if (data[key] !== undefined) {
        localStorage.setItem(key, typeof data[key] === 'string'
          ? data[key] : JSON.stringify(data[key]));
      }
    }
    onUpdate?.();
  }, e => console.warn('[FB] snapshot error:', e));
}
