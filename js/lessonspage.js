/* =====================================================
   LESSONS PAGE  (lessons.html)
   Mini-games-style layout: avatar + PLAY on the left, a panel of lesson
   tiles on the right.

   Behaviors (from the mockups):
     - tap a lesson tile      -> it becomes CHOSEN (blue outline); PLAY activates
     - PLAY (chosen lesson)   -> opens the 2-team battle: quiz.html?game=<id>
     - pen button (top-right of chosen tile) -> edit: lesson-edit.html?game=<id>
     - drag a lesson tile     -> the DELETE bin appears (only while dragging);
                                 drop on the bin to delete that lesson
     - "Add lesson" + tile    -> lesson-edit.html  (create a new lesson)
     - free limit reached     -> the Add-lesson tile turns gradient and its
                                 label becomes "Obuna bo'lish"; tapping it goes
                                 to subscription.html
   (language system lives in js/i18n.js — getText() is global)
===================================================== */
import {
  currentUser, isPremiumAsync,
  listGames, countQuestions, deleteGame,
  FREE_MAX_GAMES,
} from "./lessonstore.js";

const T = (k) => (window.getText ? window.getText(k) : k);
function show(el, on = true) { if (el) el.hidden = !on; }

/* ---------- Avatar Rive (identical to mini-games.js) ----------
   Created ONLY after the auth check passes (see boot()), and wrapped in a
   try/catch so a Rive hiccup can never block the signed-out redirect. */
let avatar = null;
let avatarVM = null;
function initAvatar() {
  try {
    avatar = new rive.Rive({
      src: "rive/avatar.riv",
      canvas: document.getElementById("avatar"),
      stateMachines: "State Machine 1",
      autoplay: true,
      autoBind: true,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoad: () => { avatar.resizeDrawingSurfaceToCanvas(); avatarVM = avatar.viewModelInstance; },
      onLoadError: (e) => console.error("Rive failed to load:", e),
    });
    window.addEventListener("resize", () => { try { avatar.resizeDrawingSurfaceToCanvas(); } catch (e) {} });
  } catch (e) {
    console.error("avatar init failed:", e);
  }
}
function fireTrigger(name) {
  if (!avatarVM) return;
  try { const t = avatarVM.trigger(name); if (t) t.trigger(); } catch (e) {}
}

/* ---------- page state ---------- */
const loadingEl = document.getElementById("loading");
const signedOut = document.getElementById("signedOut");
const grid      = document.getElementById("lessonsGrid");
const bin       = document.getElementById("lessonBin");
const playBtn   = document.getElementById("playBtn");

let uid = null;
let premium = false;
let games = [];
let qCounts = {};           // gameId -> question count
let chosenId = null;        // currently selected lesson

async function boot() {
  console.log("[lessons] booting (lessonspage.js)…");   // confirms NEW code is running
  const user = await currentUser();
  // not signed in -> go straight to the signup page (come back here after).
  if (!user) {
    console.log("[lessons] no user -> signup");
    show(loadingEl, false);
    show(grid, false);
    show(signedOut, true);      // show the log-in panel (last resort)
    // also redirect to signup after a tick
    window.location.replace("signup.html?next=" + encodeURIComponent("lessons.html"));
    return;
  }
  // SIGNED IN: the log-in panel must never show from here on.
  console.log("[lessons] signed in as", user.uid);
  show(signedOut, false);
  uid = user.uid;
  initAvatar();                 // only signed-in users get the animation
  premium = await isPremiumAsync(uid);
  await refresh();
}

async function refresh() {
  show(loadingEl, true);
  show(signedOut, false);
  show(grid, false);

  try { games = await listGames(uid); }
  catch (e) { console.error("load lessons failed:", e); games = []; }

  // question counts (for PLAY gating: need >=2 to run a battle)
  const counts = await Promise.all(games.map((g) => countQuestions(g.id).catch(() => 0)));
  qCounts = {};
  games.forEach((g, i) => { qCounts[g.id] = counts[i]; });

  show(loadingEl, false);
  renderGrid();
  show(grid, true);
  // keep a chosen lesson chosen across refreshes if it still exists
  if (chosenId && !games.some((g) => g.id === chosenId)) chosenId = null;
  updatePlay();
}

function canCreateMore() {
  return premium || games.length < FREE_MAX_GAMES;
}

function renderGrid() {
  grid.innerHTML = "";

  games.forEach((g, i) => {
    const tile = document.createElement("div");
    tile.className = "lesson-tile" + (g.id === chosenId ? " chosen" : "");
    tile.dataset.id = g.id;

    // numbered square
    const num = document.createElement("button");
    num.type = "button";
    num.className = "lesson-num";
    num.textContent = String(i + 1);
    num.addEventListener("click", () => chooseLesson(g.id));
    tile.appendChild(num);

    // pen edit button (shown only on the chosen tile via CSS)
    const pen = document.createElement("button");
    pen.type = "button";
    pen.className = "lesson-pen";
    pen.setAttribute("aria-label", T("editWord"));
    pen.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"' +
      ' stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    pen.addEventListener("click", (e) => {
      e.stopPropagation();
      window.location.href = "createlesson.html?game=" + encodeURIComponent(g.id);
    });
    tile.appendChild(pen);

    // name below
    const name = document.createElement("div");
    name.className = "lesson-name";
    name.textContent = g.title || "Lesson";
    tile.appendChild(name);

    enableDrag(tile, g.id);
    grid.appendChild(tile);
  });

  // Add-lesson tile (or gradient "Obuna bo'lish" at the limit)
  const add = document.createElement("button");
  add.type = "button";
  const atLimit = !canCreateMore();
  add.className = "lesson-add" + (atLimit ? " is-locked" : "");
  if (atLimit) {
    add.innerHTML = '<span class="lesson-add-label">' + T("subscribe") + "</span>";
    add.addEventListener("click", () => { window.location.href = "subscription.html"; });
  } else {
    add.innerHTML =
      '<span class="lesson-add-plus">' +
      '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"' +
      ' stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>' +
      '<span class="lesson-add-label">' + T("addLesson") + "</span>";
    add.addEventListener("click", () => { window.location.href = "createlesson.html"; });
  }
  grid.appendChild(add);
}

