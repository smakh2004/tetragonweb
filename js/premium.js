/* =====================================================
   TETRAGON — premium (subscription) gating
   Loaded on: mini-games.html + the 5 premium game pages.

   Premium games: time, ruler, column, fraction, perimeter.
   Free game:     operation (open to everyone).

   Free / signed-out users:
     - on mini-games: premium tiles still select, but show a lock,
       and the PLAY button becomes a gradient "Subscription" button
       that opens subscription.html (the plans page).
     - on a premium game page opened directly: bounced to subscription.html.

   Premium (active subscription) users: everything works normally.

   Plan is read from Firestore users/{uid}.subscription ("active"/"free")
   and cached in localStorage so the guard can act instantly.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const PREMIUM_GAMES = ["time", "ruler", "column", "fraction", "perimeter", "sudoku"];
const PLAN_KEY = "tetragon_plan";           // "active" | "free"

const mode = (document.body.dataset.mode || "").trim();
const isPremiumPage = PREMIUM_GAMES.includes(mode);

/* ---------- instant guard on a premium game page (before Firebase loads) ---------- */
if (isPremiumPage) {
  try {
    if (localStorage.getItem(PLAN_KEY) === "free") location.replace("subscription.html");
  } catch (e) {}
}

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

// start from the cached plan so the first paint is right; Firebase confirms below
let isPremium = false;
try { isPremium = localStorage.getItem(PLAN_KEY) === "active"; } catch (e) {}

function t(key, fallback) {
  try {
    const v = window.getText && window.getText(key);
    return (v && v !== key) ? v : fallback;
  } catch (e) { return fallback; }
}

async function loadIsPremium(user) {
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    return snap.exists() && snap.data().subscription === "active";
  } catch (e) { return false; }
}

/* ---------- mini-games page: lock tiles + PLAY button ---------- */
const playBtn   = document.getElementById("playBtn");
const typePanel = document.getElementById("typePanel");
const isMiniPage = !!(playBtn && typePanel);

function premiumTiles() {
  return Array.from(typePanel.querySelectorAll(".type-item[data-game]"))
    .filter((el) => PREMIUM_GAMES.includes(el.dataset.game));
}
function selectedGame() {
  const sel = typePanel.querySelector(".type-item.selected[data-game]");
  return sel ? sel.dataset.game : "operation";
}
function updatePlayButton() {
  const locked = PREMIUM_GAMES.includes(selectedGame()) && !isPremium;
  if (locked) {
    playBtn.classList.add("premium");
    playBtn.textContent = t("buySubscription", "Buy subscription");
    playBtn.dataset.locked = "1";
  } else {
    playBtn.classList.remove("premium");
    playBtn.textContent = t("play", "PLAY");
    playBtn.dataset.locked = "";
  }
}

// For a free user, a premium game's ON icon becomes <game>_lock.png; for a
// subscriber it's the normal <game>_on.png. Same <img>, so identical size/position.
// (The off icon, shown when unselected, is never touched.)
function applyPremiumIcons() {
  premiumTiles().forEach((tile) => {
    const on = tile.querySelector(".icon-on");
    if (!on) return;
    const game = tile.dataset.game;
    on.src = `assets/icons/${game}_${isPremium ? "on" : "lock"}.png`;
  });
}
function refreshMini() {
  premiumTiles().forEach((tile) => {
    tile.classList.add("premium-game");   // no-scale marker (always)
    const icon = tile.querySelector(".type-icon");
    if (icon) icon.style.transform = "none";   // hard-stop any hover/press scaling
    tile.classList.toggle("premium-locked", !isPremium);
  });
  applyPremiumIcons();
  updateHeading();
  updatePlayButton();
}

// Premium heading turns to the premium color ONLY while a premium game is chosen
function updateHeading() {
  const heading = typePanel.querySelector(".type-heading--premium");
  if (!heading) return;
  const on = !isPremium && PREMIUM_GAMES.includes(selectedGame());
  heading.classList.toggle("locked-gradient", on);
}

// wire the mini-games listeners ONCE (they read the live `isPremium`)
if (isMiniPage) {
  typePanel.addEventListener("click", () => { updateHeading(); updatePlayButton(); });
  document.addEventListener("languagechange", () => updatePlayButton());
  // intercept PLAY for locked games -> subscribe page (capture = runs first)
  playBtn.addEventListener("click", (e) => {
    if (playBtn.dataset.locked === "1") {
      e.stopImmediatePropagation();
      e.preventDefault();
      window.location.href = "subscription.html";
    }
  }, true);
  refreshMini(); // paint initial lock/button state from the cached plan
}

/* ---------- react to auth / plan ---------- */
onAuthStateChanged(auth, async (user) => {
  isPremium = await loadIsPremium(user);
  try { localStorage.setItem(PLAN_KEY, isPremium ? "active" : "free"); } catch (e) {}

  if (isPremiumPage && !isPremium) {
    location.replace("subscription.html");   // free user on a premium page -> out
    return;
  }
  if (isMiniPage) refreshMini();
});