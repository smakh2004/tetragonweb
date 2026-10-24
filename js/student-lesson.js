/* =====================================================
   STUDENT LESSON (student-lesson.html?group=<id>&lesson=<id>)
   One attempt only:
     - Start claims the attempt (results/{lesson}_{uid}, status "started")
     - questions come in the teacher's order; progress is saved after each one
     - each question has the teacher's time limit; time out = wrong
     - STARS: start with 15. A wrong answer costs stars by how many wrong
       answers are in a row (see starPenalty). At 0 stars the lesson pauses:
       buy a refill via Click (19 000 so'm) and continue from the next
       question with the same score, or finish the lesson.
     - at the end: score, correct count, time, position in the group leaderboard
   Coming back to a lesson already taken (or left half-way) shows the result;
   one paused at 0 stars offers the refill again.
===================================================== */
import {
  currentUser, isMember, getGroup, getLesson, getResult, startAttempt, saveProgress,
  lessonMaxScore, leaderboard, watchResult, requestStarRefill, STARS_START,
} from "./groupstore.js";
import { clickPayUrl, PRICES } from "./click.js";
import { t, esc, param, renderLeaderboard } from "./groupui.js";

const groupId  = param("group").toUpperCase();
const lessonId = param("lesson");
const $ = (id) => document.getElementById(id);

const LETTERS = ["A", "B", "C", "D"];
const NEXT_DELAY = 1300;   // ms to show right/wrong before the next question

let me = null, lesson = null;
let state = null;          // { answers, score, correct, stars, wrongStreak, timeSpent }
let index = 0, shownAt = 0, deadline = 0, timer = null, locked = false;
let playing = false;
let saving = Promise.resolve();   // keeps progress writes in order
let stopWatch = null;             // live listener while waiting for a star payment

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const price = PRICES.stars.toLocaleString("ru-RU");
const total = () => lesson.questions.length;

// stars lost for a wrong answer, by wrong answers in a row (this one included)
function starPenalty(streak, stars) {
  if (streak >= 10) return stars;   // ten in a row: all stars
  if (streak >= 4) return 8;
  if (streak >= 2) return 4;
  return 1;
}

function fromResult(r) {
  return {
    answers: [...(r.answers || [])],
    score: r.score || 0,
    correct: r.correct || 0,
    stars: typeof r.stars === "number" ? r.stars : STARS_START,
    wrongStreak: r.wrongStreak || 0,
    timeSpent: r.timeSpent || 0,
  };
}

function showSection(id) {
  ["intro", "play", "noStars", "result"].forEach((s) => { $(s).hidden = s !== id; });
}

/* ---------- intro ---------- */
function showIntro() {
  const qs = lesson.questions;
  $("introTitle").textContent = lesson.title;
  $("statQ").textContent = qs.length;
  $("statPts").textContent = lessonMaxScore(lesson);
  $("statTime").textContent = fmtTime(qs.reduce((s, q) => s + q.time, 0));
  $("statStars").textContent = "★ " + STARS_START;
  showSection("intro");
}

$("startBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await startAttempt(groupId, lessonId, me);
  } catch (err) {
    if (err.code === "ALREADY_TAKEN") return boot();
    console.error("start lesson failed:", err);
    $("introMsg").textContent = t("saveFailed", "Couldn't save. Try again.");
    $("introMsg").hidden = false;
    btn.disabled = false;
    return;
  }
  state = fromResult({});
  index = 0;
  play();
});

/* ---------- playing ---------- */
function play() {
  playing = true;
  showSection("play");
  showQuestion();
}

function renderTop() {
  $("qpProgress").textContent = `${index + 1} / ${total()} ${t("questionsWord", "questions")}`;
  $("qpStars").textContent = "★ " + state.stars;
  // one segment per question: answered right / wrong, current, still to come
  $("qpSteps").innerHTML = lesson.questions.map((q, i) => {
    const a = state.answers[i];
    const cls = i < state.answers.length ? (a === q.correct ? "ok" : "bad") : i === index ? "now" : "";
    return `<span class="${cls}"></span>`;
  }).join("");
}

