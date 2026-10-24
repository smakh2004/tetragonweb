/* =====================================================
   STUDENT LESSON (student-lesson.html?group=<id>&lesson=<id>)
   One attempt only:
     - Start claims the attempt (results/{lesson}_{uid}, status "started")
     - progress is saved after every question
     - each question has the teacher's time limit; time out = wrong
     - at the end: score, correct count, position in the group leaderboard
   Coming back to a lesson already taken (or left half-way) shows the result.
===================================================== */
import {
  currentUser, isMember, getGroup, getLesson, getResult, startAttempt, saveProgress,
  lessonMaxScore, leaderboard,
} from "./groupstore.js";
import { t, esc, param, renderLeaderboard } from "./groupui.js";

const groupId  = param("group").toUpperCase();
const lessonId = param("lesson");
const $ = (id) => document.getElementById(id);

const LETTERS = ["A", "B", "C", "D"];
const NEXT_DELAY = 1300;   // ms to show right/wrong before the next question

let me = null, lesson = null;
let state = { answers: [], score: 0, correct: 0 };
let index = 0, deadline = 0, timer = null, locked = false;
let playing = false;
let saving = Promise.resolve();   // keeps progress writes in order

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function showSection(id) {
  ["intro", "play", "result"].forEach((s) => { $(s).hidden = s !== id; });
}

/* ---------- intro ---------- */
function showIntro() {
  const qs = lesson.questions;
  $("introTitle").textContent = lesson.title;
  $("statQ").textContent = qs.length;
  $("statPts").textContent = lessonMaxScore(lesson);
  $("statTime").textContent = fmtTime(qs.reduce((s, q) => s + q.time, 0));
  showSection("intro");
}

$("startBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await startAttempt(groupId, lessonId, me);
  } catch (err) {
    if (err.code === "ALREADY_TAKEN") return showResult(await getResult(groupId, lessonId, me.uid));
    console.error("start lesson failed:", err);
    $("introMsg").textContent = t("saveFailed", "Couldn't save. Try again.");
    $("introMsg").hidden = false;
    btn.disabled = false;
    return;
  }
  playing = true;
  showSection("play");
  showQuestion();
});

/* ---------- playing ---------- */
function showQuestion() {
  const q = lesson.questions[index];
  locked = false;
  $("qpProgress").textContent = `${index + 1} / ${lesson.questions.length}`;
  $("qpPoints").textContent = `${q.score} ${t("pointsWord", "points")}`;
  $("qpQuestion").textContent = q.text;
  $("qpFeedback").textContent = "";
  $("qpFeedback").className = "qp-feedback";
  $("qpOptions").innerHTML = q.options.map((o, i) =>
    `<button class="qp-opt" type="button" data-i="${i}"><b>${LETTERS[i]}</b><span>${esc(o)}</span></button>`).join("");

  deadline = Date.now() + q.time * 1000;
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 200);
}

function tick() {
  const q = lesson.questions[index];
  const left = Math.max(0, deadline - Date.now());
  const secs = Math.ceil(left / 1000);
  const low = secs <= 5;
  $("qpTimer").textContent = secs;
  $("qpTimer").classList.toggle("low", low);
  $("qpBar").style.width = (left / (q.time * 1000)) * 100 + "%";
  $("qpBar").classList.toggle("low", low);
  if (left <= 0) answer(-1);
}

$("qpOptions").addEventListener("click", (e) => {
  const b = e.target.closest(".qp-opt");
  if (b) answer(Number(b.dataset.i));
});

function answer(pick) {
  if (locked) return;
  locked = true;
  clearInterval(timer);

  const q = lesson.questions[index];
  const right = pick === q.correct;
  state.answers.push(pick);
  if (right) { state.score += q.score; state.correct += 1; }

  const opts = $("qpOptions").querySelectorAll(".qp-opt");
  opts.forEach((b) => { b.disabled = true; });
  opts[q.correct].classList.add("correct");
  if (pick >= 0 && !right) opts[pick].classList.add("wrong");
  const fb = $("qpFeedback");
  fb.textContent = right ? `${t("correctWord", "Correct!")} +${q.score}`
    : pick < 0 ? t("timeUp", "Time's up!") : t("wrongWord", "Wrong");
  fb.className = "qp-feedback " + (right ? "ok" : "bad");

  const last = index === lesson.questions.length - 1;
  const snapshot = { ...state, answers: [...state.answers] };
  saving = saving.then(() => saveProgress(groupId, lessonId, me.uid, snapshot, last))
    .catch((err) => console.error("save progress failed:", err));

  setTimeout(async () => {
    if (!last) { index += 1; showQuestion(); return; }
    await saving;
    playing = false;
    showResult({ ...state, status: "finished" });
  }, NEXT_DELAY);
}

// leaving mid-lesson ends the attempt — warn first
window.addEventListener("beforeunload", (e) => {
  if (playing) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- result ---------- */
async function showResult(r) {
  const max = lessonMaxScore(lesson);
  $("resultTitle").textContent = lesson.title;
  $("resultScore").textContent = `${r.score} / ${max}`;
  $("resultCorrect").textContent = t("correctOf", "{correct} of {total} correct")
    .replace("{correct}", r.correct || 0).replace("{total}", lesson.questions.length);
  showSection("result");

  try {
    const board = await leaderboard(groupId);
    const row = board.find((x) => x.uid === me.uid);
    $("resultRank").textContent = row
      ? t("yourPosition", "Your position: #{rank} of {total} · {score} points")
          .replace("{rank}", row.rank).replace("{total}", board.length).replace("{score}", row.score)
      : "";
    renderLeaderboard($("board"), board, me.uid);
  } catch (e) {
    console.error("load leaderboard failed:", e);
  }
}

/* ---------- boot ---------- */
(async () => {
  me = await currentUser();
  if (!me) return;   // role-guard redirects
  let group = null;
  try {
    if (groupId && lessonId && await isMember(groupId, me.uid)) {
      [group, lesson] = await Promise.all([getGroup(groupId), getLesson(groupId, lessonId)]);
    }
  } catch (e) { group = null; }
  $("loading").hidden = true;
  if (!group || !lesson || !(lesson.questions || []).length) { $("notFound").hidden = false; return; }

  document.title = "Tetragon — " + lesson.title;
  $("backLink").href = "student-group.html?id=" + encodeURIComponent(groupId);
  $("backName").textContent = group.name;
  $("page").hidden = false;

  const existing = await getResult(groupId, lessonId, me.uid).catch(() => null);
  if (!existing) return showIntro();
  if (existing.status !== "finished") {
    // left half-way last time: the attempt ends with what was earned
    await saveProgress(groupId, lessonId, me.uid, existing, true).catch(() => {});
  }
  showResult(existing);
})();