/* ---------- choose a lesson ---------- */
function chooseLesson(id) {
  chosenId = (chosenId === id) ? null : id;   // tapping again de-selects
  grid.querySelectorAll(".lesson-tile").forEach((t) => {
    t.classList.toggle("chosen", t.dataset.id === chosenId);
  });
  fireTrigger("star");
  updatePlay();
}

function updatePlay() {
  const chosen = games.find((g) => g.id === chosenId);
  const ready = !!chosen && (qCounts[chosenId] || 0) >= 2;
  playBtn.classList.toggle("is-disabled", !ready);
}

playBtn.addEventListener("click", () => {
  if (playBtn.classList.contains("is-disabled")) {
    // give feedback on why it's not ready
    if (chosenId && (qCounts[chosenId] || 0) < 2) alert(T("needTwoToStart"));
    return;
  }
  window.location.href = "quiz.html?game=" + encodeURIComponent(chosenId);
});

/* =====================================================
   DRAG A LESSON TO THE BIN TO DELETE IT
   Pointer Events -> works on touch + mouse. The tile follows the finger;
   the bin appears while dragging; dropping over the bin deletes.
===================================================== */
function enableDrag(tile, id) {
  let dragging = false;
  let ghost = null;
  let startX = 0, startY = 0;
  let moved = false;

  const DRAG_THRESHOLD = 6;   // px before it counts as a drag (so taps still work)

  tile.addEventListener("pointerdown", (e) => {
    // ignore drags that start on the pen button
    if (e.target.closest(".lesson-pen")) return;
    startX = e.clientX; startY = e.clientY;
    moved = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        // start dragging
        dragging = true;
        moved = true;
        startDrag(ev);
      }
      moveGhost(ev);
      highlightBin(ev);
    };

    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (dragging) endDrag(ev);
      dragging = false;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  function startDrag(ev) {
    // the bin is always visible; just mark the drag state
    if (bin) bin.classList.add("visible");
    tile.classList.add("dragging");
    // a floating clone follows the pointer
    ghost = tile.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.width = tile.offsetWidth + "px";
    ghost.style.height = tile.offsetHeight + "px";
    document.body.appendChild(ghost);
    moveGhost(ev);
  }

  function moveGhost(ev) {
    if (!ghost) return;
    ghost.style.left = ev.clientX + "px";
    ghost.style.top = ev.clientY + "px";
  }

  function overBin(ev) {
    if (!bin) return false;
    const r = bin.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right &&
           ev.clientY >= r.top  && ev.clientY <= r.bottom;
  }

  function highlightBin(ev) {
    bin.classList.toggle("over", overBin(ev));
  }

  async function endDrag(ev) {
    const dropOnBin = overBin(ev);
    if (ghost) { ghost.remove(); ghost = null; }
    tile.classList.remove("dragging");
    if (bin) bin.classList.remove("visible", "over");   // keep the bin visible

    if (dropOnBin) {
      if (confirm(T("confirmDeleteGame"))) {
        try {
          await deleteGame(id);
          if (chosenId === id) chosenId = null;
          await refresh();
        } catch (e) { console.error("delete failed:", e); }
      }
    }
  }
}

/* ---------- re-render on language change ---------- */
document.addEventListener("languagechange", () => { if (uid) renderGrid(); });

/* =====================================================
   CUSTOM SCROLLBAR (identical to mini-games.js)
===================================================== */
(function initTypeScroll() {
  const panel = document.getElementById("lessonsPanel");
  const track = document.getElementById("typeScroll");
  const knob  = document.getElementById("typeKnob");
  if (!panel || !track || !knob) return;

  const maxScroll  = () => panel.scrollHeight - panel.clientHeight;
  const knobTravel = () => track.clientHeight - knob.offsetHeight;

  function syncKnob() {
    const ms = maxScroll();
    if (ms <= 1) { track.style.display = "none"; knob.style.top = "0px"; return; }
    track.style.display = "";
    const ratio = panel.scrollTop / ms;
    knob.style.top = (ratio * knobTravel()) + "px";
  }
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

  let dragging = false, startY = 0, startTop = 0;
  knob.addEventListener("pointerdown", (e) => {
    dragging = true; startY = e.clientY; startTop = parseFloat(knob.style.top || "0");
    try { knob.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  knob.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    scrollToKnobTop(startTop + (e.clientY - startY));
  });
  function endDrag(e) { if (!dragging) return; dragging = false; try { knob.releasePointerCapture(e.pointerId); } catch (_) {} }
  knob.addEventListener("pointerup", endDrag);
  knob.addEventListener("pointercancel", endDrag);
  track.addEventListener("pointerdown", (e) => {
    if (e.target === knob || knob.contains(e.target)) return;
    const rect = track.getBoundingClientRect();
    scrollToKnobTop(e.clientY - rect.top - knob.offsetHeight / 2);
  });

  // re-sync after tiles render
  window.__syncLessonKnob = syncKnob;
  requestAnimationFrame(syncKnob);
})();

boot();