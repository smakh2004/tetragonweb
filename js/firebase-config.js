/* =====================================================
   FIREBASE CONFIG  — Tetragon web (project: tetragonweb)
   These web values are safe to ship in the client.
   Sign-in methods to enable in the Firebase console:
   Authentication -> Sign-in method -> "Email/Password" and "Google".
===================================================== */
export const firebaseConfig = {
  apiKey:            "AIzaSyCatjVoI4CrezrDnTOxYre1TPKgfimtHxs",
  authDomain:        "tetragonweb.firebaseapp.com",
  projectId:         "tetragonweb",
  storageBucket:     "tetragonweb.firebasestorage.app",
  messagingSenderId: "347124399109",
  appId:             "1:347124399109:web:b69fe2177b49606ef4306c",
  measurementId:     "G-Y75HGPSV13",
};

// Where to send the user after a successful log in / sign up:
export const AFTER_AUTH_REDIRECT = "index.html";