/* =====================================================
   TETRAGON — Admin dashboard (admin.html)
   Owner-only overview:
     - Visits        -> stats/site.visits (counted in user-menu.js)
     - Active users  -> users with lastSeen in the last 5 minutes
     - Total users   -> count of users/*
     - Revenue       -> sum of plan prices over active subscriptions

   The email check below only decides what the page shows. The real
   protection is the Firestore rules: only admins may list users/*.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, query, where,
  getDocs, getCountFromServer, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

// accounts allowed to see the dashboard — keep in sync with firestore rules
const ADMIN_EMAILS = ["smakh2004@outlook.com", "smakh04@mail.ru"];
// price per plan in so'm — MUST match PLAN_PRICE in subscription.js
const PLAN_PRICE = { start: 19000, plus: 49000, pro: 149000 };
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS  = 60 * 1000;

const $ = (id) => document.getElementById(id);
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US").replace(/,/g, " ");

function setStat(id, value) { $(id).textContent = value; }

async function loadVisits() {
  const snap = await getDoc(doc(db, "stats", "site"));
  return snap.exists() ? (snap.data().visits || 0) : 0;
}

async function loadActive() {
  const since = Timestamp.fromMillis(Date.now() - ACTIVE_WINDOW_MS);
  const q = query(collection(db, "users"), where("lastSeen", ">=", since));
  return (await getCountFromServer(q)).data().count;
}

async function loadTotal() {
  return (await getCountFromServer(collection(db, "users"))).data().count;
}

async function loadRevenue() {
  const q = query(collection(db, "users"), where("subscription", "==", "active"));
  const snap = await getDocs(q);
  let sum = 0;
  snap.forEach((d) => { sum += PLAN_PRICE[d.data().plan] || 0; });
  return { sum, subs: snap.size };
}

let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  $("refreshBtn").disabled = true;

  // each card loads on its own so one failure doesn't blank the rest
  const jobs = [
    loadVisits().then((v) => setStat("visits", fmtNum(v))),
    loadActive().then((v) => setStat("active", fmtNum(v))),
    loadTotal().then((v) => setStat("total", fmtNum(v))),
    loadRevenue().then(({ sum, subs }) => {
      setStat("revenue", fmtNum(sum) + " so'm");
      setStat("subs", fmtNum(subs));
    }),
  ];
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((r) => console.error("[admin] load error:", r.reason));

  const err = $("adminError");
  err.hidden = failed.length === 0;
  if (failed.length) {
    err.textContent = "Some numbers could not be loaded: " +
      (failed[0].reason && failed[0].reason.code === "permission-denied"
        ? "Firestore rules deny access for this account."
        : (failed[0].reason && failed[0].reason.message) || "unknown error");
  }

  setStat("updated", new Date().toLocaleTimeString());
  $("refreshBtn").disabled = false;
  refreshing = false;
}

let timer = null;
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  $("adminLoading").hidden = true;

  const email = (user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    $("adminDenied").hidden = false;
    $("adminBody").hidden = true;
    return;
  }

  $("adminDenied").hidden = true;
  $("adminBody").hidden = false;
  refresh();
  if (!timer) timer = setInterval(refresh, AUTO_REFRESH_MS);
});

$("refreshBtn").addEventListener("click", refresh);
$("signoutBtn").addEventListener("click", async () => {
  try { await signOut(auth); } catch (e) {}
  window.location.href = "login.html";
});
