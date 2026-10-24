/* =====================================================
   GROUP-STORE — all Firestore access for GROUPS (teacher <-> students)
   -----------------------------------------------------
   Teachers create groups; students join a group by its ID. Inside a group
   the teacher creates lessons (individual quizzes): each question has its
   own time limit and score. A student can take each lesson ONCE; scores
   add up into the group's leaderboard.

   Firestore layout:
     groups/{groupId}                     groupId = short join code, e.g. "K7Q2MX"
        name, teacherId, teacherName, createdAt
     groups/{groupId}/members/{uid}
        name, email, joinedAt
     groups/{groupId}/lessons/{lessonId}
        title, createdAt, updatedAt
        questions: [{ text, options:[a,b,c,d], correct:0-3, time:<sec>, score:<pts> }]
     groups/{groupId}/results/{lessonId}_{uid}     one attempt per student per lesson
        lessonId, uid, name, status:"started"|"finished",
        score, correct, answers:[<picked index | -1>], timeSpent:<sec>,
        stars, wrongStreak, startedAt, finishedAt
        refills, refilledAt, resumable   (set ONLY by the clickComplete function)
     users/{uid}.groups : [groupId, ...]          (groups a student joined)
     users/{uid}.starRefillFor : "groups/<gid>/results/<id>"  (attempt a star
        payment refills; read by clickComplete)

   Free teachers: up to FREE_MAX_GAMES lessons in all their groups together,
   FREE_MAX_QUESTIONS questions per lesson (same limits as lessonstore.js).
   Premium teachers and groups: unlimited.
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  addDoc, query, where, serverTimestamp, writeBatch, arrayUnion, arrayRemove,
  getCountFromServer, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { FREE_MAX_GAMES, FREE_MAX_QUESTIONS, isPremiumAsync } from "./lessonstore.js";

export { FREE_MAX_GAMES, FREE_MAX_QUESTIONS, isPremiumAsync };

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export const OPTION_COUNT  = 4;
export const DEFAULT_TIME  = 30;   // seconds per question
export const DEFAULT_SCORE = 10;   // points per question
export const STARS_START   = 15;   // stars at the start of a lesson (and after a refill)

/* ---------- auth ---------- */
// Resolves once Firebase has restored the saved session (see lessonstore.js).
export async function currentUser() {
  await auth.authStateReady();
  return auth.currentUser;
}

export function displayName(user) {
  return user.displayName || (user.email ? user.email.split("@")[0] : "User");
}

// Firestore Timestamp -> millis (missing = 0), for client-side sorting
const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
const byCreated = (a, b) => ms(a.createdAt) - ms(b.createdAt);

/* ---------- group IDs ---------- */
// no 0/O/1/I so the code is easy to read out loud and type
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 6) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}
export function normalizeCode(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ---------- groups (teacher) ---------- */
export async function createGroup(user, name) {
  for (let tries = 0; tries < 5; tries++) {
    const id = randomCode();
    const ref = doc(db, "groups", id);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, {
      name: name.trim(),
      teacherId: user.uid,
      teacherName: displayName(user),
      createdAt: serverTimestamp(),
    });
    return id;
  }
  throw new Error("Could not find a free group ID");
}

