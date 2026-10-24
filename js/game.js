/* =====================================================
   TETRAGON — TWO-TEAM BATTLE
   One shared engine, three game modes:
     - "operation"  -> calculator math battle  (game.html)
     - "time"       -> read the clock          (time.html)
     - "ruler"      -> show the answer on a ruler (ruler.html)
   Mode is chosen by the PAGE (body data-mode="...") or the ?game= URL param.
   The stars / avatars / timer / scoring / win logic is SHARED.
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

  // Respect the sound on/off preference saved on the mini-games page.
  function enabled() {
    try { return localStorage.getItem("tetragon_sound") !== "off"; }
    catch (e) { return true; }
  }

  for (const key in FILES) {
    const audio = new Audio(FILES[key]);
    audio.preload = "auto";
    audio.volume = VOLUME[key] ?? 1.0;

    if (key === "bg") {
      audio.loop = true;
      bgAudio = audio;
    } else {
      audioCache[key] = audio;
    }
  }

  function play(key) {
    if (!FILES[key] || !enabled()) return;
    try {
      if (key === "bg") { startBg(); return; }
      const base = audioCache[key];
      if (!base) return;
      const clone = base.cloneNode();
      clone.volume = base.volume;
      const p = clone.play();
      if (p !== undefined) p.catch(() => {});
    } catch (e) {
      console.warn("Audio play error:", e);
    }
  }

  function startBg() {
    if (!bgAudio || !enabled()) return;
    try {
      bgAudio.currentTime = 0;
      const p = bgAudio.play();
      if (p !== undefined) p.catch(() => {});
    } catch (e) {}
  }

  function stopBg() {
    if (!bgAudio) return;
    try { bgAudio.pause(); } catch (e) {}
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.values(audioCache).forEach((a) => {
      if (!a) return;
      a.muted = true;
      const p = a.play();
      if (p !== undefined) {
        p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
         .catch(() => { a.muted = false; });
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
function sfx(name)      { try { if (window.Sound) window.Sound.play(name); } catch (e) {} }
function sfxStartBg()   { try { if (window.Sound) window.Sound.startBg(); } catch (e) {} }
function sfxStopBg()    { try { if (window.Sound) window.Sound.stopBg(); } catch (e) {} }

/* ---------- SETTINGS ---------- */
const GAME_SECONDS   = 180;
const STARS_TO_WIN   = 5;
const LEAD_PER_STAR  = 5;
const MAX_INPUT_LEN  = 5;
const TICK_FROM      = 10;

const TEAM1_COLOR = 0xffff4b4c;
const TEAM2_COLOR = 0xff29c1f0;

/* TIME-mode: how many minutes off still counts as correct (0 = exact). */
const MINUTE_TOLERANCE = 0;

/* RULER-mode: the ruler has 13 marks -> answerChoice 0..12.
   value shown at a mark = answerChoice * step.
   Numbered "major" marks sit on EVEN choices; dashes on the odd ones.
   ---- EDIT THIS TABLE if your ruller.riv binds fields to other marks ----
   Each ViewModel number field is set to (choice * step) for its mark.     */
const MAX_CHOICE = 12;
const RULER_FIELDS = [
  { field: "firstNumber",   choice: 0  },  // always 0
  { field: "thirdNumber",   choice: 2  },
  { field: "fifthNumber",   choice: 4  },
  { field: "sixthNumber",   choice: 6  },
  { field: "eighthNumber",  choice: 8  },
  { field: "tenthNumber",   choice: 10 },
  { field: "twelfthNumber", choice: 12 },
];

// State-machine name inside your .riv files
const SM_NAME = "State Machine 1";

/* ---------- URL PARAMS & GAME STATE ---------- */
const params = new URLSearchParams(location.search);
const difficulty = params.get("difficulty") || "easy";

// Mode from the PAGE first (body data-mode), then the ?game= param.
const rawMode = document.body.dataset.mode || params.get("game") || "operation";
const MODE =
  rawMode === "time"      ? "time"      :
  rawMode === "ruler"     ? "ruler"     :
  rawMode === "column"    ? "column"    :
  rawMode === "fraction"  ? "fraction"  :
  rawMode === "perimeter" ? "perimeter" :
  rawMode === "sudoku"    ? "sudoku"    : "operation";

// tag <body> so CSS shows the right panel
document.body.classList.add(
  MODE === "time"      ? "game-time"      :
  MODE === "ruler"     ? "game-ruler"     :
  MODE === "column"    ? "game-column"    :
  MODE === "fraction"  ? "game-fraction"  :
  MODE === "perimeter" ? "game-perimeter" :
  MODE === "sudoku"    ? "game-sudoku"    : "game-operation"
);
// easy fractions use the pizza (fixed 6) with no +/- divisions control
if (MODE === "fraction" && difficulty === "easy") document.body.classList.add("frac-easy");

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

// TIME mode
let clockRive   = { 1: null, 2: null };
let clockInputs = { 1: null, 2: null };
let lockedReading = { 1: { h: 0, m: 0 }, 2: { h: 0, m: 0 } };

// RULER mode
let rulerRive   = { 1: null, 2: null };
let rulerInputs = { 1: null, 2: null }; // { answerChoice, answered, isDragging }
let rulerVM     = { 1: null, 2: null }; // ViewModel1 (number fields + unit)
let lockedChoice = { 1: 0, 2: 0 };      // answerChoice at last CHECK (gate)

// COLUMN mode (fill-in-the-blanks column addition)
let colEntered = { 1: [], 2: [] };      // entered digit per blank (parallel to problem.blanks)
let colActive  = { 1: 0, 2: 0 };        // index of the active blank box

// FRACTION mode (pizza / divisible circle)
let fracRive   = { 1: null, 2: null };
let fracInputs = { 1: null, 2: null };  // { "1/6_1": input, ..., "fraction": input }
let fracReady  = { 1: false, 2: false };
let fracDen    = { 1: 6, 2: 6 };        // current number of divisions (denominator)
let fracLock   = { 1: "", 2: "" };      // "den:filled" signature at last CHECK
let fracEasyBag  = { 1: [], 2: [] };    // shuffled bag of numerators so none repeats
let fracEasyLast = { 1: 0, 2: 0 };      // last numerator shown (avoid back-to-back repeat)

// PERIMETER / AREA mode (draggable rectangle)
let periRive   = { 1: null, 2: null };
let periInputs = { 1: null, 2: null };  // { width, height, answered }
let periReady  = { 1: false, 2: false };
let periLock   = { 1: "", 2: "" };      // "WxH" at last CHECK

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
function setString(vm, name, value) {
  if (!vm) return;
  try { const s = vm.string(name); if (s) s.value = value; }
  catch (e) { console.error("string", name, e); }
}

/* ---------- LOAD SHARED RIVE (avatars, stars, center timer) ---------- */
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

// sudoku has no stars — skip loading the star animation entirely there
if (MODE !== "sudoku") {
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
}

const timerRive = new rive.Rive({
  src: "rive/timer.riv",
  canvas: document.getElementById("clock"),
  autoplay: true,
  layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
  onLoad: () => timerRive.resizeDrawingSurfaceToCanvas(),
  onLoadError: (e) => console.error("timer load error:", e),
});
window.addEventListener("resize", () => timerRive.resizeDrawingSurfaceToCanvas());

