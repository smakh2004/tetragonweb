/* =====================================================
   TETRAGON — LESSON BATTLE  (quiz.html)
   Two teams answer the TEACHER'S multiple-choice questions.

   Reuses the shared battle machinery from the math games:
     - avatar.riv per team (correct / star / thinking / winner triggers)
     - star.riv per team (lead -> stars)
     - timer.riv + countdown + background music + SFX
     - same scoring + win logic (5 stars, or most correct when time runs out)

   What's different: the per-team control is a QUESTION CARD with 3 option
   buttons; the team selects one, then presses CHECK (your chosen flow).

   Question dealing (the hard requirement):
     - ONE shared shuffled deck of all questions.
     - Deal ALTERNATING cards: deck[0]->T1, deck[1]->T2, deck[2]->T1, ...
       so the two teams draw from DISJOINT halves of the same shuffle.
       => within a team: no repeats until its half is exhausted
       => across teams: at equal progress they hold DIFFERENT questions
     - When a team finishes its half, it reshuffles ITS OWN half (still
       disjoint from the other team, so no same-moment collision), and we
       nudge the shuffle so the first card isn't the one just seen.
   ===================================================== */
import {
  getGame, listQuestions,
} from "./lesson-store.js?v=4";

/* ---------- SAFE SOUND WRAPPERS (same pattern as game.js) ---------- */
function sfx(name)    { try { if (window.Sound) window.Sound.play(name); } catch (e) {} }
function sfxStartBg() { try { if (window.Sound) window.Sound.startBg(); } catch (e) {} }
function sfxStopBg()  { try { if (window.Sound) window.Sound.stopBg(); } catch (e) {} }

/* ---------- SETTINGS (match game.js) ---------- */
const GAME_SECONDS   = 180;
const STARS_TO_WIN   = 5;
const LEAD_PER_STAR  = 5;
const TICK_FROM      = 10;
const SM_NAME        = "State Machine 1";
const TEAM1_COLOR    = 0xffff4b4c;
const TEAM2_COLOR    = 0xff29c1f0;

const T = (k) => (window.getText ? window.getText(k) : k);

/* ---------- STATE ---------- */
let score   = { 1: 0, 2: 0 };
let stars   = { 1: 0, 2: 0 };
let maxLead = { 1: 0, 2: 0 };

let selected = { 1: null, 2: null };   // which option index the team has picked
let current  = { 1: null, 2: null };   // the question object now shown
let deck      = { 1: [], 2: [] };      // each team's own queue of questions
let lastSeen  = { 1: null, 2: null };  // id of the previous question (avoid repeat on reshuffle)

let started = false;
let gameOver = false;
let secondsLeft = GAME_SECONDS;
let timerId = null;

let avatarVM = { 1: null, 2: null };
let starVM   = { 1: null, 2: null };

let allQuestions = [];   // every question in the game (loaded once)
let half = { 1: [], 2: [] };   // the disjoint half assigned to each team

/* ---------- RIVE HELPERS (same as game.js) ---------- */
function fireTrigger(vm, name) {
  if (!vm) return;
  try { const t = vm.trigger(name); if (t) t.trigger(); }
  catch (e) { console.error("trigger", name, e); }
}
function setNumber(vm, name, value) {
  if (!vm) return;
  try { const n = vm.number(name); if (n) n.value = value; }
  catch (e) { console.error("number", name, e); }
}
function setColor(vm, name, argb) {
  if (!vm) return;
  try { const c = vm.color(name); if (c) c.value = argb; }
  catch (e) { console.error("color", name, e); }
}

/* ---------- SHUFFLE ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Split all questions into two disjoint halves via one shared shuffle, dealt
   alternately so equal-index cards differ between the teams. */
function dealHalves() {
  const shared = shuffle(allQuestions);
  half[1] = [];
  half[2] = [];
  shared.forEach((q, i) => (i % 2 === 0 ? half[1] : half[2]).push(q));

  // Edge case: only 1 question total -> both teams must use it. There's no way
  // to keep them different, so both get it (the "no same question" rule can't
  // be honored with a single question; the editor requires >=2 to Start).
  if (allQuestions.length === 1) {
    half[1] = allQuestions.slice();
    half[2] = allQuestions.slice();
  }
  // Edge case: all questions landed in one half (can happen only if length<2).
  if (half[1].length === 0) half[1] = half[2].slice();
  if (half[2].length === 0) half[2] = half[1].slice();

  deck[1] = half[1].slice();
  deck[2] = half[2].slice();
}

