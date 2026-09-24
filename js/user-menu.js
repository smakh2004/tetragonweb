/* =====================================================
   TETRAGON — top-bar user menu
   Runs on every page. When signed in, replaces the "Log In"
   button with the avatar + name and a dropdown:
     - Manage Account  -> account.html
     - Sign Out
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- no "Log In" flash ---
// Firebase takes a moment to confirm the session, so if we were signed in
// last time, hide the "Log In" button immediately (before the page paints).
const WAS_AUTH_KEY = "tetragon_signed_in";
try {
  if (localStorage.getItem(WAS_AUTH_KEY) === "1") {
    document.querySelectorAll(".login-link").forEach((el) => { el.style.display = "none"; });
  }
} catch (e) {}

// keep the user signed in across reloads / tabs / days
try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

const AVATAR_COLORS = ["#ff4b4c", "#29c1f0", "#6c46f0", "#f949ac", "#ff9f1c", "#2ec4b6"];

/* ---------- helpers ---------- */
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
function avatarHTML(user, cls) {
  const name = nameOf(user);
  if (user.photoURL) {
    return `<img class="${cls}" src="${user.photoURL}" alt="" referrerpolicy="no-referrer" />`;
  }
  const initial = name.charAt(0).toUpperCase();
  return `<span class="${cls} is-initial" style="background:${colorFor(name)}">${initial}</span>`;
}

/* ---------- top-bar menu ---------- */
function buildMenu(user) {
  // hide the plain "Log In" link
  document.querySelectorAll(".login-link").forEach((el) => { el.style.display = "none"; });

  // remove an old menu if this fires again
  const old = document.getElementById("userMenu");
  if (old) old.remove();

  const loginLink = document.querySelector(".login-link");
  const host = loginLink ? loginLink.parentNode : document.querySelector(".topbar");
  if (!host) return;

  const menu = document.createElement("div");
  menu.className = "user-menu";
  menu.id = "userMenu";
  menu.innerHTML =
    `<button class="user-btn" id="userBtn" type="button">
       ${avatarHTML(user, "user-avatar")}
       <span class="user-name">${nameOf(user)}</span>
       <svg class="user-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
     </button>
     <div class="user-dropdown" id="userDropdown">
       <a href="account.html" id="manageBtn" data-i18n="manageAccount">Manage Account</a>
       <button type="button" id="signoutBtn" data-i18n="signOut">Sign Out</button>
     </div>`;
  host.appendChild(menu);

  // the menu is built after i18n's first pass, so translate its labels now
  menu.querySelector("#manageBtn").textContent = t("manageAccount", "Manage Account");
  menu.querySelector("#signoutBtn").textContent = t("signOut", "Sign Out");

  const btn = menu.querySelector("#userBtn");
  btn.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("open"); });
  document.addEventListener("click", () => menu.classList.remove("open"));

  menu.querySelector("#signoutBtn").addEventListener("click", async () => {
    try { localStorage.removeItem("tetragon_plan"); } catch (e) {}
    try { await signOut(auth); } catch (e) {}
    window.location.href = "login.html";
  });
}

function teardownMenu() {
  const m = document.getElementById("userMenu");
  if (m) m.remove();
  document.querySelectorAll(".login-link").forEach((el) => { el.style.display = ""; });
}

/* ---------- react to auth state ---------- */
onAuthStateChanged(auth, (user) => {
  try {
    if (user) localStorage.setItem(WAS_AUTH_KEY, "1");
    else localStorage.removeItem(WAS_AUTH_KEY);
  } catch (e) {}

  if (user) buildMenu(user);
  else teardownMenu();
});