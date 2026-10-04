/* =====================================================
   TETRAGON — LESSON BATTLE  (quiz.html)
   Two teams answer the TEACHER'S multiple-choice questions.

   RULES (per the latest spec):
     - Each team gets EVERY question exactly once, in its own random order.
       No repeats, no looping.
     - When a team answers its last question, THAT team is finished: it shows
       its final score ("X / N correct") and stops. The other team keeps going.
     - The game ends when BOTH teams finish, OR when the timer runs out.
     - Winner = the team with more correct answers (draw if equal).
     - NO star animation / no stars at all.

   Reuses the shared battle machinery: avatars, timer, countdown, music, SFX.
   Per-team control is a question card with 3 option buttons + CHECK.
   ===================================================== */
import {
  getGame, listQuestions,
} from "./lessonstore.js";

/* ---------- BUILT-IN SOUND ENGINE (Web Audio) ----------
   Self-contained: no external sound.js, no audio files. Synthesizes every
   effect + a gentle looping background track with oscillators. This is why
   the quiz now has sound even though the project ships no assets/sounds/*. */
const Sfx = (function () {
  let ctx = null, master = null, bgTimer = null, bgGain = null, bgStep = 0;

  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.4;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }
    return ctx;
  }
  function resume() {
    const c = ac();
    if (c && c.state === "suspended") { try { c.resume(); } catch (e) {} }
  }
  function tone(freq, dur, type, vol, when, dest) {
    const c = ac(); if (!c) return;
    const t0 = when || c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function play(name) {
    const c = ac(); if (!c) return;
    resume();
    const now = c.currentTime;
    switch (name) {
      case "correct":
        tone(660, 0.12, "triangle", 0.4, now);
        tone(990, 0.18, "triangle", 0.34, now + 0.10);
        break;
      case "wrong":
        tone(210, 0.22, "sawtooth", 0.28, now);
        tone(150, 0.26, "sawtooth", 0.24, now + 0.09);
        break;
      case "tick":
        tone(880, 0.05, "square", 0.2, now);
        break;
      case "count":
        tone(520, 0.14, "sine", 0.32, now);
        break;
      case "start":
      case "go":
        tone(523, 0.12, "triangle", 0.4, now);
        tone(784, 0.22, "triangle", 0.4, now + 0.12);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.4, now + i * 0.13));
        break;
      default:
        tone(440, 0.1, "sine", 0.28, now);
    }
  }
  const BG = [392, 440, 494, 523, 494, 440, 392, 330];
  function startBg() {
    const c = ac(); if (!c) return;
    resume();
    if (bgTimer) return;
    if (!bgGain) { bgGain = c.createGain(); bgGain.gain.value = 0.9; bgGain.connect(master); }
    bgStep = 0;
    const strike = () => {
      if (!ctx) return;
      tone(BG[bgStep % BG.length], 0.4, "sine", 0.07, ctx.currentTime, bgGain);
      bgStep++;
    };
    strike();
    bgTimer = setInterval(strike, 430);
  }
  function stopBg() {
    if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
  }
  return { play, startBg, stopBg, unlock: resume, resume };
})();

/* ---------- SAFE SOUND WRAPPERS ----------
   Respect the on/off preference saved by the sound toggle (bottom-right). */
function soundOn() {
  try { return localStorage.getItem("tetragon_sound") !== "off"; } catch (e) { return true; }
}
function sfx(name)    { if (!soundOn()) return; try { Sfx.play(name); } catch (e) {} }
function sfxStartBg() { if (!soundOn()) return; try { Sfx.startBg(); } catch (e) {} }
function sfxStopBg()  { try { Sfx.stopBg(); } catch (e) {} }

/* ---------- SETTINGS ---------- */
const GAME_SECONDS   = 180;
const TICK_FROM      = 10;
const SM_NAME        = "State Machine 1";
const TEAM1_COLOR    = 0xffff4b4c;
const TEAM2_COLOR    = 0xff29c1f0;