/* Refill a team's deck from its own half, reshuffled, avoiding an immediate
   repeat of the question it just saw. */
function refillDeck(team) {
  if (half[team].length <= 1) { deck[team] = half[team].slice(); return; }
  let next = shuffle(half[team]);
  if (next[0] && lastSeen[team] && next[0].id === lastSeen[team]) {
    // move the repeat further down
    const swapWith = 1 + Math.floor(Math.random() * (next.length - 1));
    [next[0], next[swapWith]] = [next[swapWith], next[0]];
  }
  deck[team] = next;
}

/* Pull the next question for a team. */
function drawQuestion(team) {
  if (deck[team].length === 0) refillDeck(team);
  const q = deck[team].shift();
  lastSeen[team] = q ? q.id : lastSeen[team];
  return q || null;
}

/* ---------- RENDER a question card ---------- */
function renderQuestion(team) {
  const q = current[team];
  const qBox = document.getElementById("quizQ" + team);
  const optBox = document.getElementById("quizOpts" + team);
  if (!qBox || !optBox) return;

  if (!q) {
    qBox.textContent = T("noMoreQuestions");
    optBox.innerHTML = "";
    setCheckReady(team, false);
    return;
  }

  qBox.textContent = q.text;
  optBox.innerHTML = "";
  selected[team] = null;

  q.options.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-opt";
    btn.textContent = text;
    btn.dataset.idx = i;
    addPress(btn, () => selectOption(team, i));
    optBox.appendChild(btn);
  });

  setCheckReady(team, false);
}

function selectOption(team, idx) {
  if (!started || gameOver) return;
  selected[team] = idx;
  const optBox = document.getElementById("quizOpts" + team);
  optBox.querySelectorAll(".quiz-opt").forEach((b) => {
    b.classList.toggle("selected", Number(b.dataset.idx) === idx);
  });
  setCheckReady(team, true);
}

function nextQuestion(team) {
  current[team] = drawQuestion(team);
  renderQuestion(team);
}

/* ---------- CHECK (your chosen flow) ---------- */
function setCheckReady(team, ready) {
  const btn = document.getElementById("check" + team);
  if (btn) btn.classList.toggle("ready", !!ready && started && !gameOver);
}

function check(team) {
  if (!started || gameOver) return;
  if (selected[team] === null) return;
  const q = current[team];
  if (!q) return;

  const optBox = document.getElementById("quizOpts" + team);
  const correct = selected[team] === q.correct;

  if (correct) {
    // briefly flash the chosen option green, then move on
    const chosen = optBox.querySelector('.quiz-opt[data-idx="' + selected[team] + '"]');
    if (chosen) chosen.classList.add("correct");
    const over = rewardCorrect(team);
    if (over || gameOver) return;
    // small delay so the green flash is visible before the next question
    setCheckReady(team, false);
    setTimeout(() => { if (!gameOver) nextQuestion(team); }, 220);
  } else {
    // flash the wrong choice red; keep the SAME question so they can retry
    const chosen = optBox.querySelector('.quiz-opt[data-idx="' + selected[team] + '"]');
    if (chosen) {
      chosen.classList.add("wrong");
      setTimeout(() => chosen.classList.remove("wrong"), 500);
    }
    rewardWrong(team);
    selected[team] = null;
    optBox.querySelectorAll(".quiz-opt").forEach((b) => b.classList.remove("selected"));
    setCheckReady(team, false);
  }
}

function rewardCorrect(team) {
  score[team]++; renderScores();
  const earned = updateStars();
  if (gameOver) return true;
  if (earned.includes(team)) { fireTrigger(avatarVM[team], "star"); sfx("star"); }
  else { fireTrigger(avatarVM[team], "correct"); sfx("correct"); }
  return false;
}
function rewardWrong(team) { fireTrigger(avatarVM[team], "thinking"); sfx("wrong"); }

