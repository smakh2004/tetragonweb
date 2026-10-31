/* =====================================================
   TETRAGON — visit + presence tracking (feeds admin.html)
   Loaded on every page except admin.html.
     - visits/{YYYY-MM-DD}.count  +1 once per browser session
     - presence/{uid}             heartbeat every 60s while the tab is visible
                                  (admin counts "online" = seen in last 5 min)
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, increment, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const HEARTBEAT_MS = 60 * 1000;

function dayId(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* ---------- one visit per browser session ---------- */
// The flag is set only after the write lands, so a page that redirects
// right away (index.html -> signup.html) doesn't lose the visit.
(function countVisit() {
  try { if (sessionStorage.getItem("tetragon_visit")) return; } catch (e) {}
  setDoc(doc(db, "visits", dayId()), { count: increment(1) }, { merge: true })
    .then(() => { try { sessionStorage.setItem("tetragon_visit", "1"); } catch (e) {} })
    .catch(() => {});
})();

/* ---------- presence heartbeat for signed-in users ---------- */
let currentUser = null;
let timer = null;

function beat() {
  if (!currentUser || document.visibilityState !== "visible") return;
  setDoc(doc(db, "presence", currentUser.uid), {
    email: currentUser.email || "",
    page: location.pathname.split("/").pop() || "index.html",
    lastSeen: serverTimestamp(),
  }).catch(() => {});
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  clearInterval(timer);
  if (!user) return;
  beat();
  timer = setInterval(beat, HEARTBEAT_MS);
});

document.addEventListener("visibilitychange", beat);
