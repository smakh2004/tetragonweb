/* =====================================================
   INDEX PAGE — Mr Square full-page background animation
   (the language system now lives in js/i18n.js)
===================================================== */
const canvas = document.getElementById("mrSquare");

const r = new rive.Rive({
  src: "rive/mr_square.riv",
  canvas: canvas,

  // Change this to your file's real state machine name if different.
  stateMachines: "State Machine 1",

  autoplay: true,
  autoBind: true,

  layout: new rive.Layout({
    fit: rive.Fit.Cover,            // Cover = fills the page, keeps proportions
    alignment: rive.Alignment.Center,
  }),

  onLoad: () => {
    r.resizeDrawingSurfaceToCanvas(); // keeps it responsive + sharp
  },

  onLoadError: (e) => console.error("Rive failed to load:", e),
});

window.addEventListener("resize", () => {
  r.resizeDrawingSurfaceToCanvas();
});