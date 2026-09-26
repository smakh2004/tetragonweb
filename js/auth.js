/* =====================================================
   TETRAGON — AUTH (Firebase: email/password + Google)
   Shared by login.html and signup.html.
   The page tells us which mode via <body data-auth="login|signup">.
===================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig, AFTER_AUTH_REDIRECT } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// keep the user signed in across page reloads
try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

const MODE = document.body.dataset.auth === "signup" ? "signup" : "login";

// ---------- elements ----------
const form      = document.getElementById("authForm");
const emailEl   = document.getElementById("email");
const passEl    = document.getElementById("password");
const showBtn   = document.getElementById("showBtn");
const submitBtn = document.getElementById("submitBtn");
const googleBtn = document.getElementById("googleBtn");
const errorEl   = document.getElementById("authError");
const forgotBtn = document.getElementById("forgotBtn");

// ---------- helpers ----------
// Ensure the user exists in Firestore as soon as they sign up or log in
async function ensureUserDoc(user) {
  if (!user || !user.uid) return;
  try {
    await setDoc(doc(db, "users", user.uid), {
      email: user.email || "",
      subscription: "free",
      createdAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error("Failed to create Firestore user doc:", err);
  }
}

// translate a key via the shared language system; fall back to English text
function t(key, fallback) {
  try {
    const v = window.getText && window.getText(key);
    return (v && v !== key) ? v : fallback;
  } catch (e) { return fallback; }
}
function friendly(code) {
  // map Firebase error codes -> i18n keys + English fallback
  const map = {
    "auth/invalid-email":          ["errInvalidEmail", "That email doesn't look right."],
    "auth/missing-email":          ["errEnterEmail",   "Enter your email."],
    "auth/user-not-found":         ["errUserNotFound", "No account found with that email."],
    "auth/wrong-password":         ["errWrongPassword","Wrong email or password."],
    "auth/invalid-credential":     ["errWrongPassword","Wrong email or password."],
    "auth/email-already-in-use":   ["errEmailInUse",   "That email is already registered."],
    "auth/weak-password":          ["errWeakPassword", "Password should be at least 6 characters."],
    "auth/missing-password":       ["errEnterPassword","Enter a password."],
    "auth/too-many-requests":      ["errTooMany",      "Too many attempts. Try again in a bit."],
    "auth/popup-closed-by-user":   ["errPopupClosed",  "Google sign-in was cancelled."],
    "auth/popup-blocked":          ["errPopupBlocked", "Your browser blocked the popup. Allow popups and retry."],
    "auth/network-request-failed": ["errNetwork",      "Network error. Check your connection."],
    "auth/operation-not-allowed":  ["errNotAllowed",   "This sign-in method isn't enabled in Firebase."],
  };
  const pair = map[code] || ["errGeneric", "Something went wrong. Please try again."];
  return t(pair[0], pair[1]);
}
function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}
function setBusy(busy) {
  [submitBtn, googleBtn].forEach((b) => { if (b) b.disabled = busy; });
  if (submitBtn) submitBtn.classList.toggle("busy", busy);
}
function goNext() {
  // remember we're signed in so the next page hides "Log In" instantly (no flash)
  try { localStorage.setItem("tetragon_signed_in", "1"); } catch (e) {}
  window.location.href = AFTER_AUTH_REDIRECT;
}

// ---------- show / hide password ----------
if (showBtn && passEl) {
  const syncShowLabel = () => {
    const shown = passEl.type === "text";
    showBtn.textContent = shown ? t("hideWord", "Hide") : t("showWord", "Show");
  };
  showBtn.addEventListener("click", () => {
    passEl.type = passEl.type === "password" ? "text" : "password";
    syncShowLabel();
  });
  // keep the right word ("Show"/"Hide") when the language changes
  document.addEventListener("languagechange", syncShowLabel);
}

// ---------- email + password submit ----------
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const email = (emailEl.value || "").trim();
    const pass  = passEl.value || "";
    if (!email) { showError(t("errEnterEmail", "Enter your email.")); emailEl.focus(); return; }
    if (!pass)  { showError(t("errEnterPassword", "Enter a password."));  passEl.focus();  return; }

    setBusy(true);
    try {
      let cred;
      if (MODE === "signup") {
        cred = await createUserWithEmailAndPassword(auth, email, pass);
      } else {
        cred = await signInWithEmailAndPassword(auth, email, pass);
      }
      await ensureUserDoc(cred.user);
      goNext();
    } catch (err) {
      showError(friendly(err.code));
      setBusy(false);
    }
  });
}

// ---------- Google ----------
if (googleBtn) {
  const provider = new GoogleAuthProvider();
  googleBtn.addEventListener("click", async () => {
    showError("");
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, provider);
      await ensureUserDoc(cred.user);
      goNext();
    } catch (err) {
      showError(friendly(err.code));
      setBusy(false);
    }
  });
}

// ---------- Forgot password (login page) ----------
if (forgotBtn) {
  forgotBtn.addEventListener("click", async () => {
    showError("");
    const email = (emailEl.value || "").trim();
    if (!email) { showError(t("forgotNeedEmail", "Type your email above, then tap Forgot password.")); emailEl.focus(); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      showError(t("resetSent", "Password reset link sent to {email}.").replace("{email}", email));
    } catch (err) {
      showError(friendly(err.code));
    }
  });
}

// ---------- Left-panel Rive animation (mr_square_auth.riv, Fit.Cover) ----------
(function initAuthRive() {
  const canvas = document.getElementById("authRive");
  if (!canvas || !window.rive) return;   // runtime loaded via the <script> tag on the page
  const r = new window.rive.Rive({
    src: "rive/mr_square_auth.riv",
    canvas: canvas,
    stateMachines: "State Machine 1",
    autoplay: true,
    autoBind: true,
    layout: new window.rive.Layout({
      fit: window.rive.Fit.Cover,          // fill the whole panel, cropping as needed
      alignment: window.rive.Alignment.Center,
    }),
    onLoad: () => r.resizeDrawingSurfaceToCanvas(),
    onLoadError: (e) => console.error("mr_square_auth.riv load error:", e),
  });
  window.addEventListener("resize", () => {
    try { r.resizeDrawingSurfaceToCanvas(); } catch (_) {}
  });
})();