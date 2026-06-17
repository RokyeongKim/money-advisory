import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Firebase 설정 ────────────────────────────────────────────────────────────
// Firebase 콘솔(console.firebase.google.com) → 프로젝트 설정 → 웹 앱 → SDK 스니펫
// 아래 REPLACE_ME 값을 복사한 값으로 교체하세요
const firebaseConfig = {
  apiKey:            "AIzaSyCWjPv0ebJfcVHhCVRKRQOb1fP9PUFexwM",
  authDomain:        "asset-dashboard-fe500.firebaseapp.com",
  projectId:         "asset-dashboard-fe500",
  storageBucket:     "asset-dashboard-fe500.firebasestorage.app",
  messagingSenderId: "175617133654",
  appId:             "1:175617133654:web:95bbf1a67ab5ecdf74fff7"
};
// ─────────────────────────────────────────────────────────────────────────────

// 이 키들만 Firestore와 동기화 (자산 데이터는 GitHub Actions가 따로 관리)
const SYNC_KEYS = [
  'seed_monthly_expense',
  'daily_expenses',
  'seed_income_detail',
  'seed_monthly_income',
];

let _db, _auth, _uid = null, _unsubscribe = null, _saveTimer = null;

export function isConfigured() {
  return firebaseConfig.apiKey !== 'REPLACE_ME';
}

/** Firebase 초기화 + 인증 상태 감시. user 객체 또는 null 반환 */
export function initFirebase(onAuthChange) {
  if (!isConfigured()) return Promise.resolve(null);
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
    // 팝업 우선 시도, 인앱 브라우저 등 차단 시 리다이렉트로 전환
    await signInWithPopup(_auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' ||
        e.code === 'auth/cancelled-popup-request' || e.code === 'auth/unauthorized-domain' ||
        e.message?.includes('disallowed_useragent')) {
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
  } catch (e) { console.warn('[FB] redirect result error:', e); return null; }
}

export async function signOutUser() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _uid = null;
  try { await signOut(_auth); } catch (e) { console.warn('[FB] sign-out error:', e); }
}

function spendDoc() {
  if (!_db || !_uid) return null;
  return doc(_db, 'users', _uid, 'data', 'spend');
}

/** Firestore → localStorage (앱 시작 시 1회 호출) */
export async function loadFromFirestore() {
  const ref = spendDoc();
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

/** localStorage → Firestore (저장 이벤트마다 호출 / 800ms debounce) */
export function saveToFirestore() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const ref = spendDoc();
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

/** 다른 기기에서 변경 시 실시간으로 localStorage 갱신 후 onUpdate 콜백 호출 */
export function subscribeSync(onUpdate) {
  if (_unsubscribe) _unsubscribe();
  const ref = spendDoc();
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
