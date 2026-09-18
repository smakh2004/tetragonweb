/* =====================================================
   TETRAGON — SOUND EFFECTS
   Files live in: assets/sounds/
   Exposes: Sound.play(key), Sound.startBg(), Sound.stopBg(),
            Sound.ready (Promise that resolves once audio is unlocked)
===================================================== */

const Sound = (() => {
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

  const buffers = {};
  let bg = null;

  for (const key in FILES) {
    const a = new Audio(FILES[key]);
    a.preload = "auto";
    a.volume = VOLUME[key] !== undefined ? VOLUME[key] : 1;
    if (key === "bg") { a.loop = true; bg = a; }
    else buffers[key] = a;
  }

  let unlocked = false;
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; });

  function play(key) {
    const base = buffers[key];
    if (!base) return;
    try {
      const node = base.cloneNode();
      node.volume = base.volume;
      node.play().catch(() => {});
    } catch (e) {}
  }
  function startBg() {
    if (!bg) return;
    try { bg.currentTime = 0; bg.play().catch(() => {}); } catch (e) {}
  }
  function stopBg() {
    if (!bg) return;
    try { bg.pause(); } catch (e) {}
  }

  // Unlock on first user gesture: play+pause every clip muted, then resolve ready.
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const all = [bg, ...Object.values(buffers)];
    all.forEach((a) => {
      if (!a) return;
      try {
        a.muted = true;
        a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
                .catch(() => { a.muted = false; });
      } catch (e) {}
    });
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    resolveReady();
  }
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });

  return { play, startBg, stopBg, ready, unlock };
})();