const T = (k) => (window.getText ? window.getText(k) : k);

/* ---------- STATE ---------- */
let score   = { 1: 0, 2: 0 };          // correct answers
let answered = { 1: 0, 2: 0 };         // how many questions this team has completed
let selected = { 1: null, 2: null };   // option index the team has picked
let current  = { 1: null, 2: null };   // the question now shown
let deck     = { 1: [], 2: [] };       // each team's remaining questions (full set, shuffled)
let done     = { 1: false, 2: false }; // team has answered every question

let started = false;
let gameOver = false;
let secondsLeft = GAME_SECONDS;
let timerId = null;

let avatarVM = { 1: null, 2: null };

let totalQuestions = 0;   // N — total questions in this lesson

/* ---------- RIVE HELPERS ---------- */
function fireTrigger(vm, name) {
  if (!vm) return;
  try { const t = vm.trigger(name); if (t) t.trigger(); }
  catch (e) { console.error("trigger", name, e); }
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

/* Each team gets its OWN independent shuffle of ALL questions -> every
   question appears exactly once per team, in a random order. */
function dealDecks() {
  deck[1] = shuffle(allQuestions);
  deck[2] = shuffle(allQuestions);
}
let allQuestions = [];

/* Pull the next question for a team, or null when its deck is empty. */
function drawQuestion(team) {
  return deck[team].length ? deck[team].shift() : null;
}

/* ---------- RENDER a question card ---------- */
function renderQuestion(team) {
  const q = current[team];
  const qBox = document.getElementById("quizQ" + team);
  const optBox = document.getElementById("quizOpts" + team);
  if (!qBox || !optBox) return;

  // team finished -> show its final score instead of a question
  if (!q) {
    qBox.innerHTML =
      '<div class="quiz-done">' +
        '<div class="quiz-done-score">' + score[team] + ' / ' + totalQuestions + '</div>' +
        '<div class="quiz-done-label">' + T("finishedLabel") + '</div>' +
      '</div>';
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
  if (!started || gameOver || done[team]) return;
  selected[team] = idx;
  const optBox = document.getElementById("quizOpts" + team);
  optBox.querySelectorAll(".quiz-opt").forEach((b) => {
    b.classList.toggle("selected", Number(b.dataset.idx) === idx);
  });
  setCheckReady(team, true);
}

// advance this team to its next question, or mark it finished
function nextQuestion(team) {
  const q = drawQuestion(team);
  current[team] = q;
  if (!q) {
    done[team] = true;
    renderQuestion(team);          // shows the final score panel
    checkAllDone();                // maybe the whole game is over now
    return;
  }
  renderQuestion(team);
}

/* ---------- CHECK (select an option, then press CHECK) ---------- */
function setCheckReady(team, ready) {
  const btn = document.getElementById("check" + team);
  if (btn) btn.classList.toggle("ready", !!ready && started && !gameOver && !done[team]);
}

function check(team) {
  if (!started || gameOver || done[team]) return;
  if (selected[team] === null) return;
  const q = current[team];
  if (!q) return;

  const optBox = document.getElementById("quizOpts" + team);
  const correct = selected[team] === q.correct;

  // this question is now consumed either way (asked once, no repeats)
  answered[team]++;

  if (correct) {
    const chosen = optBox.querySelector('.quiz-opt[data-idx="' + selected[team] + '"]');
    if (chosen) chosen.classList.add("correct");
    score[team]++;
    renderScores();                 // update the big center number
    fireTrigger(avatarVM[team], "correct"); sfx("correct");
    setCheckReady(team, false);
    setTimeout(() => { if (!gameOver) nextQuestion(team); }, 220);
  } else {
    // wrong: flash red, then still MOVE ON (each question is shown only once)
    const chosen = optBox.querySelector('.quiz-opt[data-idx="' + selected[team] + '"]');
    // also highlight the correct one briefly
    const right = optBox.querySelector('.quiz-opt[data-idx="' + q.correct + '"]');
    if (chosen) chosen.classList.add("wrong");
    if (right)  right.classList.add("correct");
    fireTrigger(avatarVM[team], "thinking"); sfx("wrong");
    setCheckReady(team, false);
    setTimeout(() => { if (!gameOver) nextQuestion(team); }, 600);
  }
}

/* ---------- SCORES ---------- */
function renderScores() {
  document.getElementById("score1").textContent = score[1];
  document.getElementById("score2").textContent = score[2];
}

// end the game once BOTH teams have finished all their questions
function checkAllDone() {
  if (!gameOver && done[1] && done[2]) decideWinner();
}

/* ---------- LOAD SHARED RIVE (avatars, timer) — NO stars ---------- */
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

/* ---------- TIMER ---------- */
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
      if (secondsLeft <= 0) { clearInterval(timerId); decideWinner(); }
    } catch (e) { console.error("timer tick error:", e); }
  }, 1000);
}

