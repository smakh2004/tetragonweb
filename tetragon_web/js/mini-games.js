/* =====================================================
   MINI GAMES PAGE
   - avatar.riv animation (ViewModel1)
   - EASY / MEDIUM / HARD difficulty toggle
   - changing difficulty fires the ViewModel1 "thinking" trigger
   - PLAY opens game.html carrying the chosen difficulty
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

// Fire the "thinking" trigger on ViewModel1
function fireThinking() {
  if (!avatarVM) return;
  try {
    const t = avatarVM.trigger("thinking");
    if (t) t.trigger();
  } catch (e) {
    console.error("Could not fire 'thinking' trigger:", e);
  }
}

// EASY / MEDIUM / HARD buttons
const diffButtons = document.querySelectorAll(".diff-btn");
diffButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("active")) return;
    diffButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    fireThinking();
  });
});

// PLAY -> open the game page, passing the selected difficulty in the URL
const playBtn = document.getElementById("playBtn");
if (playBtn) {
  playBtn.addEventListener("click", () => {
    const active = document.querySelector(".diff-btn.active");
    const diff = active ? active.dataset.diff : "easy";
    window.location.href = "game.html?difficulty=" + diff;
  });
}