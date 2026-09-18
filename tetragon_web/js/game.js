/* =====================================================
   TETRAGON — TWO-TEAM MATH BATTLE
   ===================================================== */

/* ---------- SOUND ENGINE (MUST BE AT THE VERY TOP) ---------- */
window.Sound = (() => {
  const FILES = {
    count:   "assets/sounds/count.mp3",
    start:   "assets/sounds/start.mp3",
    bg:      "assets/sounds/bg.mp3",
    tick:    "assets/sounds/tick.mp3",
    correct: "assets/sounds/correct.mp3",
    wrong:   "assets/sounds/wrong.mp3",
    star:    "assets/sounds/star.mp3",
    win:     "assets/sounds/win.mp3",
  };

  const VOLUME = {
    count: 0.9, start: 1.0, bg: 0.35, tick: 0.7,
    correct: 0.9, wrong: 0.8, star: 1.0, win: 1.0,
  };

  const audioCache = {};
  let bgAudio = null;
  let unlocked = false;

  // Pre-instantiate audio elements
  for (const key in FILES) {
    const audio = new Audio(FILES[key]);
    audio.preload = "auto";
    audio.volume = VOLUME[key] ?? 1.0;

    if (key === "bg") {
      audio.loop = true;      // background music loops until we pause it
      bgAudio = audio;
    } else {
      audioCache[key] = audio;
    }
  }

  // Safe playback function
  function play(key) {
    if (!FILES[key]) return;
    try {
      if (key === "bg") {
        startBg();
        return;
      }
      const base = audioCache[key];
      if (!base) return;

      // Clone audio node to allow overlapping rapid SFX plays
      const clone = base.cloneNode();
      clone.volume = base.volume;
      const playPromise = clone.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay was prevented or audio failed to load
        });
      }
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  function startBg() {
    if (!bgAudio) return;
    try {
      bgAudio.currentTime = 0;
      const playPromise = bgAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch (e) {}
  }

  function stopBg() {
    if (!bgAudio) return;
    try {
      bgAudio.pause();
    } catch (e) {}
  }

  // Explicit user gesture handler to unlock audio context.
  // NOTE: we only warm up the one-shot effect sounds here — NOT bgAudio.
  // Touching bgAudio would pause the music right after it starts
  // (e.g. on the first numpad tap).
  function unlock() {
    if (unlocked) return;
    unlocked = true;

    const all = Object.values(audioCache);   // effects only — never touch bgAudio
    all.forEach((a) => {
      if (!a) return;
      a.muted = true;
      const p = a.play();
      if (p !== undefined) {
        p.then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        }).catch(() => {
          a.muted = false;
        });
      }
    });

    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  }

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });

  return { play, startBg, stopBg, unlock };
})();

/* ---------- SAFE SOUND WRAPPERS ---------- */
function sfx(name) {
  try { if (window.Sound && window.Sound.play) window.Sound.play(name); } catch (e) {}
}
function sfxStartBg() {
  try { if (window.Sound && window.Sound.startBg) window.Sound.startBg(); } catch (e) {}
}
function sfxStopBg() {
  try { if (window.Sound && window.Sound.stopBg) window.Sound.stopBg(); } catch (e) {}
}

/* ---------- SETTINGS ---------- */
const GAME_SECONDS   = 180;
const STARS_TO_WIN   = 5;
const LEAD_PER_STAR  = 5;
const MAX_INPUT_LEN  = 5;
const TICK_FROM      = 10;

const TEAM1_COLOR = 0xffff4b4c;
const TEAM2_COLOR = 0xff29c1f0;

/* ---------- URL PARAMS & GAME STATE ---------- */
const params = new URLSearchParams(location.search);
const difficulty = params.get("difficulty") || "easy";

let score = { 1: 0, 2: 0 };
let stars = { 1: 0, 2: 0 };
let maxLead = { 1: 0, 2: 0 };
let input = { 1: "", 2: "" };
let problem = { 1: null, 2: null };