/* ---------- LOAD INTERACTIVE CLOCK (time mode) ---------- */
function loadClock(team) {
  const rv = new rive.Rive({
    src: "rive/clock.riv",
    canvas: document.getElementById("clockFace" + team),
    stateMachines: SM_NAME,
    autoplay: true,
    layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
    onLoad: () => {
      rv.resizeDrawingSurfaceToCanvas();
      const list = rv.stateMachineInputs(SM_NAME) || [];
      const map = {};
      list.forEach((i) => { map[i.name] = i; });
      clockInputs[team] = map;
      initClock(team);
    },
    onLoadError: (e) => console.error("clock" + team + " load error:", e),
  });
  window.addEventListener("resize", () => rv.resizeDrawingSurfaceToCanvas());
  clockRive[team] = rv;
}
function readClock(team) {
  const map = clockInputs[team];
  if (!map) return { h: 0, m: 0 };
  const h = map.hours   ? Number(map.hours.value)   : 0;
  const m = map.minutes ? Number(map.minutes.value) : 0;
  return { h, m };
}
function initClock(team) {
  const map = clockInputs[team];
  if (map) {
    try {
      if (map.hours)   map.hours.value = 0;
      if (map.minutes) map.minutes.value = 0;
    } catch (e) {}
  }
  lockedReading[team] = { h: 0, m: 0 };
}

/* ---------- LOAD INTERACTIVE RULER (ruler mode) ----------
   Tries a couple of filename spellings so it loads whichever file you have. */
const RULER_SRCS = ["rive/ruller.riv", "rive/ruler.riv"];

function loadRuler(team) {
  let idx = 0;

  function attempt() {
    const rv = new rive.Rive({
      src: RULER_SRCS[idx],
      canvas: document.getElementById("rulerFace" + team),
      stateMachines: SM_NAME,
      autoplay: true,
      autoBind: true,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoad: () => {
        rv.resizeDrawingSurfaceToCanvas();
        const list = rv.stateMachineInputs(SM_NAME) || [];
        const map = {};
        list.forEach((i) => { map[i.name] = i; });
        rulerInputs[team] = map;
        rulerVM[team] = rv.viewModelInstance;
        lockedChoice[team] = readRulerChoice(team); // initial (0)
        applyRuler(team);                            // fill the numbers + unit
      },
      onLoadError: (e) => {
        console.error("ruler" + team + " load error for", RULER_SRCS[idx], e);
        idx++;
        if (idx < RULER_SRCS.length) {
          try { rv.cleanup && rv.cleanup(); } catch (_) {}
          attempt();                                 // try the next filename
        }
      },
    });
    rulerRive[team] = rv;
  }

  attempt();
  window.addEventListener("resize", () => {
    try { rulerRive[team] && rulerRive[team].resizeDrawingSurfaceToCanvas(); } catch (_) {}
  });
}
// where the marker currently sits (0..12)
function readRulerChoice(team) {
  const map = rulerInputs[team];
  if (!map || !map.answerChoice) return 0;
  return Math.round(Number(map.answerChoice.value));
}
// write the unit + the numbers shown at each major mark for the current problem
function applyRuler(team) {
  const vm = rulerVM[team];
  const p = problem[team];
  if (!vm || !p) return;
  setString(vm, "unit", getText("cmUnit"));
  RULER_FIELDS.forEach(({ field, choice }) => setNumber(vm, field, choice * p.step));
}

/* ---------- SMALL HELPERS ---------- */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pad(n) { return String(n).padStart(2, "0"); }
function mod720(x) { return ((x % 720) + 720) % 720; }
function normHour(h) { return ((Math.round(h) % 12) + 12) % 12; }
function minutesMatch(a, b) { return Math.abs(Math.round(a) - b) <= MINUTE_TOLERANCE; }
function readingKey(h, m) { return normHour(h) * 60 + (((Math.round(m) % 60) + 60) % 60); }
function readingsDiffer(a, b) { return readingKey(a.h, a.m) !== readingKey(b.h, b.m); }

/* ---------- PROBLEM GENERATION ---------- */
/* OPERATION (unchanged) */
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

/* TIME (start time, passed added, returned subtracted) */
function genDirect() {
  const h = randInt(1, 12);
  const m = [0, 30][randInt(0, 1)];
  return { kind: "direct", hours: h % 12, minutes: m, startText: `${h}:${pad(m)}`, terms: [] };
}
function genMedium() {
  const startH = randInt(1, 12);
  const startM = [0, 15, 30, 45][randInt(0, 3)];
  let passH = randInt(0, 2);
  let passM = [0, 15, 30][randInt(0, 2)];
  if (passH === 0 && passM === 0) passM = 30;
  const start = (startH % 12) * 60 + startM;
  const ans = mod720(start + (passH * 60 + passM));
  return {
    kind: "expr", hours: Math.floor(ans / 60), minutes: ans % 60,
    startText: `${startH}:${pad(startM)}`, passed: { h: passH, m: passM }, returned: null,
  };
}
function genHard() {
  const startH = randInt(1, 12);
  const startM = randInt(0, 59);
  const passH = randInt(1, 2);
  const passM = randInt(1, 59);
  const retM  = randInt(5, 55);
  const start = (startH % 12) * 60 + startM;
  const ans = mod720(start + (passH * 60 + passM) - retM);
  return {
    kind: "expr", hours: Math.floor(ans / 60), minutes: ans % 60,
    startText: `${startH}:${pad(startM)}`,
    passed: { h: passH, m: passM }, returned: { h: 0, m: retM },
  };
}
function genTimeProblem() {
  if (difficulty === "easy")   return genDirect();
  if (difficulty === "medium") return genMedium();
  return genHard();
}
function makeTimeProblem(team) {
  const cur = readClock(team);
  const curKey = readingKey(cur.h, cur.m);
  let p, guard = 0;
  do { p = genTimeProblem(); guard++; }
  while (readingKey(p.hours, p.minutes) === curKey && guard < 60);
  return p;
}

/* RULER: "a cm + b cm", answer lands on a mark. answerChoice = answer / step */
function genRuler(currentChoice) {
  const step = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 6;
  let target, guard = 0;
  do { target = randInt(2, MAX_CHOICE); guard++; }
  while (target === currentChoice && guard < 40);       // must differ from current
  const aTicks = randInt(1, target - 1);
  const bTicks = target - aTicks;
  return { kind: "ruler", step, a: aTicks * step, b: bTicks * step, answerChoice: target };
}

/* ---------- QUESTION RENDERING (time mode) ---------- */
function ruPlural(n, one, few, many) {
  const d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return few;
  return many;
}
function unitWord(kind, n) {
  const lang = (window.getLang && window.getLang()) || "en";
  const K = kind === "h" ? ["hourOne", "hourFew", "hourMany"] : ["minOne", "minFew", "minMany"];
  if (lang === "ru") return ruPlural(n, getText(K[0]), getText(K[1]), getText(K[2]));
  if (lang === "en") return getText(n === 1 ? K[0] : K[2]);
  return getText(K[0]);
}
function amountWords(h, m) {
  const parts = [];
  if (h) parts.push(h + " " + unitWord("h", h));
  if (m) parts.push(m + " " + unitWord("m", m));
  return parts.join(" ");
}
function fillTpl(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ""));
}
function questionHTML(p) {
  if (!p) return "";
  const line1 =
    `<span class="clock-line">${getText("showTime")} ` +
    `<span class="clock-target">${p.startText}</span>.</span>`;
  if (p.kind === "direct") return line1;
  const amt = (o) => `<span class="clock-amt">${amountWords(o.h, o.m)}</span>`;
  const cond = p.returned
    ? fillTpl(getText("qPassedReturned"), { passed: amt(p.passed), returned: amt(p.returned) })
    : fillTpl(getText("qPassedOnly"), { passed: amt(p.passed) });
  return line1 + `<span class="clock-line clock-cond">${cond}</span>`;
}
function renderQuestion(team) {
  const box = document.getElementById("clockQ" + team);
  if (box) box.innerHTML = questionHTML(problem[team]);
}

