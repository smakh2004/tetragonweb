/* =====================================================
   LESSON-STORE  —  all Firestore access for the LESSON GAME feature
   -----------------------------------------------------
   Teachers create "lessons"; each lesson has a name + multiple-choice
   questions (text + 3 options A/B/C + which option is correct). Two teams
   then battle by answering the teacher's questions.

   EVERY Firebase touch-point in the whole feature lives in THIS file.
   The pages (lessons.js / lesson-edit.js / quiz.js) only call the
   functions exported here.

   FIREBASE: this file initializes Firebase from your existing
   js/firebase-config.js (the same config file auth.js uses). getApps()
   reuses the already-created app, so there's only ever one Firebase app no
   matter how many page modules load. Nothing to wire up. */

// Initialize Firebase here from your EXISTING firebase-config.js (the same
// file auth.js uses). getApps() reuses the already-initialized app if auth.js
// (or any other page module) created it first, so there's only ever one app.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection, doc, addDoc, getDoc, getDocs, deleteDoc, setDoc,
  query, where, orderBy, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);


/* =====================================================
   FREE-TIER LIMITS  (premium = unlimited)
   Change these numbers in one place.
===================================================== */
export const FREE_MAX_GAMES     = 3;   // free teachers: up to 3 lessons
export const FREE_MAX_QUESTIONS = 10;  // free teachers: up to 10 questions per lesson

/* Firestore layout (new collections this feature adds):
     lessonGames/{gameId}
        ownerId   : <uid>        (who created it)
        title     : <string>     (the lesson name)
        createdAt : <timestamp>  (drives the 1,2,3 numbering + order)
     lessonGames/{gameId}/questions/{questionId}
        text      : <string>
        options   : [<a>, <b>, <c>]
        correct   : 0 | 1 | 2    (index of the right option)
        order     : <number>     (keeps question order stable)
        createdAt : <timestamp>

   Premium is read from your EXISTING users collection (unchanged):
     users/{uid}
        subscription : "active" | "free"
        plan         : "start" | "plus" | "pro"
        planExpires  : <timestamp>   (premium lapses after this)
   See isPremiumAsync() below.
*/

/* ---------- AUTH ---------- */

// Resolve the currently signed-in user once (waits for Firebase to decide).
export function currentUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

// Fast, synchronous guess at premium status from the cached flag your other
// pages already keep in localStorage. Used only to avoid flicker.
export function isPremiumCached() {
  try { return localStorage.getItem("tetragon_plan") === "active"; }
  catch (e) { return false; }
}

// Authoritative premium check against your real data model:
//   users/{uid}.subscription === "active"  AND  planExpires still in the future.
// Falls back to the cached flag if the read fails (offline, etc.).
export async function isPremiumAsync(uid) {
  if (!uid) return isPremiumCached();
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return false;
    const u = snap.data();
    let active = u.subscription === "active";
    if (active && u.planExpires && typeof u.planExpires.toDate === "function") {
      if (u.planExpires.toDate().getTime() < Date.now()) active = false;
    }
    try { localStorage.setItem("tetragon_plan", active ? "active" : "free"); } catch (e) {}
    return active;
  } catch (e) {
    console.warn("premium check failed, using cached flag:", e);
    return isPremiumCached();
  }
}

/* ---------- LESSONS (games) ---------- */

// All lessons owned by this teacher, in CREATION order (oldest first) so the
// 1, 2, 3 numbering on the tiles stays stable as new lessons are added.
export async function listGames(uid) {
  const q = query(
    collection(db, "lessonGames"),
    where("ownerId", "==", uid),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// How many lessons this teacher already has (for the free-limit check).
export async function countGames(uid) {
  const q = query(collection(db, "lessonGames"), where("ownerId", "==", uid));
  const snap = await getDocs(q);
  return snap.size;
}

// Read a single lesson's metadata.
export async function getGame(gameId) {
  const snap = await getDoc(doc(db, "lessonGames", gameId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// All questions in a lesson, in their saved order.
export async function listQuestions(gameId) {
  const q = query(
    collection(db, "lessonGames", gameId, "questions"),
    orderBy("order", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Count questions in a lesson (for list badges).
export async function countQuestions(gameId) {
  const snap = await getDocs(collection(db, "lessonGames", gameId, "questions"));
  return snap.size;
}

/* ---------- CREATE a whole lesson at once ----------
   name = string, questions = [{ text, options:[a,b,c], correct }]
   Enforces BOTH free limits (number of lessons, questions per lesson).
   Pass `premium` (resolved once by the page). Returns the new lesson id.
   Throws err.code "GAME_LIMIT" or "QUESTION_LIMIT" when a free teacher is maxed. */
export async function createLesson(uid, name, questions, premium) {
  const isPaid = premium === undefined ? isPremiumCached() : premium;

  if (!isPaid) {
    const have = await countGames(uid);
    if (have >= FREE_MAX_GAMES) {
      const err = new Error("LIMIT"); err.code = "GAME_LIMIT"; throw err;
    }
    if (questions.length > FREE_MAX_QUESTIONS) {
      const err = new Error("LIMIT"); err.code = "QUESTION_LIMIT"; throw err;
    }
  }

  // create the lesson doc, then write all questions in one batch
  const gameRef = await addDoc(collection(db, "lessonGames"), {
    ownerId: uid,
    title: (name || "").trim() || "Lesson",
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(db);
  questions.forEach((q, i) => {
    const qRef = doc(collection(db, "lessonGames", gameRef.id, "questions"));
    batch.set(qRef, {
      text: (q.text || "").trim(),
      options: q.options.map((o) => (o || "").trim()),
      correct: q.correct,
      order: i,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  return gameRef.id;
}

/* ---------- UPDATE an existing lesson ----------
   Replaces the name and the WHOLE question set (simplest + matches the editor,
   which loads everything, lets the teacher change it, then saves). */
export async function updateLesson(gameId, name, questions, premium) {
  const isPaid = premium === undefined ? isPremiumCached() : premium;
  if (!isPaid && questions.length > FREE_MAX_QUESTIONS) {
    const err = new Error("LIMIT"); err.code = "QUESTION_LIMIT"; throw err;
  }

  // update the name
  await setDoc(doc(db, "lessonGames", gameId),
    { title: (name || "").trim() || "Lesson" }, { merge: true });

  // delete old questions, then write the new set (one batch)
  const old = await getDocs(collection(db, "lessonGames", gameId, "questions"));
  const batch = writeBatch(db);
  old.forEach((d) => batch.delete(d.ref));
  questions.forEach((q, i) => {
    const qRef = doc(collection(db, "lessonGames", gameId, "questions"));
    batch.set(qRef, {
      text: (q.text || "").trim(),
      options: q.options.map((o) => (o || "").trim()),
      correct: q.correct,
      order: i,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

// Delete a lesson AND all of its questions.
export async function deleteGame(gameId) {
  const qs = await getDocs(collection(db, "lessonGames", gameId, "questions"));
  const batch = writeBatch(db);
  qs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "lessonGames", gameId));
  await batch.commit();
}