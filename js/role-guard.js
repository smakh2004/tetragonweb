/* =====================================================
   TETRAGON — role guard for the role home pages
   <body data-role="teacher"> (teacher.html) or
   <body data-role="student"> (student.html).
     - signed out          -> index.html (register page)
     - signed in, wrong role -> that role's home page
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { getRole, homeFor, forgetRole } from "./role.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const pageRole = document.body.dataset.role;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    forgetRole();
    location.replace("index.html");
    return;
  }
  const role = await getRole(user);
  if (role !== pageRole) location.replace(homeFor(role));
});
