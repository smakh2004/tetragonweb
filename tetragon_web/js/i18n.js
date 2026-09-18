/* =====================================================
   SHARED LANGUAGE SYSTEM (en / ru / uz)
   Used by index.html, mini-games.html and game.html.
   Edit wording in ONE place: the translations object.
   Keys must match data-i18n="..." in the HTML files.
===================================================== */
const translations = {
  en: {
    download: "Download App",
    math: "math",
    physics: "physics",
    always: "always learn",
    mini: "Mini Games",
    science: "SCIENCE",
    easy: "EASY",
    medium: "MEDIUM",
    hard: "HARD",
    play: "PLAY",
    team1: "1 TEAM",
    team2: "2 TEAM",
    check: "CHECK",
    wins: "WINS",
    draw: "DRAW",
    playAgain: "PLAY AGAIN",
    go: "GO!",
  },
  ru: {
    download: "Скачать",
    math: "математика",
    physics: "физика",
    always: "учись всегда",
    mini: "Мини-игры",
    science: "НАУКА",
    easy: "ЛЕГКО",
    medium: "СРЕДНЕ",
    hard: "СЛОЖНО",
    play: "ИГРАТЬ",
    team1: "КОМАНДА 1",
    team2: "КОМАНДА 2",
    check: "ПРОВЕРИТЬ",
    wins: "ПОБЕДИЛА",
    draw: "НИЧЬЯ",
    playAgain: "ЕЩЁ РАЗ",
    go: "СТАРТ!",
  },
  uz: {
    download: "Yuklab olish",
    math: "matematika",
    physics: "fizika",
    always: "bilim ol",
    mini: "Mini o'yinlar",
    science: "ILM FAN",
    easy: "OSON",
    medium: "O'RTA",
    hard: "QIYIN",
    play: "O'YNASH",
    team1: "1-JAMOA",
    team2: "2-JAMOA",
    check: "TEKSHIRISH",
    wins: "YUTDI",
    draw: "DURANG",
    playAgain: "YANA",
    go: "BOSHLADIK!",
  },
};

const langLabels = { en: "EN", ru: "RU", uz: "UZ" };
const langOrder = ["en", "ru", "uz"];

const langSwitch = document.getElementById("langSwitch");
const langCurrent = document.getElementById("langCurrent");
const langOptions = document.getElementById("langOptions");

let currentLang = "en";

// Let other scripts (game.js) read a translated word for the current language
window.getText = (key) => {
  const dict = translations[currentLang] || translations.en;
  return dict[key] !== undefined ? dict[key] : key;
};
window.getLang = () => currentLang;

// Swap every text on the page to the chosen language
function applyLanguage(lang) {
  currentLang = translations[lang] ? lang : "en";
  const dict = translations[currentLang];

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] !== undefined) el.textContent = dict[key];
  });

  document.documentElement.lang = currentLang;

  if (langCurrent) langCurrent.textContent = langLabels[currentLang];
  buildOptions();

  // let the game react to a language change (e.g. re-render result text)
  document.dispatchEvent(new CustomEvent("languagechange"));

  try { localStorage.setItem("tetragon_lang", currentLang); } catch (e) {}
}

// Build the two OTHER languages next to the current one
function buildOptions() {
  if (!langOptions) return;
  langOptions.innerHTML = "";
  langOrder
    .filter((lang) => lang !== currentLang)
    .forEach((lang) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lang-btn";
      btn.textContent = langLabels[lang];
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyLanguage(lang);
        closeMenu();
      });
      langOptions.appendChild(btn);
    });
}

// open / close helpers
function openMenu() { if (langSwitch) langSwitch.classList.add("open"); }
function closeMenu() { if (langSwitch) langSwitch.classList.remove("open"); }
function toggleMenu() { if (langSwitch) langSwitch.classList.toggle("open"); }

if (langCurrent) {
  langCurrent.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
}
document.addEventListener("click", () => closeMenu());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

// On first load: use the saved language if there is one, otherwise English.
let startLang = "en";
try {
  const saved = localStorage.getItem("tetragon_lang");
  if (saved && translations[saved]) startLang = saved;
} catch (e) {}

applyLanguage(startLang);