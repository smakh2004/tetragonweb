/* =====================================================
   TETRAGON — user roles (student / teacher)
   Role lives in Firestore: users/{uid}.role
   Accounts created before roles existed have no role field;
   they are treated as (and saved as) "teacher".
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db  = getFirestore(app);

export const ROLES = ["student", "teacher"];
export const DEFAULT_ROLE = "teacher";
const ROLE_KEY = "tetragon_role";

// home page for each role
export function homeFor(role) {
  return role === "student" ? "student.html" : "teacher.html";
}

export function rememberRole(role) {
  try { localStorage.setItem(ROLE_KEY, role); } catch (e) {}
}
export function forgetRole() {
  try { localStorage.removeItem(ROLE_KEY); } catch (e) {}
}

// Read the user's role; a legacy account without one becomes "teacher".
export async function getRole(user) {
  const ref = doc(db, "users", user.uid);
  let role = DEFAULT_ROLE;
  try {
    const snap = await getDoc(ref);
    const r = snap.exists() ? snap.data().role : undefined;
    if (ROLES.includes(r)) role = r;
    else await setDoc(ref, { role: DEFAULT_ROLE }, { merge: true });
  } catch (err) {
    console.error("Failed to read user role:", err);
    // offline etc. — fall back to the last role we saw on this device
    try {
      const cached = localStorage.getItem(ROLE_KEY);
      if (ROLES.includes(cached)) role = cached;
    } catch (e) {}
  }
  rememberRole(role);
  return role;
}
