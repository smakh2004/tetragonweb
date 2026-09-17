/* =====================================================
   1) LANGUAGES (en / ru / uz)
   -----------------------------------------------------
   To change any wording, just edit the text below.
   Keys (download, math, physics...) must stay the same
   because they match data-i18n="..." in index.html.
===================================================== */
const translations = {
  en: {
    download: "Download App",
    math: "math",
    physics: "physics",
    always: "always learn",
    mini: "Mini Games",
    science: "SCIENCE",
  },
  ru: {
    download: "Скачать",
    math: "математика",
    physics: "физика",
    always: "учись всегда",
    mini: "Мини-игры",
    science: "НАУКА",
  },
  uz: {
    download: "Yuklab olish",
    math: "matematika",
    physics: "fizika",
    always: "bilim ol",
    mini: "Mini o'yinlar",
    science: "ILM FAN",
  },
};

// The short labels shown in the switcher
const langLabels = { en: "EN", ru: "RU", uz: "UZ" };
const langOrder = ["en", "ru", "uz"];

// grab the switcher pieces
const langSwitch = document.getElementById("langSwitch");
const langCurrent = document.getElementById("langCurrent");
const langOptions = document.getElementById("langOptions");

let currentLang = "en";

// Swap every text on the page to the chosen language
function applyLanguage(lang) {
  currentLang = translations[lang] ? lang : "en";
  const dict = translations[currentLang];

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  // update <html lang="..">
  document.documentElement.lang = currentLang;

  // current button shows the active language
  langCurrent.textContent = langLabels[currentLang];

  // rebuild the "other two" options
  buildOptions();

  // remember the choice for next visit
  try {
    localStorage.setItem("tetragon_lang", currentLang);
  } catch (e) {}
}

// Build the two OTHER languages next to the current one
function buildOptions() {
  langOptions.innerHTML = "";
  langOrder
    .filter((lang) => lang !== currentLang)
    .forEach((lang) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lang-btn";
      btn.textContent = langLabels[lang];
      btn.addEventListener("click", (e) => {
        e.stopPropagation();     // don't let the click re-toggle the menu
        applyLanguage(lang);     // switch language
        closeMenu();             // collapse back
      });
      langOptions.appendChild(btn);
    });
}

// open / close helpers
function openMenu() {
  langSwitch.classList.add("open");
}
function closeMenu() {
  langSwitch.classList.remove("open");
}
function toggleMenu() {
  langSwitch.classList.toggle("open");
}

// click the current language -> open/close the other two
langCurrent.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});

// click anywhere else on the page -> close
document.addEventListener("click", () => closeMenu());

// press Esc -> close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

// On first load: use the saved language if there is one, otherwise English.
// (Browser language is intentionally ignored so it ALWAYS starts in EN.)
let startLang = "en";
try {
  const saved = localStorage.getItem("tetragon_lang");
  if (saved && translations[saved]) {
    startLang = saved;
  }
} catch (e) {}

applyLanguage(startLang);

/* =====================================================
   2) RIVE background animation (unchanged)
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
    fit: rive.Fit.Cover,            // Cover = fills the page, keeps proportions (no stretching)
    alignment: rive.Alignment.Center,
  }),

  onLoad: () => {
    r.resizeDrawingSurfaceToCanvas(); // keeps it responsive + sharp
  },

  onLoadError: (e) => console.error("Rive failed to load:", e),
});

// re-fit + re-sharpen whenever the window size changes
window.addEventListener("resize", () => {
  r.resizeDrawingSurfaceToCanvas();
});