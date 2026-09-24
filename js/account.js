/* =====================================================
   TETRAGON — Account page logic (account.html)
   Change display name, change password, subscribe, sign out.
   Subscription lives in Firestore: users/{uid}.subscription
     "active" -> shows "Active",  anything else -> "Free"
   If nobody is signed in, we bounce to login.html.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, updateProfile, updatePassword,
  setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
// keep the user signed in across reloads / tabs / days
try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

const AVATAR_COLORS = ["#ff4b4c", "#29c1f0", "#6c46f0", "#f949ac", "#ff9f1c", "#2ec4b6"];

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);

// translate a key via the shared language system; fall back to English text
function t(key, fallback) {
  try {
    const v = window.getText && window.getText(key);
    return (v && v !== key) ? v : fallback;
  } catch (e) { return fallback; }
}

function nameOf(user) {
  return user.displayName || (user.email ? user.email.split("@")[0] : "User");
}
function colorFor(str) {
  let s = 0;
  for (let i = 0; i < str.length; i++) s += str.charCodeAt(i);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}
function hasPassword(user) {
  return (user.providerData || []).some((p) => p.providerId === "password");
}
function avatarHTML(user, cls) {
  const name = nameOf(user);
  if (user.photoURL) {
    return `<img class="${cls}" src="${user.photoURL}" alt="" referrerpolicy="no-referrer" />`;
  }
  const initial = name.charAt(0).toUpperCase();
  return `<span class="${cls} is-initial" style="background:${colorFor(name)}">${initial}</span>`;
}

/* ---------- dates ---------- */
// format a Firestore Timestamp / number / date-string as "24.09.2026"
// (numeric DD.MM.YYYY reads the same in EN / RU / UZ)
function fmtDate(v) {
  if (!v) return "—";
  let d;
  if (typeof v.toDate === "function") d = v.toDate();      // Firestore Timestamp
  else if (typeof v === "number") d = new Date(v);
  else if (v.seconds) d = new Date(v.seconds * 1000);      // plain {seconds,...}
  else d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear();
}

/* ---------- subscription (Firestore) ---------- */
async function loadPlan(uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { subscription: "free", createdAt: Date.now() }, { merge: true });
      return { plan: "free" };
    }
    const d = snap.data();
    return {
      plan: d.subscription === "active" ? "active" : "free",
      planType: d.plan || "",     // which plan: start / plus / pro
      paidAt: d.paidAt,           // subscription start
      planExpires: d.planExpires, // subscription end
    };
  } catch (e) {
    console.warn("plan load error:", e);
    return { plan: "free" };
  }
}
async function setPlan(uid, plan) {
  await setDoc(doc(db, "users", uid), { subscription: plan }, { merge: true });
}

/* ---------- message line ---------- */
function setMsg(text, ok) {
  const msg = $("acctMsg");
  msg.hidden = !text;
  msg.textContent = text || "";
  msg.className = "acct-msg" + (ok ? " ok" : "");
}

/* ---------- fill + wire the page for a signed-in user ---------- */
async function showAccount(user) {
  $("acctLoading").hidden = true;
  $("acctCard").hidden = false;
  setMsg("");

  // who
  $("acctAvatar").innerHTML = avatarHTML(user, "acct-avatar");
  $("acctName").textContent = nameOf(user);
  $("acctEmail").textContent = user.email || "";
  // prefill with the name currently shown (their display name, or the
  // username from their email) so they can see and edit it
  $("nameInput").value = nameOf(user);

  // subscription
  const planBadge = $("acctPlan");
  const planNameEl = $("acctPlanName");
  const planRow = document.querySelector(".acct-plan");
  const subBtn = $("subscribeBtn");
  const datesEl = $("acctPlanDates");
  let planInfo = { plan: "free" };
  const renderPlan = (info) => {
    planInfo = info;
    const active = info.plan === "active";
    planBadge.textContent = active ? t("planActive", "Active") : t("planFree", "Free");
    planBadge.classList.toggle("is-active", active);
    subBtn.style.display = active ? "none" : "";
    // plan type (Start / Plus / Pro) — only when active
    if (planNameEl) {
      const type = info.planType ? info.planType.charAt(0).toUpperCase() + info.planType.slice(1) : "";
      planNameEl.hidden = !(active && type);
      planNameEl.textContent = type;
    }
    // start / end dates — only when active and we have them
    const show = active && !!(info.paidAt || info.planExpires);
    if (datesEl) {
      datesEl.hidden = !show;
      if (show) {
        $("acctPlanStart").textContent = fmtDate(info.paidAt);
        $("acctPlanEnd").textContent = fmtDate(info.planExpires);
      }
    }
    // when the dates show, the divider moves below them (see .acct-plan.has-dates)
    if (planRow) planRow.classList.toggle("has-dates", show);
  };
  const plan0 = await loadPlan(user.uid);
  renderPlan(plan0);
  try { localStorage.setItem("tetragon_plan", plan0.plan === "active" ? "active" : "free"); } catch (e) {}

  // keep the badge word ("Free"/"Active") right when the language changes
  document.addEventListener("languagechange", () => renderPlan(planInfo));

  // Subscribe -> the plans page (where the plan is chosen & activated)
  subBtn.onclick = () => { window.location.href = "subscription.html"; };

  // change name
  $("nameForm").onsubmit = async (e) => {
    e.preventDefault();
    const newName = $("nameInput").value.trim();
    if (!newName) { setMsg(t("msgEnterName", "Enter a name.")); return; }
    try {
      // the display name lives in Firebase Auth — this is what the top bar shows
      await updateProfile(auth.currentUser, { displayName: newName });
      $("acctName").textContent = newName;              // reflect right away
      setMsg(t("msgNameUpdated", "Name updated."), true);
      // mirror into Firestore too, but don't let a DB hiccup undo the change
      setDoc(doc(db, "users", user.uid), { displayName: newName }, { merge: true }).catch(() => {});
    } catch (err) {
      setMsg(t("msgNameFail", "Couldn't update name. Try again."));
    }
  };

  // sign out
  $("signoutBtn").onclick = async () => {
    try { localStorage.removeItem("tetragon_plan"); } catch (e) {}
    try { await signOut(auth); } catch (e) {}
    window.location.href = "login.html";
  };
}

/* ---------- react to auth state ---------- */
onAuthStateChanged(auth, (user) => {
  if (user) {
    showAccount(user);
  } else {
    // not signed in -> go log in
    window.location.href = "login.html";
  }
});