/* ---------- DECIDE WINNER / END GAME ---------- */
let lastWinner = null;
function decideWinner() {
  if (gameOver) return;
  let winner;
  if (score[1] > score[2]) winner = 1;
  else if (score[2] > score[1]) winner = 2;
  else winner = 0;   // draw
  endGame(winner);
}

function endGame(winner) {
  if (gameOver) return;
  gameOver = true;
  lastWinner = winner;
  if (timerId) clearInterval(timerId);
  sfxStopBg();
  if (winner === 1 || winner === 2) { fireTrigger(avatarVM[winner], "winner"); sfx("win"); }
  setCheckReady(1, false); setCheckReady(2, false);
  // make sure each team's final score panel is shown
  if (!current[1]) renderQuestion(1);
  if (!current[2]) renderQuestion(2);
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

/* ---------- INPUT HELPER ---------- */
function addPress(el, handler) {
  let firedByPointer = false;
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); firedByPointer = true; handler(); });
  el.addEventListener("click", () => { if (firedByPointer) { firedByPointer = false; return; } handler(); });
}

/* ---------- LANGUAGE CHANGE ---------- */
document.addEventListener("languagechange", () => {
  // re-render the finished panels (their labels are translated) + the result
  if (done[1]) renderQuestion(1);
  if (done[2]) renderQuestion(2);
  if (gameOver) showResult();
});

/* ---------- COUNTDOWN & START ---------- */
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
  nextQuestion(1);
  nextQuestion(2);

  // If the browser blocked autoplay (no user gesture yet), start the music on
  // the first tap/click so sound is reliably on during the game.
  const kick = () => {
    if (started && !gameOver) sfxStartBg();
    window.removeEventListener("pointerdown", kick);
  };
  window.addEventListener("pointerdown", kick, { once: true });
}

/* ---------- SOUND TOGGLE ---------- */
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

  addPress(document.getElementById("check1"), () => check(1));
  addPress(document.getElementById("check2"), () => check(2));

  // Browsers keep the AudioContext suspended until a user gesture. Resume it
  // on the first tap/key/touch, and (re)start the background track if the game
  // has already begun — so sound reliably comes on as soon as the user acts.
  const unlockAudio = () => {
    try {
      Sfx.resume();
      if (soundOn() && started && !gameOver) Sfx.startBg();
    } catch (e) {}
  };
  ["pointerdown", "touchstart", "keydown"].forEach((ev) =>
    window.addEventListener(ev, unlockAudio, { passive: true })
  );

  loadSharedRive();
  renderScores();

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

  totalQuestions = allQuestions.length;
  dealDecks();
  runCountdown();
}

function showLoadError() {
  [1, 2].forEach((t) => {
    const qBox = document.getElementById("quizQ" + t);
    if (qBox) qBox.textContent = T("needQuestions");
  });
  const overlay = document.getElementById("countdown");
  if (overlay) overlay.classList.add("hide");
}

boot();