let started = false;
let gameOver = false;
let secondsLeft = GAME_SECONDS;
let timerId = null;

let avatarVM = { 1: null, 2: null };
let starVM   = { 1: null, 2: null };

/* ---------- RIVE HELPERS ---------- */
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

/* ---------- LOAD RIVE ANIMATIONS ---------- */
[1, 2].forEach((team) => {
  const rv = new rive.Rive({
    src: "rive/avatar.riv",
    canvas: document.getElementById("avatar" + team),
    stateMachines: "State Machine 1",
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
    stateMachines: "State Machine 1",
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

const clock = new rive.Rive({
  src: "rive/clock.riv",
  canvas: document.getElementById("clock"),
  autoplay: true,
  layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
  onLoad: () => clock.resizeDrawingSurfaceToCanvas(),
  onLoadError: (e) => console.error("clock load error:", e),
});
window.addEventListener("resize", () => clock.resizeDrawingSurfaceToCanvas());

/* ---------- PROBLEM GENERATION ---------- */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeProblem() {
  let a, b, op, answer;

  if (difficulty === "easy") {
    a = randInt(2, 9); b = randInt(1, 9);
    op = Math.random() < 0.5 ? "+" : "-";
    if (op === "-" && b > a) [a, b] = [b, a];
    answer = op === "+" ? a + b : a - b;
  } else if (difficulty === "medium") {
    a = randInt(10, 50); b = randInt(10, 50);
    op = Math.random() < 0.5 ? "+" : "-";
    if (op === "-" && b > a) [a, b] = [b, a];
    answer = op === "+" ? a + b : a - b;
  } else {
    if (Math.random() < 0.5) {
      a = randInt(20, 99); b = randInt(10, 99);
      op = Math.random() < 0.5 ? "+" : "-";
      if (op === "-" && b > a) [a, b] = [b, a];
      answer = op === "+" ? a + b : a - b;
    } else {
      a = randInt(2, 9); b = randInt(2, 9);
      op = "×"; answer = a * b;
    }
  }

  return { text: `${a}${op}${b}=`, answer };
}

/* ---------- RENDER ---------- */
function render(team) {
  document.getElementById("eqText" + team).textContent = problem[team].text;
  document.getElementById("eqBox" + team).textContent = input[team];
  document.getElementById("display" + team).textContent = input[team];

  const chk = document.getElementById("check" + team);
  const hasInput = input[team] !== "" && input[team] !== "-";
  chk.classList.toggle("ready", hasInput && started && !gameOver);
}
function renderScores() {
  document.getElementById("score1").textContent = score[1];
  document.getElementById("score2").textContent = score[2];
}

function newProblem(team) {
  problem[team] = makeProblem();
  input[team] = "";
  render(team);
}

/* ---------- NUMPAD INPUT ---------- */
function pressDigit(team, d) {
  if (!started || gameOver) return;
  if (input[team].replace("-", "").length >= MAX_INPUT_LEN) return;
  input[team] += d;
  render(team);
}
function pressBack(team) {
  if (!started || gameOver) return;
  input[team] = input[team].slice(0, -1);
  render(team);
}
function pressMinus(team) {
  if (!started || gameOver) return;
  input[team] = input[team].startsWith("-") ? input[team].slice(1) : "-" + input[team];
  render(team);
}

function buildPad(team) {
  const pad = document.getElementById("pad" + team);
  const keys = ["1","2","3","back", "4","5","6","minus", "7","8","9","0"];

  keys.forEach((k) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key";

    if (k === "back") {
      btn.classList.add("back");
      const icon = document.createElement("img");
      icon.src = "assets/backspace.png";   // put your file at this path
      icon.alt = "Backspace";
      btn.appendChild(icon);
      btn.addEventListener("click", () => pressBack(team));
    } else if (k === "minus") {
      btn.classList.add("op");
      btn.textContent = "−";
      btn.addEventListener("click", () => pressMinus(team));
    } else {
      btn.textContent = k;
      btn.addEventListener("click", () => pressDigit(team, k));
    }
    pad.appendChild(btn);
  });
}

/* ---------- CHECK ANSWER ---------- */
function check(team) {
  if (!started || gameOver) return;
  if (input[team] === "" || input[team] === "-") return;

  const correct = Number(input[team]) === problem[team].answer;

  if (correct) {
    score[team]++;
    renderScores();

    const earned = updateStars();
    if (gameOver) return;

    if (earned.includes(team)) {
      fireTrigger(avatarVM[team], "star");
      sfx("star");
    } else {
      fireTrigger(avatarVM[team], "correct");
      sfx("correct");
    }

    newProblem(team);
  } else {
    fireTrigger(avatarVM[team], "thinking");
    sfx("wrong");
    input[team] = "";
    render(team);
  }
}

/* ---------- STARS LOGIC ---------- */
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
      if (secondsLeft <= 0) {
        clearInterval(timerId);
        onTimeUp();
      }
    } catch (e) {
      console.error("timer tick error:", e);
    }
  }, 1000);
}
function onTimeUp() {
  if (gameOver) return;
  if (score[1] > score[2]) endGame(1);
  else if (score[2] > score[1]) endGame(2);
  else endGame(0);
}

