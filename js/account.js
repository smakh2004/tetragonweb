/* =====================================================
   TETRAGON — Account page logic (account.html)
   Change display name, change password, subscribe, sign out.
   Subscription lives in Firestore: users/{uid}.subscription
     "active" -> shows "Active", anything else -> "Free"
   If nobody is signed in, we bounce to login.html.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, updateProfile,
  setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Keep the user signed in across reloads
try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

const AVATAR_COLORS = ["#ff4b4c", "#29c1f0", "#6c46f0", "#f949ac", "#ff9f1c", "#2ec4b6"];

const $ = (id) => document.getElementById(id);

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

function avatarHTML(user, cls) {
  const name = nameOf(user);
  if (user.photoURL) {
    return `<img class="${cls}" src="${user.photoURL}" alt="" referrerpolicy="no-referrer" />`;
  }
  const initial = name.charAt(0).toUpperCase();
  return `<span class="${cls} is-initial" style="background:${colorFor(name)}">${initial}</span>`;
}

function fmtDate(v) {
  if (!v) return "—";
  let d;
  if (typeof v.toDate === "function") d = v.toDate();
  else if (typeof v === "number") d = new Date(v);
  else if (v.seconds) d = new Date(v.seconds * 1000);
  else d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear();
}

/* ---------- Subscription Loading ---------- */
async function loadPlan(uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { plan: "free" };
    }
    const d = snap.data();
    return {
      plan: d.subscription === "active" ? "active" : "free",
      planType: d.plan || "",
      paidAt: d.paidAt,
      planExpires: d.planExpires,
    };
  } catch (e) {
    console.warn("Plan load error:", e);
    return { plan: "free" };
  }
}

function setMsg(text, ok) {
  const msg = $("acctMsg");
  msg.hidden = !text;
  msg.textContent = text || "";
  msg.className = "acct-msg" + (ok ? " ok" : "");
}

async function showAccount(user) {
  $("acctLoading").hidden = true;
  $("acctCard").hidden = false;
  setMsg("");

  $("acctAvatar").innerHTML = avatarHTML(user, "acct-avatar");
  $("acctName").textContent = nameOf(user);
  $("acctEmail").textContent = user.email || "";
  $("nameInput").value = nameOf(user);

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

    if (planNameEl) {
      const type = info.planType ? info.planType.charAt(0).toUpperCase() + info.planType.slice(1) : "";
      planNameEl.hidden = !(active && type);
      planNameEl.textContent = type;
    }

    const show = active && !!(info.paidAt || info.planExpires);
    if (datesEl) {
      datesEl.hidden = !show;
      if (show) {
        $("acctPlanStart").textContent = fmtDate(info.paidAt);
        $("acctPlanEnd").textContent = fmtDate(info.planExpires);
      }
    }
    if (planRow) planRow.classList.toggle("has-dates", show);
  };

  const plan0 = await loadPlan(user.uid);
  renderPlan(plan0);
  try { localStorage.setItem("tetragon_plan", plan0.plan === "active" ? "active" : "free"); } catch (e) {}

  document.addEventListener("languagechange", () => renderPlan(planInfo));

  subBtn.onclick = () => { window.location.href = "subscription.html"; };

  $("nameForm").onsubmit = async (e) => {
    e.preventDefault();
    const newName = $("nameInput").value.trim();
    if (!newName) { setMsg(t("msgEnterName", "Enter a name.")); return; }
    try {
      await updateProfile(auth.currentUser, { displayName: newName });
      $("acctName").textContent = newName;
      setMsg(t("msgNameUpdated", "Name updated."), true);
      setDoc(doc(db, "users", user.uid), { displayName: newName }, { merge: true }).catch(() => {});
    } catch (err) {
      setMsg(t("msgNameFail", "Couldn't update name. Try again."));
    }
  };

  $("signoutBtn").onclick = async () => {
    try { localStorage.removeItem("tetragon_plan"); } catch (e) {}
    try { await signOut(auth); } catch (e) {}
    window.location.href = "login.html";
  };
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showAccount(user);
  } else {
    window.location.href = "login.html";
  }
});