/* ---------- SCORES / STARS (identical to game.js) ---------- */
function renderScores() {
  document.getElementById("score1").textContent = score[1];
  document.getElementById("score2").textContent = score[2];
}
function updateStars() {
  const diff = score[1] - score[2];
  if (diff > maxLead[1]) maxLead[1] = diff;
  if (-diff > maxLead[2]) maxLead[2] = -diff;
  const earnedTeams = [];
  [1, 2].forEach((team) => {
    const earned = Math.min(STARS_TO_WIN, Math.floor(maxLead[team] / LEAD_PER_STAR));
    if (earned > stars[team]) {
      stars[team] = earned;
      setNumber(starVM[team], "star", stars[team]);
      earnedTeams.push(team);
    }
  });
  if (stars[1] >= STARS_TO_WIN) endGame(1);
  else if (stars[2] >= STARS_TO_WIN) endGame(2);
  return earnedTeams;
}

/* ---------- LOAD SHARED RIVE (avatars, stars, timer) ---------- */
function loadSharedRive() {
  [1, 2].forEach((team) => {
    const rv = new rive.Rive({
      src: "rive/avatar.riv",
      canvas: document.getElementById("avatar" + team),
      stateMachines: SM_NAME,
      autoplay: true,
      autoBind: true,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoad: () => {
        rv.resizeDrawingSurfaceToCanvas();
        avatarVM[team] = rv.viewModelInstance;
        setColor(avatarVM[team], "color", team === 1 ? TEAM1_COLOR : TEAM2_COLOR);
      },
      onLoadError: (e) => console.error("avatar" + team + " load error:", e),
    });
    window.addEventListener("resize", () => rv.resizeDrawingSurfaceToCanvas());
  });

  [1, 2].forEach((team) => {
    const rv = new rive.Rive({
      src: "rive/star.riv",
      canvas: document.getElementById("stars" + team),
      stateMachines: SM_NAME,
      autoplay: true,
      autoBind: true,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoad: () => {
        rv.resizeDrawingSurfaceToCanvas();
        starVM[team] = rv.viewModelInstance;
        setNumber(starVM[team], "star", 0);
      },
      onLoadError: (e) => console.error("stars" + team + " load error:", e),
    });
    window.addEventListener("resize", () => rv.resizeDrawingSurfaceToCanvas());
  });

  const timerRive = new rive.Rive({
    src: "rive/timer.riv",
    canvas: document.getElementById("clock"),
    autoplay: true,
    layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
    onLoad: () => timerRive.resizeDrawingSurfaceToCanvas(),
    onLoadError: (e) => console.error("timer load error:", e),
  });
  window.addEventListener("resize", () => timerRive.resizeDrawingSurfaceToCanvas());
}

/* ---------- TIMER (identical to game.js) ---------- */
function fmt(s) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}
function startTimer() {
  document.getElementById("timerText").textContent = fmt(secondsLeft);
  timerId = setInterval(() => {
    try {
      secondsLeft--;
      document.getElementById("timerText").textContent = fmt(Math.max(0, secondsLeft));
      if (secondsLeft <= TICK_FROM && secondsLeft > 0) sfx("tick");
      if (secondsLeft <= 0) { clearInterval(timerId); onTimeUp(); }
    } catch (e) { console.error("timer tick error:", e); }
  }, 1000);
}
function onTimeUp() {
  if (gameOver) return;
  if (score[1] > score[2]) endGame(1);
  else if (score[2] > score[1]) endGame(2);
  else endGame(0);
}

/* ---------- END GAME (identical to game.js) ---------- */
let lastWinner = null;
function endGame(winner) {
  if (gameOver) return;
  gameOver = true;
  lastWinner = winner;
  if (timerId) clearInterval(timerId);
  sfxStopBg();
  if (winner === 1 || winner === 2) { fireTrigger(avatarVM[winner], "winner"); sfx("win"); }
  setCheckReady(1, false); setCheckReady(2, false);
  showResult();
  document.getElementById("result").hidden = false;
  document.querySelector(".center").classList.add("has-result");
}
function showResult() {
  const el = document.getElementById("resultTitle");
  const getTx = (k) => (window.getText ? window.getText(k) : k);
  if (lastWinner === 0) { el.textContent = getTx("draw"); el.className = "result-title"; }
  else {
    const teamName = getTx(lastWinner === 1 ? "team1" : "team2");
    el.textContent = teamName + " " + getTx("wins");
    el.className = "result-title win-" + lastWinner;
  }
}
document.getElementById("resultBtn").addEventListener("click", () => { location.reload(); });