/* ---------- END GAME ---------- */
let lastWinner = null;

function endGame(winner) {
  if (gameOver) return;
  gameOver = true;
  lastWinner = winner;
  if (timerId) clearInterval(timerId);

  sfxStopBg();   // background music stops when the game finishes
  if (winner === 1 || winner === 2) {
    fireTrigger(avatarVM[winner], "winner");
    sfx("win");
  }

  render(1);
  render(2);

  showResult();
  document.getElementById("result").hidden = false;
  document.querySelector(".center").classList.add("has-result");
}

function showResult() {
  const el = document.getElementById("resultTitle");
  const getText = (k) => (window.getText ? window.getText(k) : k);
  if (lastWinner === 0) {
    el.textContent = getText("draw");
    el.className = "result-title";
  } else {
    const teamName = getText(lastWinner === 1 ? "team1" : "team2");
    el.textContent = teamName + " " + getText("wins");
    el.className = "result-title win-" + lastWinner;
  }
}

document.getElementById("resultBtn").addEventListener("click", () => {
  location.reload();
});

/* ---------- COUNTDOWN & START ---------- */
function restartPop(el) {
  try {
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  } catch (e) {}
}

function runCountdown() {
  const overlay = document.getElementById("countdown");
  const textEl = document.getElementById("countdownText");
  const getText = (k) => (window.getText ? window.getText(k) : "GO!");
  const steps = ["3", "2", "1", getText("go")];
  let i = 0;

  const show = () => {
    try {
      textEl.textContent = steps[i];
      const isGo = i === steps.length - 1;
      textEl.classList.toggle("go", isGo);
      restartPop(textEl);
      sfx(isGo ? "start" : "count");
    } catch (e) {
      console.error("countdown show error:", e);
    }
  };

  show();
  const id = setInterval(() => {
    i++;
    if (i < steps.length) {
      show();
    } else {
      clearInterval(id);
      overlay.classList.add("hide");
      beginGame();
    }
  }, 1000);
}

function beginGame() {
  if (started) return;
  started = true;
  sfxStartBg();   // background music starts and loops until endGame()
  startTimer();
  render(1);
  render(2);
}

/* ---------- BOOT (auto-start, no ▶ prompt) ---------- */
buildPad(1);
buildPad(2);
newProblem(1);
newProblem(2);
renderScores();

document.getElementById("check1").addEventListener("click", () => check(1));
document.getElementById("check2").addEventListener("click", () => check(2));

// Try to unlock audio immediately (works if the PLAY click carried over),
// then start the countdown right away — no play button.
if (window.Sound && window.Sound.unlock) window.Sound.unlock();
runCountdown();