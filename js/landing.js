/* =====================================================
   TETRAGON — landing page (index.html)
   For now the site opens on registration:
     - signed out -> signup.html
     - signed in  -> their role's home page
   The Register-button page itself stays in index.html (hidden) for later.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { getRole, homeFor } from "./role.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("signup.html"); return; }
  location.replace(homeFor(await getRole(user)));
});