/* ---------- QUESTION RENDERING (ruler mode) ---------- */
//   Show the answer on the ruler:
//   12 cm + 12 cm
function rulerQuestionHTML(p) {
  if (!p) return "";
  const cm = getText("cmUnit");
  return `<span class="clock-line">${getText("showOnRuler")}:</span>` +
         `<span class="clock-line">` +
           `<span class="clock-amt">${p.a} ${cm}</span> + ` +
           `<span class="clock-amt">${p.b} ${cm}</span>` +
         `</span>`;
}
function renderRulerQuestion(team) {
  const box = document.getElementById("rulerQ" + team);
  if (box) box.innerHTML = rulerQuestionHTML(problem[team]);
}

/* ---------- COLUMN mode (fill-in-the-blanks column addition) ---------- */
function padRow(digits, len) {
  return Array(len - digits.length).fill(null).concat(digits);
}
function pickBlanks(cells, k) {
  const a = cells.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}
// Read a row's number for a given assignment of the blanks.
// Returns { value, leadingZero } — leadingZero flags an invalid number like "07".
function rowNumberFor(rows, blanks, assign, ri) {
  let s = "";
  rows[ri].forEach((v, ci) => {
    if (v === null) return;                 // right-aligned pad -> not a digit
    const bi = blanks.findIndex((b) => b.row === ri && b.col === ci);
    s += bi >= 0 ? assign[bi] : v;
  });
  return { value: parseInt(s, 10), leadingZero: s.length > 1 && s[0] === "0" };
}
// How many digit fills of `blanks` make row0 + row1 === row2 (no leading zeros).
// Returns early once it finds more than one (that's all we need to know).
function columnSolutionCount(rows, blanks) {
  const n = blanks.length;
  const total = Math.pow(10, n);
  const assign = new Array(n).fill(0);
  let count = 0;
  for (let m = 0; m < total; m++) {
    let x = m;
    for (let i = 0; i < n; i++) { assign[i] = x % 10; x = Math.floor(x / 10); }
    const r0 = rowNumberFor(rows, blanks, assign, 0);
    const r1 = rowNumberFor(rows, blanks, assign, 1);
    const r2 = rowNumberFor(rows, blanks, assign, 2);
    if (r0.leadingZero || r1.leadingZero || r2.leadingZero) continue;
    if (r0.value + r1.value === r2.value) { count++; if (count > 1) return count; }
  }
  return count;
}

// Pick up to k blanks with AT MOST ONE per column (never two boxes in one column).
function pickBlanksOnePerColumn(rows, maxLen, k) {
  const cols = [];
  for (let ci = 0; ci < maxLen; ci++) {
    const inCol = [];
    rows.forEach((r, ri) => { if (r[ci] !== null) inCol.push({ row: ri, col: ci }); });
    if (inCol.length) cols.push(inCol);
  }
  for (let i = cols.length - 1; i > 0; i--) {          // shuffle the columns
    const j = Math.floor(Math.random() * (i + 1));
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  return cols.slice(0, Math.min(k, cols.length))
             .map((inCol) => inCol[Math.floor(Math.random() * inCol.length)]);
}

// a valid addition a + b = c, laid out right-aligned, with some cells blanked
// (blanks are chosen so the puzzle has EXACTLY ONE correct answer)
function genColumn() {
  let a, b;
  if (difficulty === "easy")        { a = randInt(10, 44);  b = randInt(10, 44); }
  else if (difficulty === "medium") { a = randInt(10, 89);  b = randInt(10, 89); }
  else { a = randInt(100, 800); b = randInt(100, 999 - a); } // hard: 3-digit + 3-digit, 3-digit sum
  const c = a + b;
  const ds = String(c).split("").map(Number);
  const maxLen = ds.length;                       // sum is the widest row
  const rows = [
    padRow(String(a).split("").map(Number), maxLen),
    padRow(String(b).split("").map(Number), maxLen),
    padRow(ds, maxLen),
  ];
  const nBlanks = difficulty === "easy" ? 2 : 3;

  // try blank sets (one blank per column) until one yields a UNIQUE solution
  let blanks = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const cand = pickBlanksOnePerColumn(rows, maxLen, nBlanks);
    if (cand.length && columnSolutionCount(rows, cand) === 1) { blanks = cand; break; }
  }
  // fallback: blank sum cells (one per column, and unique since the sum is fixed)
  if (!blanks) {
    const sumCells = [];
    for (let ci = 0; ci < maxLen; ci++) if (rows[2][ci] !== null) sumCells.push({ row: 2, col: ci });
    for (let i = sumCells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sumCells[i], sumCells[j]] = [sumCells[j], sumCells[i]];
    }
    blanks = sumCells.slice(0, Math.min(nBlanks, sumCells.length));
  }

  blanks.sort((p, q) => p.row - q.row || p.col - q.col); // fill order: top-left first
  return { kind: "column", rows, maxLen, blanks };
}
function newColumnProblem(team) {
  problem[team] = genColumn();
  colEntered[team] = problem[team].blanks.map(() => "");
  colActive[team] = 0;
  renderColumn(team);
  setCheckReady(team, false);
}
function renderColumn(team) {
  const p = problem[team];
  const cont = document.getElementById("colProblem" + team);
  if (!p || !cont) return;
  const cols = p.maxLen + 1; // +1 for the sign column on the left
  let html = `<div class="col-grid" style="grid-template-columns:repeat(${cols}, minmax(0,1fr))">`;
  p.rows.forEach((row, ri) => {
    html += `<span class="col-cell col-sign">${ri === 1 ? "+" : ""}</span>`;
    row.forEach((v, ci) => {
      if (v === null) { html += `<span class="col-cell"></span>`; return; }
      const bi = p.blanks.findIndex((b) => b.row === ri && b.col === ci);
      if (bi >= 0) {
        const val = colEntered[team][bi] || "";
        const isActive = colActive[team] === bi;
        const active = isActive ? " col-box--active" : "";
        // blinking cursor inside the active box while it's empty
        const inner = val || (isActive ? '<span class="col-caret"></span>' : "");
        html += `<span class="col-cell col-box${active}" data-bi="${bi}">${inner}</span>`;
      } else {
        html += `<span class="col-cell col-digit">${v}</span>`;
      }
    });
    if (ri === 1) html += `<span class="col-line" style="grid-column:1 / -1"></span>`;
  });
  html += `</div>`;
  cont.innerHTML = html;

  const allFilled = colEntered[team].every((x) => x !== "");
  setCheckReady(team, allFilled && started && !gameOver);
}
function colPressDigit(team, d) {
  const p = problem[team];
  const bi = colActive[team];
  if (!p || bi == null || bi < 0) return;
  colEntered[team][bi] = String(d);
  // jump to the next still-empty blank, if any
  const n = p.blanks.length;
  for (let k = 1; k <= n; k++) {
    const idx = (bi + k) % n;
    if (colEntered[team][idx] === "") { colActive[team] = idx; break; }
  }
  renderColumn(team);
}
function colPressBack(team) {
  const bi = colActive[team];
  if (bi == null || bi < 0) return;
  if (colEntered[team][bi] !== "") colEntered[team][bi] = "";
  else if (bi > 0) { colActive[team] = bi - 1; colEntered[team][bi - 1] = ""; }
  renderColumn(team);
}
function checkColumn(team) {
  const p = problem[team];
  if (!colEntered[team].every((x) => x !== "")) return;
  const correct = p.blanks.every((b, i) => Number(colEntered[team][i]) === p.rows[b.row][b.col]);
  if (correct) {
    const over = rewardCorrect(team);
    if (over || gameOver) return;
    newColumnProblem(team);
  } else {
    rewardWrong(team);
    colEntered[team] = p.blanks.map(() => "");
    colActive[team] = 0;
    renderColumn(team);
  }
}
// tapping a blank box selects it (delegation set once per team)
function setupColumnTaps(team) {
  const cont = document.getElementById("colProblem" + team);
  if (!cont) return;
  cont.addEventListener("pointerdown", (e) => {
    const box = e.target.closest(".col-box");
    if (!box) return;
    e.preventDefault();
    colActive[team] = Number(box.dataset.bi);
    renderColumn(team);
  });
}

