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
  getFirestore, doc, getDoc, onSnapshot,
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

  // not signed in -> close the blank tab and send them to log in
  if (!currentUser) {
    if (payTab) { try { payTab.close(); } catch (e) {} }
    window.location.href = "login.html";
    return;
  }

  const plan = btn.dataset.plan || "start";
  const amount = PLAN_PRICE[plan] || PLAN_PRICE.start;
  const transParam = currentUser.uid + "." + plan;   // clickComplete reads "uid.plan"

  const url = "https://my.click.uz/services/pay/"
            + "?service_id=" + CLICK_SERVICE_ID
            + "&merchant_id=" + CLICK_MERCHANT_ID
            + "&amount=" + amount
            + "&transaction_param=" + encodeURIComponent(transParam);

  // remember the current payment stamp so we only react to a NEW one (renewals too)
  let prevStamp = "";
  try { prevStamp = paidStamp((await getDoc(doc(db, "users", currentUser.uid))).data()); } catch (e) {}

  // send the pre-opened tab to Click (opening it earlier avoids popup blockers)
  if (payTab) payTab.location.href = url;
  else window.open(url, "_blank");

  // this tab waits for the payment, then opens the account page
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