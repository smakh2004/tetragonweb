/* =====================================================
   TETRAGON — Subscription page (subscription.html)
   BOSHLASH buttons:
     - NOT signed in  -> go to login.html (then register/login)
     - signed in      -> open the Click invoice in a NEW tab, and keep THIS
                         tab watching Firestore. When Click confirms payment
                         (clickComplete sets subscription="active"), this tab
                         moves the user to the account page.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

/* ---------- Click / plan config ---------- */
const CLICK_SERVICE_ID = "112479";
const CLICK_MERCHANT_ID = "64974";
// price per plan in so'm — MUST match PLANS in functions/index.js and the page
const PLAN_PRICE = { start: 19000, plus: 49000, pro: 149000 };

let currentUser = null;
let authReady = false;
onAuthStateChanged(auth, (user) => { currentUser = user; authReady = true; });

// wait (briefly) for Firebase to confirm the session before deciding
function whenAuthReady() {
  if (authReady) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearInterval(t); clearTimeout(to); resolve(); };
    const t  = setInterval(() => { if (authReady) done(); }, 30);
    const to = setTimeout(done, 1500);
  });
}

// a "fingerprint" of the last payment, so we can tell a NEW payment landed
function paidStamp(data) {
  if (!data || !data.paidAt) return "";
  return String(data.paidAt.seconds || data.paidAt);
}

let stopWatch = null;
// watch this user's doc; when a fresh payment activates premium, go to account
function watchForActivation(uid, prevStamp) {
  if (stopWatch) stopWatch();
  stopWatch = onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.subscription === "active" && paidStamp(d) !== prevStamp) {
      try { localStorage.setItem("tetragon_plan", "active"); } catch (e) {}
      if (stopWatch) stopWatch();
      window.location.href = "account.html";   // move THIS (left) tab to the account page
    }
  });
}

async function choosePlan(btn, payTab) {
  await whenAuthReady();

  if (!currentUser) {
    if (payTab) { try { payTab.close(); } catch (e) {} }
    window.location.href = "login.html";
    return;
  }

  const plan = btn.dataset.plan || "start";
  const amount = Math.round(Number(PLAN_PRICE[plan] || PLAN_PRICE.start));

  // Create a short-lived order doc; Click's transaction_param has a length
  // limit, so we pass only this doc's short auto-ID instead of encoding
  // uid+plan directly into the URL.
  const orderRef = doc(collection(db, "click_orders"));
  await setDoc(orderRef, {
    uid: currentUser.uid,
    plan,
    amount,
    status: "created",
    created: serverTimestamp(),
  });

  const transParam = orderRef.id;

  const url = "https://my.click.uz/services/pay/"
            + "?service_id=" + CLICK_SERVICE_ID
            + "&merchant_id=" + CLICK_MERCHANT_ID
            + "&amount=" + amount
            + "&transaction_param=" + encodeURIComponent(transParam)
            + "&merchant_trans_id=" + encodeURIComponent(transParam);

  let prevStamp = "";
  try { prevStamp = paidStamp((await getDoc(doc(db, "users", currentUser.uid))).data()); } catch (e) {}

  if (payTab) payTab.location.href = url;
  else window.open(url, "_blank");

  watchForActivation(currentUser.uid, prevStamp);
}

document.querySelectorAll(".plan-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    // open the tab synchronously (inside the click) so the browser doesn't block it
    const payTab = window.open("about:blank", "_blank");
    choosePlan(btn, payTab);
  });
});

/* ---------- premium hero Rive animation (rive/premium.riv) ---------- */
(function initHeroRive() {
  const canvas = document.getElementById("premiumRive");
  if (!canvas || !window.rive) return;   // runtime loaded via the <script> tag on the page
  const r = new window.rive.Rive({
    src: "rive/premium.riv",
    canvas: canvas,
    autoplay: true,
    stateMachines: "State Machine 1",
    autoBind: true,
    layout: new window.rive.Layout({
      fit: window.rive.Fit.Cover,
      alignment: window.rive.Alignment.Center,
    }),
    onLoad: () => r.resizeDrawingSurfaceToCanvas(),
    onLoadError: (e) => console.error("premium.riv load error:", e),
  });
  window.addEventListener("resize", () => {
    try { r.resizeDrawingSurfaceToCanvas(); } catch (_) {}
  });
})();