/* ---------- FRACTION mode (pizza / divisible circle) ---------- */
/* ---------- SUDOKU mode (cross-number crossword: fill the blank cells) ----------
   Interlocking equations sharing cells; the player types digits into the blue
   boxes. Score = number of satisfied equations; fill them all first -> win.
   There are TWO fixed structures (SDK_T1 / SDK_T2) below; each game picks one
   at random and fills it with fresh numbers so every equation holds.
   A fully-filled but incorrect equation lights its whole row/column red.      */
let sdkPrevCorrect = { 1: 0, 2: 0 };   // last-known correct count (drives the avatar reaction only)
const SDK_MAX = 99;            // every cell stays a 2-digit number (1..99)

/* Each game picks one of these fixed structures at random and fills it with
   fresh numbers; every equation holds by construction.
   A template = { rows, cols, pos(idx->[r,c]), ops("r,c"->glyph),
                  eqs(terms==r), box(typed cells), gen()->solution[] }.       */

// TEMPLATE 1 — the sprawling cross-number puzzle
const SDK_T1 = {
  rows: 11, cols: 9,
  pos: { 0:[0,6],1:[2,6],2:[4,6],3:[4,4],4:[4,8],5:[6,4],6:[8,4],7:[6,0],8:[6,2],9:[6,6],10:[8,6],11:[8,8],12:[10,6] },
  ops: { "1,6":"+","3,6":"=","4,5":"×","4,7":"=","5,4":"+","7,4":"=","6,1":"÷","6,3":"=","8,5":"+","8,7":"=","7,6":"−","9,6":"=" },
  eqs: [ {t:[0,"+",1],r:2}, {t:[3,"×",2],r:4}, {t:[3,"+",5],r:6}, {t:[7,"÷",8],r:5}, {t:[6,"+",10],r:11}, {t:[9,"−",10],r:12} ],
  box: [2, 4, 5, 8, 11, 12],
  gen: function () {
    const R = difficulty === "hard"   ? { ab:[6,14], mul:[2,4], quo:[5,11], div:[3,10], sub:[5,22], big:[60,99] }
            :                           { ab:[3,10], mul:[2,4], quo:[2,8],  div:[2,8],  sub:[2,10], big:[30,80] };
    let sol;
    do {
      const v0=randInt(...R.ab), v1=randInt(...R.ab), v2=v0+v1;
      const v3=randInt(...R.mul), v4=v3*v2;
      const v5=randInt(...R.quo), v6=v3+v5;
      const v8=randInt(...R.div), v7=v8*v5;
      const v10=randInt(...R.sub), v11=v6+v10;
      const v9=randInt(...R.big), v12=v9-v10;
      sol=[v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12];
    } while (sol.some((v) => v < 1 || v > SDK_MAX));
    return sol;
  },
};

// TEMPLATE 2 — the 3x3 grid: every row AND column is a 3-term equation
//   A ÷ B − C = D        cols:  A + E × J = N
//   E × F − G = I               B × F + K = O
//   J + K + L = M               C × G + L = P
const SDK_T2 = {
  rows: 7, cols: 7,
  pos: { 0:[0,0],1:[0,2],2:[0,4],3:[2,0],4:[2,2],5:[2,4],6:[4,0],7:[4,2],8:[4,4],9:[0,6],10:[2,6],11:[4,6],12:[6,0],13:[6,2],14:[6,4] },
  ops: { "0,1":"÷","0,3":"−","0,5":"=","2,1":"×","2,3":"−","2,5":"=","4,1":"+","4,3":"+","4,5":"=",
         "1,0":"+","3,0":"×","5,0":"=","1,2":"×","3,2":"+","5,2":"=","1,4":"×","3,4":"+","5,4":"=" },
  eqs: [ {t:[0,"÷",1,"−",2],r:9}, {t:[3,"×",4,"−",5],r:10}, {t:[6,"+",7,"+",8],r:11},
         {t:[0,"+",3,"×",6],r:12}, {t:[1,"×",4,"+",7],r:13}, {t:[2,"×",5,"+",8],r:14} ],
  box: [4, 6, 9, 11, 12, 14],
  gen: function () {
    const R = difficulty === "hard"   ? { b:[2,5], qa:[4,9], e:[3,6], f:[2,4], g:9, j:[2,3], kl:[4,18] }
            :                           { b:[1,4], qa:[2,7], e:[2,5], f:[2,4], g:8, j:[1,3], kl:[1,12] };
    let sol;
    do {
      const B=randInt(...R.b), qA=randInt(...R.qa), A=B*qA, C=randInt(1, Math.max(1, qA-1)), D=qA-C;
      const E=randInt(...R.e), F=randInt(...R.f), EF=E*F, G=randInt(1, Math.max(1, Math.min(EF-1, R.g))), I=EF-G;
      const J=randInt(...R.j), K=randInt(...R.kl), L=randInt(...R.kl), M=J+K+L;
      const N=A+(E*J), O=(B*F)+K, P=(C*G)+L;   // ×/÷ before +/− (real math order)
      sol=[A,B,C,E,F,G,J,K,L,D,I,M,N,O,P];
    } while (sol.some((v) => v < 1 || v > SDK_MAX));
    return sol;
  },
};

// EASY TEMPLATE A — an L of + / − equations, single-digit numbers only
//   A + B = C ; A − D = E ; E + F = G   (all cells 1..9)
const SDK_E1 = {
  rows: 5, cols: 5,
  pos: { 0:[0,0],1:[0,2],2:[0,4],3:[2,0],4:[4,0],5:[4,2],6:[4,4] },
  ops: { "0,1":"+","0,3":"=","1,0":"−","3,0":"=","4,1":"+","4,3":"=" },
  eqs: [ {t:[0,"+",1],r:2}, {t:[0,"−",3],r:4}, {t:[4,"+",5],r:6} ],
  box: [2, 4, 6],
  gen: function () {
    let sol;
    do {
      const A=randInt(2,8), B=randInt(1,9-A), C=A+B;
      const D=randInt(1,A-1), E=A-D;
      const F=randInt(1,9-E), G=E+F;
      sol=[A,B,C,D,E,F,G];
    } while (sol.some((v) => v < 1 || v > 9));
    return sol;
  },
};

