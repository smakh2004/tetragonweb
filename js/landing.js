/* =====================================================
   TETRAGON — landing page (index.html)
   Signed-out visitors see the Register button.
   Signed-in users are sent to their role's home page.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { getRole, homeFor } from "./role.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const landing = document.getElementById("landing");

// if we were signed in last time, keep the Register button hidden while
// Firebase confirms the session, so it doesn't flash before the redirect
try {
  if (localStorage.getItem("tetragon_signed_in") === "1") landing.hidden = true;
} catch (e) {}

onAuthStateChanged(auth, async (user) => {
  if (!user) { landing.hidden = false; return; }
  location.replace(homeFor(await getRole(user)));
});