// where() only, sorted in JS -> no composite index needed
export async function listTeacherGroups(uid) {
  const snap = await getDocs(query(collection(db, "groups"), where("teacherId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreated);
}

export async function getGroup(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function renameGroup(groupId, name) {
  await updateDoc(doc(db, "groups", groupId), { name: name.trim() });
}

// Deletes the group and everything inside it.
export async function deleteGroup(groupId) {
  const subs = await Promise.all(["members", "lessons", "results"].map(
    (c) => getDocs(collection(db, "groups", groupId, c))));
  const refs = subs.flatMap((s) => s.docs.map((d) => d.ref));
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteDoc(doc(db, "groups", groupId));
}

/* ---------- members ---------- */
export async function listMembers(groupId) {
  const snap = await getDocs(collection(db, "groups", groupId, "members"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function removeMember(groupId, uid) {
  await deleteDoc(doc(db, "groups", groupId, "members", uid));
}

// Student joins by ID. Throws err.code "NOT_FOUND" for an unknown ID.
export async function joinGroup(user, rawCode) {
  const id = normalizeCode(rawCode);
  const group = id ? await getGroup(id) : null;
  if (!group) { const e = new Error("NOT_FOUND"); e.code = "NOT_FOUND"; throw e; }
  await setDoc(doc(db, "groups", id, "members", user.uid), {
    name: displayName(user),
    email: user.email || "",
    joinedAt: serverTimestamp(),
  }, { merge: true });
  await setDoc(doc(db, "users", user.uid), { groups: arrayUnion(id) }, { merge: true });
  return group;
}

export async function isMember(groupId, uid) {
  return (await getDoc(doc(db, "groups", groupId, "members", uid))).exists();
}

// Groups this student belongs to (skips ones they were removed from / deleted).
export async function listStudentGroups(uid) {
  const u = await getDoc(doc(db, "users", uid));
  const ids = (u.exists() && u.data().groups) || [];
  const groups = await Promise.all(ids.map(async (id) => {
    try {
      const [g, member] = await Promise.all([getGroup(id), isMember(id, uid)]);
      return g && member ? g : null;
    } catch (e) { return null; }   // no access any more
  }));
  const gone = ids.filter((id, i) => !groups[i]);
  if (gone.length) {
    setDoc(doc(db, "users", uid), { groups: arrayRemove(...gone) }, { merge: true }).catch(() => {});
  }
  return groups.filter(Boolean);
}

/* ---------- lessons ---------- */
function cleanQuestions(questions) {
  return questions.map((q) => ({
    text: q.text.trim(),
    options: q.options.map((o) => o.trim()),
    correct: q.correct,
    time: Math.max(5, Math.round(Number(q.time) || DEFAULT_TIME)),
    score: Math.max(1, Math.round(Number(q.score) || DEFAULT_SCORE)),
  }));
}

export function lessonMaxScore(lesson) {
  return (lesson.questions || []).reduce((s, q) => s + (q.score || 0), 0);
}

export async function listLessons(groupId) {
  const snap = await getDocs(collection(db, "groups", groupId, "lessons"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byCreated);
}

export async function getLesson(groupId, lessonId) {
  const snap = await getDoc(doc(db, "groups", groupId, "lessons", lessonId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Lessons in ALL of this teacher's groups (for the free limit).
export async function countTeacherLessons(uid) {
  const groups = await listTeacherGroups(uid);
  const counts = await Promise.all(groups.map((g) =>
    getCountFromServer(collection(db, "groups", g.id, "lessons"))));
  return counts.reduce((s, c) => s + c.data().count, 0);
}

const limitError = (code) => { const e = new Error("LIMIT"); e.code = code; return e; };

// Throws err.code "GAME_LIMIT" (too many lessons) or "QUESTION_LIMIT" for free teachers.
export async function saveLesson(groupId, lessonId, title, questions, { uid, premium } = {}) {
  if (!premium) {
    if (questions.length > FREE_MAX_QUESTIONS) throw limitError("QUESTION_LIMIT");
    if (!lessonId && await countTeacherLessons(uid) >= FREE_MAX_GAMES) throw limitError("GAME_LIMIT");
  }
  const data = { title: title.trim(), questions: cleanQuestions(questions), updatedAt: serverTimestamp() };
  if (lessonId) {
    await updateDoc(doc(db, "groups", groupId, "lessons", lessonId), data);
    return lessonId;
  }
  const ref = await addDoc(collection(db, "groups", groupId, "lessons"),
    { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

// Deletes the lesson and every student's attempt at it.
export async function deleteLesson(groupId, lessonId) {
  const res = await getDocs(query(collection(db, "groups", groupId, "results"),
    where("lessonId", "==", lessonId)));
  const batch = writeBatch(db);
  res.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "groups", groupId, "lessons", lessonId));
  await batch.commit();
}

/* ---------- results (one attempt per student per lesson) ---------- */
const resultRef = (groupId, lessonId, uid) =>
  doc(db, "groups", groupId, "results", `${lessonId}_${uid}`);

export async function listResults(groupId) {
  const snap = await getDocs(collection(db, "groups", groupId, "results"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getResult(groupId, lessonId, uid) {
  const snap = await getDoc(resultRef(groupId, lessonId, uid));
  return snap.exists() ? snap.data() : null;
}

// Claims the single attempt. Throws err.code "ALREADY_TAKEN" if one exists.
export async function startAttempt(groupId, lessonId, user) {
  const ref = resultRef(groupId, lessonId, user.uid);
  if ((await getDoc(ref)).exists()) {
    const e = new Error("ALREADY_TAKEN"); e.code = "ALREADY_TAKEN"; throw e;
  }
  await setDoc(ref, {
    lessonId, uid: user.uid, name: displayName(user),
    status: "started", score: 0, correct: 0, answers: [], timeSpent: 0,
    stars: STARS_START, wrongStreak: 0,
    startedAt: serverTimestamp(),
  });
}

// Saved after every question, so leaving mid-lesson keeps what was earned.
export async function saveProgress(groupId, lessonId, uid, s, finished) {
  const data = {
    answers: s.answers, score: s.score, correct: s.correct, timeSpent: s.timeSpent || 0,
    stars: s.stars, wrongStreak: s.wrongStreak || 0,
    resumable: false,   // a paid refill can be resumed only until the next answer
  };
  if (finished) Object.assign(data, { status: "finished", finishedAt: serverTimestamp() });
  await updateDoc(resultRef(groupId, lessonId, uid), data);
}

// Live updates of one attempt (to notice a paid star refill).
export function watchResult(groupId, lessonId, uid, cb) {
  return onSnapshot(resultRef(groupId, lessonId, uid), (snap) => cb(snap.exists() ? snap.data() : null));
}

// Points the next Click star payment at this attempt (read by clickComplete).
export async function requestStarRefill(groupId, lessonId, uid) {
  await setDoc(doc(db, "users", uid),
    { starRefillFor: `groups/${groupId}/results/${lessonId}_${uid}` }, { merge: true });
}

// Teacher: let a student take a lesson again.
export async function resetAttempt(groupId, lessonId, uid) {
  await deleteDoc(resultRef(groupId, lessonId, uid));
}

/* ---------- leaderboard ---------- */
// Every member with their total score across the group's lessons, ranked.
// Equal totals share a rank (1, 2, 2, 4).
export async function leaderboard(groupId) {
  const [members, results] = await Promise.all([listMembers(groupId), listResults(groupId)]);
  const rows = new Map(members.map((m) => [m.uid, { uid: m.uid, name: m.name, score: 0, lessons: 0 }]));
  results.forEach((r) => {
    const row = rows.get(r.uid);
    if (!row) return;   // student was removed from the group
    row.score += r.score || 0;
    row.lessons += 1;
  });
  const list = [...rows.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  list.forEach((row, i) => {
    row.rank = i > 0 && row.score === list[i - 1].score ? list[i - 1].rank : i + 1;
  });
  return list;
}
