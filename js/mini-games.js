/* =====================================================
   MINI GAMES PAGE
   - avatar.riv animation (ViewModel1)
   - GAME TYPE selector (Operation / Time)
   - EASY / MEDIUM / HARD difficulty toggle
   - changing difficulty OR game type fires the "thinking" trigger
   - PLAY opens a DIFFERENT page per game type:
         operation -> game.html
         time      -> time.html
     (difficulty is carried in the URL either way)
   (the language system lives in js/i18n.js)
===================================================== */
const canvas = document.getElementById("avatar");

let avatarVM = null; // ViewModel1 instance, filled in once the file loads

const avatar = new rive.Rive({
  src: "rive/avatar.riv",
  canvas: canvas,
  stateMachines: "State Machine 1",
  autoplay: true,
  autoBind: true,
  layout: new rive.Layout({
    fit: rive.Fit.Contain,
    alignment: rive.Alignment.Center,
  }),
  onLoad: () => {
    avatar.resizeDrawingSurfaceToCanvas();
    avatarVM = avatar.viewModelInstance;
  },
  onLoadError: (e) => console.error("Rive failed to load:", e),
});

window.addEventListener("resize", () => {
  avatar.resizeDrawingSurfaceToCanvas();
});

// Fire a named trigger on ViewModel1 (thinking / star / correct)
function fireTrigger(name) {
  if (!avatarVM) return;
  try {
    const t = avatarVM.trigger(name);
    if (t) t.trigger();
  } catch (e) {
    console.error("Could not fire '" + name + "' trigger:", e);
  }
}

// premium games + whether the user currently has an active subscription (cached)
const PREMIUM_GAMES = ["time", "ruler", "column", "fraction", "perimeter", "sudoku"];
function isSubscribed() {
  try { return localStorage.getItem("tetragon_plan") === "active"; } catch (e) { return false; }
}

/* ---------- Which page each game type opens ---------- */
const GAME_PAGES = {
  operation: "game.html",
  time: "time.html",
  ruler: "ruler.html",
  column: "column.html",
  fraction: "fraction.html",
  perimeter: "perimeter.html",
  sudoku: "sudoku.html",
};

let selectedGame = "operation"; // default

/* ---------- GAME TYPE selection (event delegation = bulletproof) ----------
   We listen on the whole panel (Free + Premium), then find the clicked
   SELECTABLE tile ([data-game]) with closest(). Locked tiles have no
   data-game, so they're ignored here (handled below).                       */
// highlight the heading of the section that holds the selected tile
function updateActiveSection(item) {
  document.querySelectorAll(".type-heading").forEach((h) => h.classList.remove("active"));
  const section = item && item.closest(".type-section");
  const heading = section && section.querySelector(".type-heading");
  if (heading) heading.classList.add("active");
}

const typePanel = document.getElementById("typePanel");
if (typePanel) {
  typePanel.addEventListener("click", (e) => {
    const item = e.target.closest(".type-item[data-game]");
    if (!item || !typePanel.contains(item)) return;

    // move the "selected" state onto the clicked tile
    typePanel.querySelectorAll(".type-item[data-game]").forEach((i) => i.classList.remove("selected"));
    item.classList.add("selected");

    selectedGame = item.dataset.game || "operation";
    updateActiveSection(item);   // recolor Free / Premium titles

    // non-subscriber picks a premium game -> "correct"; otherwise "star"
    if (PREMIUM_GAMES.includes(selectedGame) && !isSubscribed()) {
      fireTrigger("correct");
    } else {
      fireTrigger("star");
    }
  });
}

// set the initial active heading from the default-selected tile
updateActiveSection(document.querySelector(".type-item.selected"));

/* ---------- Locked premium tiles: little "nope" shake ---------- */
document.querySelectorAll(".type-item.locked").forEach((item) => {
  item.addEventListener("click", () => {
    item.classList.remove("shake");
    void item.offsetWidth; // restart the animation
    item.classList.add("shake");
  });
});

/* ---------- DIFFICULTY buttons ---------- */
const diffButtons = document.querySelectorAll(".diff-btn");
diffButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("active")) return;
    diffButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    fireTrigger("thinking");   // difficulty change -> "thinking"
  });
});

/* ---------- PLAY -> open the correct page for the chosen game type ---------- */
const playBtn = document.getElementById("playBtn");
if (playBtn) {
  playBtn.addEventListener("click", () => {
    const activeDiff = document.querySelector(".diff-btn.active");
    const diff = activeDiff ? activeDiff.dataset.diff : "easy";
    const page = GAME_PAGES[selectedGame] || "game.html";
    window.location.href = page + "?difficulty=" + diff;
  });
}

/* =====================================================
   CUSTOM SCROLLBAR for the game-type panel
   - the knob is a PNG (assets/icons/scroll_knob.png) sitting OUTSIDE the panel
   - dragging the knob scrolls the panel; the knob also tracks wheel/scroll
===================================================== */
(function initTypeScroll() {
  const panel = document.getElementById("typePanel");
  const track = document.getElementById("typeScroll");
  const knob  = document.getElementById("typeKnob");
  if (!panel || !track || !knob) return;

  const maxScroll  = () => panel.scrollHeight - panel.clientHeight;
  const knobTravel = () => track.clientHeight - knob.offsetHeight;

  // Move the knob to reflect the panel's current scroll position
  function syncKnob() {
    const ms = maxScroll();
    if (ms <= 1) {                      // nothing to scroll -> remove the bar (frees the space)
      track.style.display = "none";
      knob.style.top = "0px";
      return;
    }
    track.style.display = "";
    const ratio = panel.scrollTop / ms;
    knob.style.top = (ratio * knobTravel()) + "px";
  }

  // Scroll the panel so the knob sits at pixel `top`
  function scrollToKnobTop(top) {
    const travel = knobTravel();
    const clamped = Math.min(travel, Math.max(0, top));
    knob.style.top = clamped + "px";
    const ratio = travel > 0 ? clamped / travel : 0;
    panel.scrollTop = ratio * maxScroll();
  }

  panel.addEventListener("scroll", syncKnob);
  window.addEventListener("resize", syncKnob);
  window.addEventListener("load", syncKnob);

  // ----- drag the knob -----
  let dragging = false, startY = 0, startTop = 0;

  knob.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    startTop = parseFloat(knob.style.top || "0");
    try { knob.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  knob.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    scrollToKnobTop(startTop + (e.clientY - startY));
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try { knob.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  knob.addEventListener("pointerup", endDrag);
  knob.addEventListener("pointercancel", endDrag);

  // ----- click on the track to jump -----
  track.addEventListener("pointerdown", (e) => {
    if (e.target === knob || knob.contains(e.target)) return;
    const rect = track.getBoundingClientRect();
    scrollToKnobTop(e.clientY - rect.top - knob.offsetHeight / 2);
  });

  // initial position (after layout + images)
  requestAnimationFrame(syncKnob);
})();