// EASY TEMPLATE B — a plus with a tail, + / − , single-digit numbers only
//   A + C = E ; B + C = D ; E − G = H
const SDK_E2 = {
  rows: 9, cols: 5,
  pos: { 0:[0,2],1:[2,0],2:[2,2],3:[2,4],4:[4,2],5:[6,2],6:[8,2] },
  ops: { "1,2":"+","3,2":"=","2,1":"+","2,3":"=","5,2":"−","7,2":"=" },
  eqs: [ {t:[0,"+",2],r:4}, {t:[1,"+",2],r:3}, {t:[4,"−",5],r:6} ],
  box: [3, 4, 6],
  gen: function () {
    let sol;
    do {
      const C=randInt(1,7), A=randInt(1,9-C), E=A+C, B=randInt(1,9-C), D=B+C;
      const G=randInt(1,Math.max(1,E-1)), H=E-G;
      sol=[A,B,C,D,E,G,H];
    } while (sol.some((v) => v < 1 || v > 9));
    return sol;
  },
};

// pools by difficulty: easy = + / − single-digit; medium & hard = the ×/÷ structures
const SDK_EASY_TEMPLATES = [SDK_E1, SDK_E2];
const SDK_TEMPLATES = [SDK_T1, SDK_T2];
// precompute reverse lookup "row,col" -> value-cell index for every template
[...SDK_EASY_TEMPLATES, ...SDK_TEMPLATES].forEach((t) => {
  t.cellIdx = {};
  Object.keys(t.pos).forEach((i) => { const [r, c] = t.pos[i]; t.cellIdx[r + "," + c] = Number(i); });
});

function genSudoku() {
  const pool = difficulty === "easy" ? SDK_EASY_TEMPLATES : SDK_TEMPLATES;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  const sol = tpl.gen();
  const given = sol.map((_, i) => !tpl.box.includes(i));
  const entered = sol.map((v, i) => (given[i] ? String(v) : ""));
  return { kind: "sudoku", tpl, sol, given, entered, blanks: tpl.box.slice(), active: tpl.box[0] };
}
function newSudokuProblem(team) {
  problem[team] = genSudoku();
  sdkPrevCorrect[team] = 0;
  renderSudoku(team);
}
function sdkVal(team, i) { const t = problem[team].entered[i]; return t === "" ? null : Number(t); }

// evaluate a term list with real operator precedence (× and ÷ before + and −);
// returns the number, or null if a cell is blank or a division isn't whole
function sdkEvalTerms(team, terms) {
  let acc = 0;          // running total of completed additive terms
  let cur = sdkVal(team, terms[0]);   // current × / ÷ chain
  if (cur === null) return null;
  let sign = 1;         // sign to apply to `cur` when it is flushed
  for (let i = 1; i < terms.length; i += 2) {
    const op = terms[i], v = sdkVal(team, terms[i + 1]);
    if (v === null) return null;
    if (op === "×") { cur *= v; }
    else if (op === "÷") { if (v === 0 || cur % v !== 0) return null; cur /= v; }
    else { acc += sign * cur; cur = v; sign = (op === "−") ? -1 : 1; }  // + or −
  }
  acc += sign * cur;
  return acc;
}

// is grid position (r,c) an occupied cell (value OR operator) in this template?
function sdkOccupied(tpl, r, c) {
  return tpl.cellIdx[r + "," + c] !== undefined || tpl.ops[r + "," + c] !== undefined;
}
// round a corner only where the cell is on the OUTER edge of the shape, so a
// run of cells reads as one connected bar with rounded ends.
function sdkRadius(tpl, r, c) {
  const up = sdkOccupied(tpl, r - 1, c), dn = sdkOccupied(tpl, r + 1, c);
  const lf = sdkOccupied(tpl, r, c - 1), rt = sdkOccupied(tpl, r, c + 1);
  const tl = (!up && !lf) ? "var(--r)" : "0";
  const tr = (!up && !rt) ? "var(--r)" : "0";
  const br = (!dn && !rt) ? "var(--r)" : "0";
  const bl = (!dn && !lf) ? "var(--r)" : "0";
  return `border-radius:${tl} ${tr} ${br} ${bl}`;
}

// every grid position ("r,c") an equation spans — its value cells AND the
// operators between them (each equation is a straight horizontal/vertical run)
function sdkEqPositions(tpl, cellIdxs) {
  const ps = cellIdxs.map((i) => tpl.pos[i]);
  const rows = ps.map((p) => p[0]), cols = ps.map((p) => p[1]);
  const out = [];
  if (rows.every((r) => r === rows[0])) {                 // horizontal
    const r = rows[0], a = Math.min(...cols), b = Math.max(...cols);
    for (let c = a; c <= b; c++) out.push(r + "," + c);
  } else {                                                // vertical
    const c = cols[0], a = Math.min(...rows), b = Math.max(...rows);
    for (let r = a; r <= b; r++) out.push(r + "," + c);
  }
  return out;
}
// grid positions of any equation that is FULLY filled but wrong -> highlight red
function sdkWrongPositions(team) {
  const p = problem[team], tpl = p.tpl, wrong = new Set();
  tpl.eqs.forEach((e) => {
    const cells = e.t.filter((_, i) => i % 2 === 0).concat(e.r);
    if (cells.every((i) => p.entered[i] !== "")) {
      const lhs = sdkEvalTerms(team, e.t), rv = sdkVal(team, e.r);
      if (!(lhs !== null && rv !== null && lhs === rv)) sdkEqPositions(tpl, cells).forEach((k) => wrong.add(k));
    }
  });
  return wrong;
}