function showQuestion() {
  const q = lesson.questions[index];
  locked = false;
  renderTop();
  $("qpNum").textContent = `${t("questionLabel", "Question")} ${index + 1}`;
  $("qpPoints").textContent = `${q.score} ${t("pointsWord", "points")}`;
  $("qpQuestion").textContent = q.text;
  $("qpFeedback").textContent = "";
  $("qpFeedback").className = "qp-feedback";
  $("qpOptions").innerHTML = q.options.map((o, i) =>
    `<button class="qp-opt" type="button" data-i="${i}"><b>${LETTERS[i]}</b><span>${esc(o)}</span></button>`).join("");

  shownAt = Date.now();
  deadline = shownAt + q.time * 1000;
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
  state.timeSpent += Math.min(q.time, Math.round((Date.now() - shownAt) / 1000));
  let lost = 0;
  if (right) {
    state.score += q.score;
    state.correct += 1;
    state.wrongStreak = 0;
  } else {
    state.wrongStreak += 1;
    lost = Math.min(state.stars, starPenalty(state.wrongStreak, state.stars));
    state.stars -= lost;
  }

  const opts = $("qpOptions").querySelectorAll(".qp-opt");
  opts.forEach((b) => { b.disabled = true; });
  opts[q.correct].classList.add("correct");
  if (pick >= 0 && !right) opts[pick].classList.add("wrong");
  const fb = $("qpFeedback");
  fb.textContent = right ? `${t("correctWord", "Correct!")} +${q.score}`
    : `${pick < 0 ? t("timeUp", "Time's up!") : t("wrongWord", "Wrong")}  −${lost} ★`;
  fb.className = "qp-feedback " + (right ? "ok" : "bad");
  renderTop();

  const last = index === total() - 1;
  const snapshot = { ...state, answers: [...state.answers] };
  saving = saving.then(() => saveProgress(groupId, lessonId, me.uid, snapshot, last))
    .catch((err) => console.error("save progress failed:", err));

  setTimeout(async () => {
    if (last) return finish();
    index += 1;
    if (state.stars <= 0) { await saving; return showNoStars(); }
    showQuestion();
  }, NEXT_DELAY);
}

async function finish() {
  await saving;
  playing = false;
  showResult({ ...state, status: "finished" });
}

// leaving mid-lesson ends the attempt — warn first
window.addEventListener("beforeunload", (e) => {
  if (playing) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- out of stars: refill (Click) or finish ---------- */
let waitingPayment = false;

function showNoStars() {
  playing = false;   // leaving now is fine: coming back offers the refill again
  waitingPayment = false;
  $("noStarsText").textContent = t("noStarsText",
    "Buy {stars} stars for {price} so'm and continue from question {n} — your score and answers stay. Or finish the lesson now.")
    .replace("{stars}", STARS_START).replace("{price}", price).replace("{n}", index + 1);
  $("buyStarsBtn").textContent = t("buyStars", "Buy {stars} ★ — {price} so'm")
    .replace("{stars}", STARS_START).replace("{price}", price);
  $("buyStarsBtn").disabled = false;
  $("finishBtn").disabled = false;
  $("waitPay").hidden = true;
  showSection("noStars");

  // clickComplete refills the attempt; continue as soon as it lands
  if (stopWatch) stopWatch();
  stopWatch = watchResult(groupId, lessonId, me.uid, (r) => {
    if (!r || r.status !== "started" || !(r.stars > 0)) return;
    stopWatch(); stopWatch = null;
    state.stars = r.stars;
    state.wrongStreak = 0;
    play();   // same score + answers; fresh timer on the next question
  });
}

$("buyStarsBtn").addEventListener("click", async () => {
  // open the tab inside the click so the browser doesn't block it
  const payTab = window.open("about:blank", "_blank");
  $("buyStarsBtn").disabled = true;
  try {
    await requestStarRefill(groupId, lessonId, me.uid);
  } catch (err) {
    console.error("star refill request failed:", err);
    if (payTab) try { payTab.close(); } catch (e) {}
    $("buyStarsBtn").disabled = false;
    return;
  }
  const url = clickPayUrl(me.uid, "stars");
  if (payTab) payTab.location.href = url;
  else window.open(url, "_blank");
  waitingPayment = true;
  $("waitPay").hidden = false;
  $("buyStarsBtn").disabled = false;   // allow retry if the Click tab was closed
});

$("finishBtn").addEventListener("click", async () => {
  if (waitingPayment && !confirm(t("confirmFinishPending",
    "Your payment hasn't arrived yet. Finish anyway? A payment that arrives later won't be used."))) return;
  $("finishBtn").disabled = true;
  if (stopWatch) { stopWatch(); stopWatch = null; }
  saving = saving.then(() => saveProgress(groupId, lessonId, me.uid, state, true))
    .catch((err) => console.error("finish lesson failed:", err));
  finish();
});

/* ---------- result ---------- */
async function showResult(r) {
  const s = fromResult(r);
  $("resultTitle").textContent = lesson.title;
  $("resultScore").textContent = `${s.score} / ${lessonMaxScore(lesson)}`;
  $("resCorrect").textContent = `${s.correct} / ${total()}`;
  $("resTime").textContent = fmtTime(s.timeSpent);
  $("resStars").textContent = "★ " + s.stars;
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
async function boot() {
  const existing = await getResult(groupId, lessonId, me.uid).catch(() => null);
  if (!existing) return showIntro();
  if (existing.status === "finished") return showResult(existing);

  state = fromResult(existing);
  index = state.answers.length;
  if (index < total()) {
    if (state.stars <= 0) return showNoStars();   // paused: offer the refill again
    if (existing.resumable) return play();         // just paid: continue
  }
  // left half-way last time: the attempt ends with what was earned
  await saveProgress(groupId, lessonId, me.uid, state, true).catch(() => {});
  showResult(existing);
}

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
  boot();
})();