/* ---------- INPUT HELPER (same as game.js, handles touch+click once) ---------- */
function addPress(el, handler) {
  let firedByPointer = false;
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); firedByPointer = true; handler(); });
  el.addEventListener("click", () => { if (firedByPointer) { firedByPointer = false; return; } handler(); });
}

/* ---------- LANGUAGE CHANGE ---------- */
document.addEventListener("languagechange", () => {
  // questions are teacher content (not translated), but re-render keeps the
  // "no more questions" placeholder + result title in the current language
  if (!current[1]) renderQuestion(1);
  if (!current[2]) renderQuestion(2);
  if (gameOver) showResult();
});

/* ---------- COUNTDOWN & START (identical pattern to game.js) ---------- */
function restartPop(el) {
  try { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } catch (e) {}
}
function runCountdown() {
  const overlay = document.getElementById("countdown");
  const textEl = document.getElementById("countdownText");
  const getTx = (k) => (window.getText ? window.getText(k) : "GO!");
  const steps = ["3", "2", "1", getTx("go")];
  let i = 0;
  const show = () => {
    try {
      textEl.textContent = steps[i];
      const isGo = i === steps.length - 1;
      textEl.classList.toggle("go", isGo);
      restartPop(textEl);
      sfx(isGo ? "start" : "count");
    } catch (e) { console.error("countdown show error:", e); }
  };
  show();
  const id = setInterval(() => {
    i++;
    if (i < steps.length) show();
    else { clearInterval(id); overlay.classList.add("hide"); beginGame(); }
  }, 1000);
}
function beginGame() {
  if (started) return;
  started = true;
  sfxStartBg();
  startTimer();
  // first questions for both teams
  nextQuestion(1);
  nextQuestion(2);
}

/* ---------- SOUND TOGGLE (identical to game.js) ---------- */
(function initSoundToggle() {
  const btn = document.getElementById("soundBtn");
  if (!btn) return;
  const isOn = () => {
    try { return localStorage.getItem("tetragon_sound") !== "off"; } catch (e) { return true; }
  };
  const apply = () => {
    const on = isOn();
    btn.classList.toggle("off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  };
  apply();
  btn.addEventListener("click", () => {
    const turningOn = !isOn();
    try { localStorage.setItem("tetragon_sound", turningOn ? "on" : "off"); } catch (e) {}
    apply();
    if (turningOn) { if (started && !gameOver) sfxStartBg(); } else { sfxStopBg(); }
  });
})();

/* ---------- BOOT ---------- */
async function boot() {
  const params = new URLSearchParams(location.search);
  const gameId = params.get("game");

  if (!gameId) { showLoadError(); return; }

  // wire CHECK buttons up front
  addPress(document.getElementById("check1"), () => check(1));
  addPress(document.getElementById("check2"), () => check(2));
  if (window.Sound && window.Sound.unlock) window.Sound.unlock();

  loadSharedRive();
  renderScores();

  // load the questions, THEN run the countdown so the game is ready at GO!
  try {
    const game = await getGame(gameId);
    if (game) {
      const titleEl = document.getElementById("gameTitle");
      if (titleEl) titleEl.textContent = game.title || T("mini");
    }
    allQuestions = await listQuestions(gameId);
  } catch (e) {
    console.error("Failed to load questions:", e);
  }

  if (!allQuestions || allQuestions.length < 1) { showLoadError(); return; }

  dealHalves();
  runCountdown();
}

function showLoadError() {
  // no questions / bad link: show a message where the question would be and
  // send the teacher back to the games list
  [1, 2].forEach((t) => {
    const qBox = document.getElementById("quizQ" + t);
    if (qBox) qBox.textContent = T("needQuestions");
  });
  const overlay = document.getElementById("countdown");
  if (overlay) overlay.classList.add("hide");
}

boot();