function renderSudoku(team) {
  const p = problem[team];
  const cont = document.getElementById("sudokuGrid" + team);
  if (!p || !cont) return;
  const tpl = p.tpl;
  cont.style.gridTemplateColumns = "repeat(" + tpl.cols + ", auto)";
  const wrong = sdkWrongPositions(team);
  let html = "";
  for (let r = 0; r < tpl.rows; r++) {
    for (let c = 0; c < tpl.cols; c++) {
      const key = r + "," + c;
      const idx = tpl.cellIdx[key];
      const bad = wrong.has(key) ? " sdk-wrong" : "";
      const rad = sdkRadius(tpl, r, c);
      if (idx !== undefined) {                    // value cell
        if (p.given[idx]) {
          html += `<span class="sdk-cell sdk-given${bad}" style="${rad}">${p.entered[idx]}</span>`;
        } else {
          const val = p.entered[idx] || "";
          const isActive = p.active === idx;
          const inner = val || (isActive ? '<span class="col-caret"></span>' : "");
          html += `<span class="sdk-cell sdk-box${isActive ? " sdk-box--active" : ""}${bad}" style="${rad}" data-idx="${idx}">${inner}</span>`;
        }
      } else {                                    // operator cell, or empty hole
        const op = tpl.ops[key];
        html += op ? `<span class="sdk-cell sdk-op${bad}" style="${rad}">${op}</span>` : `<span class="sdk-gap"></span>`;
      }
    }
  }
  cont.innerHTML = html;
}
function sdkRescore(team) {
  // No stars, no score count — the only thing that matters is finishing FIRST.
  const tpl = problem[team].tpl;
  let correct = 0;
  tpl.eqs.forEach((e) => {
    const lhs = sdkEvalTerms(team, e.t), rv = sdkVal(team, e.r);
    if (lhs !== null && rv !== null && lhs === rv) correct++;
  });
  if (correct > sdkPrevCorrect[team]) { fireTrigger(avatarVM[team], "correct"); sfx("correct"); }
  sdkPrevCorrect[team] = correct;
  if (!gameOver && correct === tpl.eqs.length) endGame(team);   // finished the whole puzzle first -> win
}
function sdkPressDigit(team, d) {
  const p = problem[team];
  const i = p.active;
  if (i == null || i < 0 || p.given[i]) return;
  if (p.entered[i].length >= 2) return;   // 2-digit max
  p.entered[i] += String(d);
  renderSudoku(team); sdkRescore(team);
}
function sdkPressBack(team) {
  const p = problem[team];
  const i = p.active;
  if (i == null || i < 0 || p.given[i]) return;
  if (p.entered[i] !== "") p.entered[i] = p.entered[i].slice(0, -1);
  renderSudoku(team); sdkRescore(team);
}
function setupSudokuTaps(team) {
  const cont = document.getElementById("sudokuGrid" + team);
  if (!cont) return;
  cont.addEventListener("pointerdown", (e) => {
    const box = e.target.closest(".sdk-box");
    if (!box) return;
    e.preventDefault();
    problem[team].active = Number(box.dataset.idx);
    renderSudoku(team);
  });
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function reduceFrac(n, d) { const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; }

// easy: next base numerator (1..5 over 6) with no repeats — cycle all 5, shuffled,
// and never the same value twice in a row
function nextEasyNumerator(team) {
  if (fracEasyBag[team].length === 0) {
    let bag;
    do {
      bag = [1, 2, 3, 4, 5];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    } while (bag[bag.length - 1] === fracEasyLast[team]);   // first drawn != previous
    fracEasyBag[team] = bag;
  }
  const n = fracEasyBag[team].pop();
  fracEasyLast[team] = n;
  return n;
}

// a fraction problem — answer stored as a reduced value answerNum/answerDen
function genFraction(team) {
  if (difficulty === "easy") {
    const n = nextEasyNumerator(team);       // value n/6, no repeats
    const f = randInt(1, 6);                 // show a random EQUIVALENT (e.g. 2/6 -> 12/36)
    const dn = n * f, dd = 6 * f;
    return { kind: "fraction", easy: true, answerNum: dn, answerDen: dd,
             prompt: "showNumber", fracs: [{ n: dn, d: dd }], op: null };
  }
  const set = difficulty === "medium" ? [2, 3, 6] : [4, 5, 6];
  const C = set[randInt(0, set.length - 1)];
  const t = randInt(2, C);              // total numerator over C -> value t/C (<= 1)
  const k = randInt(1, t - 1);          // split into two positive parts
  const f1 = reduceFrac(k, C);
  const f2 = reduceFrac(t - k, C);
  const ans = reduceFrac(t, C);
  return { kind: "fraction", easy: false, answerNum: ans.n, answerDen: ans.d,
           prompt: "showAnswer", fracs: [{ n: f1.n, d: f1.d }, { n: f2.n, d: f2.d }], op: "+" };
}

// ----- Rive input helpers -----
function fracInput(team, name) { const m = fracInputs[team]; return m ? m[name] : null; }
function fracGetBool(team, name) { const i = fracInput(team, name); return i ? !!i.value : false; }
function fracSetBool(team, name, v) { const i = fracInput(team, name); if (i) { try { i.value = v; } catch (e) {} } }
function fracSetDenInput(team, d) { const i = fracInput(team, "fraction"); if (i) { try { i.value = d; } catch (e) {} } }

// clear every slice boolean (all denominators), so switching divisions starts empty
function fracClearSlices(team) {
  for (let d = 2; d <= 6; d++) for (let i = 1; i <= d; i++) fracSetBool(team, `1/${d}_${i}`, false);
}
// how many slices are filled for the CURRENT denominator
function fracFilled(team) {
  const d = fracDen[team];
  let c = 0;
  for (let i = 1; i <= d; i++) if (fracGetBool(team, `1/${d}_${i}`)) c++;
  return c;
}

function loadFraction(team) {
  const src = difficulty === "easy" ? "rive/pizza.riv" : "rive/fraction.riv";
  const rv = new rive.Rive({
    src: src,
    canvas: document.getElementById("fracCircle" + team),
    stateMachines: SM_NAME,
    autoplay: true,
    layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
    onLoad: () => {
      rv.resizeDrawingSurfaceToCanvas();
      const list = rv.stateMachineInputs(SM_NAME) || [];
      const map = {};
      list.forEach((i) => { map[i.name] = i; });
      fracInputs[team] = map;
      fracReady[team] = true;
      fracSetDenInput(team, fracDen[team]);   // set divisions (fraction.riv)
      fracClearSlices(team);                   // start empty
      fracLock[team] = fracDen[team] + ":0";
      updateFracControls(team);
    },
    onLoadError: (e) => console.error("fraction" + team + " load error for", src, e),
  });
  window.addEventListener("resize", () => { try { rv.resizeDrawingSurfaceToCanvas(); } catch (_) {} });
  fracRive[team] = rv;
}

// +/- buttons change the number of divisions (2..6); easy is fixed at 6
function fracChangeDen(team, delta) {
  if (difficulty === "easy") return;
  const d = Math.max(1, Math.min(6, fracDen[team] + delta));
  if (d === fracDen[team]) return;
  fracDen[team] = d;
  fracSetDenInput(team, d);
  fracClearSlices(team);              // reset fills for the new circle
  fracLock[team] = d + ":0";
  setCheckReady(team, false);
  updateFracControls(team);
}
function updateFracControls(team) {
  const el = document.getElementById("fracDen" + team);
  if (el) el.textContent = fracDen[team];
  const minus = document.querySelector('.frac-minus[data-team="' + team + '"]');
  const plus  = document.querySelector('.frac-plus[data-team="' + team + '"]');
  if (minus) minus.classList.toggle("disabled", fracDen[team] <= 1);  // min divisions
  if (plus)  plus.classList.toggle("disabled", fracDen[team] >= 6);   // max divisions
}
function setupFractionControls(team) {
  const minus = document.querySelector('.frac-minus[data-team="' + team + '"]');
  const plus  = document.querySelector('.frac-plus[data-team="' + team + '"]');
  if (minus) addPress(minus, () => fracChangeDen(team, -1));
  if (plus)  addPress(plus,  () => fracChangeDen(team, +1));
}

// one fraction shown as a vertical stack: numerator / bar / denominator
function stackedFrac(f) {
  return `<span class="frac-stack">` +
           `<span class="frac-top">${f.n}</span>` +
           `<span class="frac-bar"></span>` +
           `<span class="frac-bot">${f.d}</span>` +
         `</span>`;
}
function fracQuestionHTML(p) {
  if (!p) return "";
  const parts = p.fracs.map(stackedFrac);
  const expr = (p.op && parts.length === 2)
    ? parts[0] + `<span class="frac-op">${p.op}</span>` + parts[1]
    : parts[0];
  return `<span class="clock-line">${getText(p.prompt)}:</span>` +
         `<span class="clock-line frac-expr">${expr}</span>`;
}
function renderFracQuestion(team) {
  const box = document.getElementById("fracQ" + team);
  if (box) box.innerHTML = fracQuestionHTML(problem[team]);
}
function newFractionProblem(team) {
  problem[team] = genFraction(team);
  fracDen[team] = difficulty === "easy" ? 6 : Math.max(1, Math.min(6, fracDen[team]));
  renderFracQuestion(team);
  if (fracReady[team]) {
    fracSetDenInput(team, fracDen[team]);
    fracClearSlices(team);
  }
  fracLock[team] = fracDen[team] + ":0";
  setCheckReady(team, false);
  updateFracControls(team);
}
function checkFraction(team) {
  const d = fracDen[team];
  const filled = fracFilled(team);
  if (filled === 0) return;
  const sig = d + ":" + filled;
  if (sig === fracLock[team]) return;   // unchanged since last check
  fracLock[team] = sig;
  setCheckReady(team, false);
  const p = problem[team];
  // filled/d === answerNum/answerDen  (equivalent fractions all count)
  const correct = filled * p.answerDen === p.answerNum * d;
  if (correct) {
    const over = rewardCorrect(team);
    if (over || gameOver) return;
    newFractionProblem(team);
  } else {
    rewardWrong(team);
  }
}

/* ---------- PERIMETER / AREA mode (draggable rectangle, max 8x8) ---------- */
function readPeri(team) {
  const m = periInputs[team];
  if (!m) return { w: 0, h: 0 };
  const w = m.width  ? Math.round(Number(m.width.value))  : 0;
  const h = m.height ? Math.round(Number(m.height.value)) : 0;
  return { w, h };
}
// Only these rectangle sizes are buildable (each also allowed flipped).
// Targets are generated ONLY from these, so impossible values never appear.
const PERI_SIZES = [[2, 2], [2, 4], [4, 4], [4, 6], [6, 6], [6, 8], [8, 8]];

// does rectangle w×h satisfy the problem?
function periSatisfies(p, w, h) {
  if (p.type === "area")      return w * h === p.value;
  if (p.type === "perimeter") return 2 * (w + h) === p.value;
  return w * h === p.area && 2 * (w + h) === p.perimeter;  // combo (hard): both must match
}

// a target the player must build
//   easy   -> perimeter only
//   medium -> area OR perimeter
//   hard   -> BOTH area AND perimeter (one exact rectangle satisfies both)
function genPeri() {
  const [w, h] = PERI_SIZES[randInt(0, PERI_SIZES.length - 1)];
  if (difficulty === "easy") {
    return { kind: "perimeter", type: "perimeter", value: 2 * (w + h) };
  }
  if (difficulty === "medium") {
    const type = Math.random() < 0.5 ? "area" : "perimeter";
    return { kind: "perimeter", type, value: type === "area" ? w * h : 2 * (w + h) };
  }
  return { kind: "perimeter", type: "combo", area: w * h, perimeter: 2 * (w + h) };
}
// avoid a target the current rectangle already satisfies (so they must resize)
function makePeriProblem(team) {
  const cur = readPeri(team);
  let p, guard = 0;
  do { p = genPeri(); guard++; }
  while (periSatisfies(p, cur.w, cur.h) && guard < 60);
  return p;
}
function loadPeri(team) {
  const rv = new rive.Rive({
    src: "rive/perimeter.riv",
    canvas: document.getElementById("periShape" + team),
    stateMachines: SM_NAME,
    autoplay: true,
    layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
    onLoad: () => {
      rv.resizeDrawingSurfaceToCanvas();
      const list = rv.stateMachineInputs(SM_NAME) || [];
      const map = {};
      list.forEach((i) => { map[i.name] = i; });
      periInputs[team] = map;
      periReady[team] = true;
      const cur = readPeri(team);
      periLock[team] = cur.w + "x" + cur.h;   // baseline (must change to enable CHECK)
    },
    onLoadError: (e) => console.error("perimeter" + team + " load error:", e),
  });
  window.addEventListener("resize", () => { try { rv.resizeDrawingSurfaceToCanvas(); } catch (_) {} });
  periRive[team] = rv;
}
function periQuestionHTML(p) {
  if (!p) return "";
  if (p.type === "combo") { // hard: show both area and perimeter
    return `<span class="clock-line">${getText("areaLabel")}: <span class="clock-amt">${p.area}</span></span>` +
           `<span class="clock-line">${getText("perimeterLabel")}: <span class="clock-amt">${p.perimeter}</span></span>`;
  }
  const label = getText(p.type === "area" ? "areaLabel" : "perimeterLabel");
  return `<span class="clock-line">${label}:</span>` +
         `<span class="clock-line"><span class="clock-amt">${p.value}</span></span>`;
}
function renderPeriQuestion(team) {
  const b = document.getElementById("periQ" + team);
  if (b) b.innerHTML = periQuestionHTML(problem[team]);
}
function newPeriProblem(team) {
  problem[team] = makePeriProblem(team);
  renderPeriQuestion(team);
  const cur = readPeri(team);
  periLock[team] = cur.w + "x" + cur.h;   // keep the shape; must move to re-enable CHECK
  setCheckReady(team, false);
}
function checkPeri(team) {
  const { w, h } = readPeri(team);
  if (w < 1 || h < 1) return;
  const sig = w + "x" + h;
  if (sig === periLock[team]) return;     // unchanged since last check
  periLock[team] = sig;
  setCheckReady(team, false);
  const p = problem[team];
  const correct = periSatisfies(p, w, h);  // any matching rectangle counts
  if (correct) {
    const over = rewardCorrect(team);
    if (over || gameOver) return;
    newPeriProblem(team);
  } else {
    rewardWrong(team);
  }
}

/* ---------- RENDER (operation) ---------- */
function setCheckReady(team, ready) {
  document.getElementById("check" + team).classList.toggle("ready", !!ready);
}
function render(team) {
  if (MODE !== "operation") return;
  document.getElementById("eqText" + team).textContent = problem[team].text;
  document.getElementById("eqBox" + team).textContent = input[team];
  document.getElementById("display" + team).textContent = input[team];
  const hasInput = input[team] !== "" && input[team] !== "-";
  setCheckReady(team, hasInput && started && !gameOver);
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
function newTimeProblem(team) {
  problem[team] = makeTimeProblem(team);
  renderQuestion(team);
  setCheckReady(team, false);
}
function newRulerProblem(team) {
  problem[team] = genRuler(readRulerChoice(team));
  renderRulerQuestion(team);
  applyRuler(team);           // update the numbers shown on the ruler
  setCheckReady(team, false);
}

/* ---------- NUMPAD INPUT (operation only) ---------- */
function pressDigit(team, d) {
  if (!started || gameOver) return;
  if (MODE === "sudoku") return sdkPressDigit(team, d);
  if (MODE === "column") return colPressDigit(team, d);
  if (input[team].replace("-", "").length >= MAX_INPUT_LEN) return;
  input[team] += d; render(team);
}
function pressBack(team) {
  if (!started || gameOver) return;
  if (MODE === "sudoku") return sdkPressBack(team);
  if (MODE === "column") return colPressBack(team);
  input[team] = input[team].slice(0, -1); render(team);
}
function pressMinus(team) {
  if (!started || gameOver) return;
  if (MODE === "sudoku") return;   // no minus in sudoku
  if (MODE === "column") return;   // no minus in column mode
  input[team] = input[team].startsWith("-") ? input[team].slice(1) : "-" + input[team];
  render(team);
}
function buildPad(team) {
  const pad = document.getElementById("pad" + team);
  // sudoku: no minus, 3 columns, wide 0 (left+middle) with backspace bottom-right
  const sudoku = MODE === "sudoku";
  const keys = sudoku
    ? ["1","2","3", "4","5","6", "7","8","9", "0","back"]
    : ["1","2","3","back", "4","5","6","minus", "7","8","9","0"];
  if (sudoku) pad.classList.add("pad--sudoku");
  keys.forEach((k) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key";
    if (k === "back") {
      btn.classList.add("back");
      const icon = document.createElement("img");
      icon.src = "assets/backspace.png"; icon.alt = "Backspace";
      btn.appendChild(icon);
      addPress(btn, () => pressBack(team));
    } else if (k === "minus") {
      btn.classList.add("op"); btn.textContent = "−";
      addPress(btn, () => pressMinus(team));
    } else {
      if (sudoku && k === "0") btn.classList.add("key--wide");   // 0 spans two columns
      btn.textContent = k;
      addPress(btn, () => pressDigit(team, k));
    }
    pad.appendChild(btn);
  });
}
function addPress(el, handler) {
  let firedByPointer = false;
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); firedByPointer = true; handler(); });
  el.addEventListener("click", () => { if (firedByPointer) { firedByPointer = false; return; } handler(); });
}

/* ---------- CHECK ANSWER (dispatches by mode) ---------- */
function check(team) {
  if (!started || gameOver) return;
  if (MODE === "time")      return checkTime(team);
  if (MODE === "ruler")     return checkRuler(team);
  if (MODE === "column")    return checkColumn(team);
  if (MODE === "fraction")  return checkFraction(team);
  if (MODE === "perimeter") return checkPeri(team);
  if (MODE === "sudoku")    return;   // sudoku scores live, no CHECK needed
  return checkOp(team);
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

function checkOp(team) {
  if (input[team] === "" || input[team] === "-") return;
  const correct = Number(input[team]) === problem[team].answer;
  if (correct) {
    const over = rewardCorrect(team);
    if (over || gameOver) return;
    newProblem(team);
  } else {
    rewardWrong(team);
    input[team] = ""; render(team);
  }
}

function checkTime(team) {
  const cur = readClock(team);
  if (!readingsDiffer(cur, lockedReading[team])) return;
  lockedReading[team] = { h: cur.h, m: cur.m };
  setCheckReady(team, false);
  const correct = normHour(cur.h) === normHour(problem[team].hours) &&
                  minutesMatch(cur.m, problem[team].minutes);
  if (correct) {
    const over = rewardCorrect(team);
    if (over || gameOver) return;
    newTimeProblem(team);
  } else {
    rewardWrong(team);
  }
}

function checkRuler(team) {
  const cur = readRulerChoice(team);
  if (cur === lockedChoice[team]) return;   // hasn't moved since last check
  lockedChoice[team] = cur;
  setCheckReady(team, false);
  const correct = cur === problem[team].answerChoice;
  if (correct) {
    const over = rewardCorrect(team);
    if (over || gameOver) return;
    newRulerProblem(team);   // keep the marker; just change the question
  } else {
    rewardWrong(team);
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

/* ---------- POLL (enable CHECK when the team's control changes) ---------- */
function pollControls() {
  if (started && !gameOver) {
    if (MODE === "time") {
      [1, 2].forEach((t) => setCheckReady(t, readingsDiffer(readClock(t), lockedReading[t])));
    } else if (MODE === "ruler") {
      [1, 2].forEach((t) => setCheckReady(t, readRulerChoice(t) !== lockedChoice[t]));
    } else if (MODE === "fraction") {
      [1, 2].forEach((t) => {
        const filled = fracFilled(t);
        const sig = fracDen[t] + ":" + filled;
        setCheckReady(t, filled > 0 && sig !== fracLock[t]);
      });
    } else if (MODE === "perimeter") {
      [1, 2].forEach((t) => {
        const { w, h } = readPeri(t);
        const sig = w + "x" + h;
        setCheckReady(t, w >= 1 && h >= 1 && sig !== periLock[t]);
      });
    }
  }
  requestAnimationFrame(pollControls);
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
      if (secondsLeft <= 0) { clearInterval(timerId); onTimeUp(); }
    } catch (e) { console.error("timer tick error:", e); }
  }, 1000);
}
function onTimeUp() {
  if (gameOver) return;
  // sudoku: first to finish already won; if time runs out, nobody finished -> draw
  if (MODE === "sudoku") { endGame(0); return; }
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
  sfxStopBg();
  if (winner === 1 || winner === 2) { fireTrigger(avatarVM[winner], "winner"); sfx("win"); }
  setCheckReady(1, false); setCheckReady(2, false);
  render(1); render(2);
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

/* ---------- Re-render on language change ---------- */
document.addEventListener("languagechange", () => {
  if (MODE === "time")     { renderQuestion(1); renderQuestion(2); }
  if (MODE === "ruler")    { renderRulerQuestion(1); renderRulerQuestion(2); applyRuler(1); applyRuler(2); }
  if (MODE === "fraction")  { renderFracQuestion(1); renderFracQuestion(2); }
  if (MODE === "perimeter") { renderPeriQuestion(1); renderPeriQuestion(2); }
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
  render(1); render(2);
}

/* ---------- BOOT ---------- */
if (MODE === "operation") {
  buildPad(1); buildPad(2);
  newProblem(1); newProblem(2);
} else if (MODE === "time") {
  loadClock(1); loadClock(2);
  newTimeProblem(1); newTimeProblem(2);
} else if (MODE === "ruler") {
  loadRuler(1); loadRuler(2);
  newRulerProblem(1); newRulerProblem(2);
} else if (MODE === "fraction") {
  fracDen[1] = fracDen[2] = difficulty === "easy" ? 6 : 1;   // start undivided (1)
  loadFraction(1); loadFraction(2);
  setupFractionControls(1); setupFractionControls(2);
  newFractionProblem(1); newFractionProblem(2);
} else if (MODE === "perimeter") {
  loadPeri(1); loadPeri(2);
  newPeriProblem(1); newPeriProblem(2);
} else if (MODE === "sudoku") {
  buildPad(1); buildPad(2);
  setupSudokuTaps(1); setupSudokuTaps(2);
  newSudokuProblem(1); newSudokuProblem(2);
} else { // column
  buildPad(1); buildPad(2);
  setupColumnTaps(1); setupColumnTaps(2);
  newColumnProblem(1); newColumnProblem(2);
}
renderScores();

addPress(document.getElementById("check1"), () => check(1));
addPress(document.getElementById("check2"), () => check(2));

if (window.Sound && window.Sound.unlock) window.Sound.unlock();

/* ---------- SOUND TOGGLE (bottom-right) — live mute/unmute ---------- */
(function initSoundToggle() {
  const btn = document.getElementById("soundBtn");
  if (!btn) return;

  const isOn = () => {
    try { return localStorage.getItem("tetragon_sound") !== "off"; }
    catch (e) { return true; }
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
    if (turningOn) { if (started && !gameOver) sfxStartBg(); }  // resume music
    else { sfxStopBg(); }                                       // silence now
  });
})();

if (MODE === "time" || MODE === "ruler" || MODE === "fraction" || MODE === "perimeter") requestAnimationFrame(pollControls);

runCountdown();