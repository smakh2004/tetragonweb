/* =====================================================
   SHARED LANGUAGE SYSTEM (en / ru / uz)
   Used by index.html, mini-games.html, game.html, time.html.
   Edit wording in ONE place: the translations object.
   Keys must match data-i18n="..." in the HTML files.
===================================================== */
const translations = {
  en: {
    download: "Download App",
    login: "Log In",
    math: "math",
    physics: "physics",
    always: "always learn",
    mini: "Mini Games",
    account: "Account",
    // --- auth pages (login / signup) ---
    authLogin: "Log in",
    authSignup: "Create account",
    continueGoogle: "Continue with Google",
    orWord: "or",
    phEmailUser: "email or username",
    phEmail: "email",
    phPassword: "password",
    showWord: "Show",
    hideWord: "Hide",
    forgot: "Forgot password?",
    newHere: "New here?",
    createAccount: "Create account",
    haveAccount: "Already have an account?",
    signUp: "Sign up",
    termsBefore: "By creating an account you agree to our",
    privacyPolicy: "Privacy Policy",
    // --- auth messages ---
    errEnterEmail: "Enter your email.",
    errEnterPassword: "Enter a password.",
    errInvalidEmail: "That email doesn't look right.",
    errUserNotFound: "No account found with that email.",
    errWrongPassword: "Wrong email or password.",
    errEmailInUse: "That email is already registered.",
    errWeakPassword: "Password should be at least 6 characters.",
    errTooMany: "Too many attempts. Try again in a bit.",
    errPopupClosed: "Google sign-in was cancelled.",
    errPopupBlocked: "Your browser blocked the popup. Allow popups and retry.",
    errNetwork: "Network error. Check your connection.",
    errNotAllowed: "This sign-in method isn't enabled in Firebase.",
    errGeneric: "Something went wrong. Please try again.",
    forgotNeedEmail: "Type your email above, then tap Forgot password.",
    resetSent: "Password reset link sent to {email}.",
    // --- account / manage ---
    manageAccount: "Manage Account",
    signOut: "Sign Out",
    loadingWord: "Loading…",
    subscription: "Subscription",
    planFree: "Free",
    planActive: "Active",
    subscribe: "Subscribe",
    subStarted: "Started",
    subEnds: "Ends",
    buySubscription: "Buy subscription",
    subUnlimited: "Unlimited games",
    subUn1: "Unlimited",
    subUn2: "games",
    subBest: "Best value",
    subStartBtn: "Start",
    subSom: "so'm",
    subMo1: "1 month",
    subMo3: "3 months",
    subMo12: "12 months",
    displayNameLabel: "Display name",
    phYourName: "Your name",
    saveWord: "Save",
    newPasswordLabel: "New password",
    phNewPassword: "New password",
    changeWord: "Change",
    googlePassNote: "You signed in with Google — your password is managed by Google.",
    msgSubActivated: "Subscription activated.",
    msgSubFail: "Couldn't activate subscription. Try again.",
    msgEnterName: "Enter a name.",
    msgNameUpdated: "Name updated.",
    msgNameFail: "Couldn't update name. Try again.",
    msgPassShort: "Password should be at least 6 characters.",
    msgPassChanged: "Password changed.",
    msgReauth: "For security, please sign out and sign in again, then change your password.",
    msgPassFail: "Couldn't change password. Try again.",
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
    // --- game type selector ---
    free: "Free",
    premium: "Premium",
    operation: "Operation",
    time: "Time",
    ruler: "Ruler",
    column: "Column Method",
    fraction: "Fractions",
    perimeter: "Perimeter and Area",
    sudoku: "Sudoku",
    notReleased: "Not released",
    fillBlanks: "Fill in the blanks",
    showNumber: "Show the number",
    showAnswer: "Show the answer",
    areaLabel: "Area",
    perimeterLabel: "Perimeter",
    // --- ruler game ---
    showOnRuler: "Show the answer on the ruler",
    cmUnit: "cm",
    // --- time game ---
    showTime: "Show the time",
    // time question — unit words (one / few / many for pluralization)
    hourOne: "hour",  hourFew: "hours",  hourMany: "hours",
    minOne: "minute", minFew: "minutes", minMany: "minutes",
    // {passed} = time that went forward, {returned} = time given back
    qPassedOnly: "If {passed} has passed.",
    qPassedReturned: "If {passed} has passed, {returned} were returned.",
  },
  ru: {
    download: "Скачать",
    login: "Войти",
    math: "математика",
    physics: "физика",
    always: "учись всегда",
    mini: "Мини-игры",
    account: "Аккаунт",
    authLogin: "Войти",
    authSignup: "Создать аккаунт",
    continueGoogle: "Войти через Google",
    orWord: "или",
    phEmailUser: "эл. почта или логин",
    phEmail: "эл. почта",
    phPassword: "пароль",
    showWord: "Показать",
    hideWord: "Скрыть",
    forgot: "Забыли пароль?",
    newHere: "Впервые здесь?",
    createAccount: "Создать аккаунт",
    haveAccount: "Уже есть аккаунт?",
    signUp: "Зарегистрироваться",
    termsBefore: "Создавая аккаунт, вы принимаете нашу",
    privacyPolicy: "Политику конфиденциальности",
    errEnterEmail: "Введите эл. почту.",
    errEnterPassword: "Введите пароль.",
    errInvalidEmail: "Эл. почта выглядит неверно.",
    errUserNotFound: "Аккаунт с такой почтой не найден.",
    errWrongPassword: "Неверная почта или пароль.",
    errEmailInUse: "Эта почта уже зарегистрирована.",
    errWeakPassword: "Пароль должен быть не менее 6 символов.",
    errTooMany: "Слишком много попыток. Повторите позже.",
    errPopupClosed: "Вход через Google отменён.",
    errPopupBlocked: "Браузер заблокировал всплывающее окно. Разрешите его и повторите.",
    errNetwork: "Ошибка сети. Проверьте соединение.",
    errNotAllowed: "Этот способ входа не включён в Firebase.",
    errGeneric: "Что-то пошло не так. Попробуйте снова.",
    forgotNeedEmail: "Введите почту выше, затем нажмите «Забыли пароль».",
    resetSent: "Ссылка для сброса пароля отправлена на {email}.",
    manageAccount: "Управление аккаунтом",
    signOut: "Выйти",
    loadingWord: "Загрузка…",
    subscription: "Подписка",
    planFree: "Бесплатно",
    planActive: "Активна",
    subscribe: "Подписаться",
    subStarted: "Начата",
    subEnds: "Заканчивается",
    buySubscription: "Купить подписку",
    subUnlimited: "Безлимитные игры",
    subUn1: "Безлимитные",
    subUn2: "игры",
    subBest: "Выгодно",
    subStartBtn: "Начать",
    subSom: "сум",
    subMo1: "1 месяц",
    subMo3: "3 месяца",
    subMo12: "12 месяцев",
    displayNameLabel: "Отображаемое имя",
    phYourName: "Ваше имя",
    saveWord: "Сохранить",
    newPasswordLabel: "Новый пароль",
    phNewPassword: "Новый пароль",
    changeWord: "Изменить",
    googlePassNote: "Вы вошли через Google — паролем управляет Google.",
    msgSubActivated: "Подписка активирована.",
    msgSubFail: "Не удалось активировать подписку. Попробуйте снова.",
    msgEnterName: "Введите имя.",
    msgNameUpdated: "Имя обновлено.",
    msgNameFail: "Не удалось обновить имя. Попробуйте снова.",
    msgPassShort: "Пароль должен быть не менее 6 символов.",
    msgPassChanged: "Пароль изменён.",
    msgReauth: "В целях безопасности выйдите и войдите снова, затем измените пароль.",
    msgPassFail: "Не удалось изменить пароль. Попробуйте снова.",
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
    free: "Бесплатно",
    premium: "Премиум",
    operation: "Операции",
    time: "Часы",
    ruler: "Линейка",
    column: "Метод столбика",
    fraction: "Дроби",
    perimeter: "Периметр и площадь",
    sudoku: "Судоку",
    notReleased: "Скоро",
    fillBlanks: "Заполни пропуски",
    showNumber: "Покажи число",
    showAnswer: "Покажи ответ",
    areaLabel: "Площадь",
    perimeterLabel: "Периметр",
    showOnRuler: "Покажи ответ на линейке",
    cmUnit: "см",
    showTime: "Покажи время",
    hourOne: "час",    hourFew: "часа",   hourMany: "часов",
    minOne: "минута",  minFew: "минуты",  minMany: "минут",
    qPassedOnly: "Если прошло {passed}.",
    qPassedReturned: "Если прошло {passed}, а вернули {returned}.",
  },
  uz: {
    download: "Yuklab olish",
    login: "Kirish",
    math: "matematika",
    physics: "fizika",
    always: "bilim ol",
    mini: "Mini o'yinlar",
    account: "Akkaunt",
    authLogin: "Kirish",
    authSignup: "Akkaunt yaratish",
    continueGoogle: "Google orqali kirish",
    orWord: "yoki",
    phEmailUser: "e-pochta yoki login",
    phEmail: "e-pochta",
    phPassword: "parol",
    showWord: "Ko'rsatish",
    hideWord: "Yashirish",
    forgot: "Parolni unutdingizmi?",
    newHere: "Yangimisiz?",
    createAccount: "Akkaunt yaratish",
    haveAccount: "Akkauntingiz bormi?",
    signUp: "Ro'yxatdan o'tish",
    termsBefore: "Akkaunt yaratish orqali siz bizning",
    privacyPolicy: "Maxfiylik siyosatimizga rozilik bildirasiz",
    errEnterEmail: "E-pochtangizni kiriting.",
    errEnterPassword: "Parolni kiriting.",
    errInvalidEmail: "E-pochta noto'g'ri ko'rinadi.",
    errUserNotFound: "Bunday e-pochtali akkaunt topilmadi.",
    errWrongPassword: "E-pochta yoki parol noto'g'ri.",
    errEmailInUse: "Bu e-pochta allaqachon ro'yxatdan o'tgan.",
    errWeakPassword: "Parol kamida 6 ta belgidan iborat bo'lsin.",
    errTooMany: "Urinishlar juda ko'p. Birozdan so'ng qayta urining.",
    errPopupClosed: "Google orqali kirish bekor qilindi.",
    errPopupBlocked: "Brauzer qalqib chiquvchi oynani bloklab qo'ydi. Ruxsat berib qayta urining.",
    errNetwork: "Tarmoq xatosi. Aloqani tekshiring.",
    errNotAllowed: "Bu kirish usuli Firebase'da yoqilmagan.",
    errGeneric: "Xatolik yuz berdi. Qayta urining.",
    forgotNeedEmail: "Yuqoriga e-pochtangizni yozing, so'ng «Parolni unutdingizmi» ni bosing.",
    resetSent: "Parolni tiklash havolasi {email} ga yuborildi.",
    manageAccount: "Akkauntni boshqarish",
    signOut: "Chiqish",
    loadingWord: "Yuklanmoqda…",
    subscription: "Obuna",
    planFree: "Bepul",
    planActive: "Faol",
    subscribe: "Obuna bo'lish",
    subStarted: "Boshlangan",
    subEnds: "Tugaydi",
    buySubscription: "Obuna bo'lish",
    subUnlimited: "Cheksiz o'yinlar",
    subUn1: "Cheksiz",
    subUn2: "o'yinlar",
    subBest: "Manfaatli",
    subStartBtn: "Boshlash",
    subSom: "so'm",
    subMo1: "1 oylik",
    subMo3: "3 oylik",
    subMo12: "12 oylik",
    displayNameLabel: "Ko'rsatiladigan ism",
    phYourName: "Ismingiz",
    saveWord: "Saqlash",
    newPasswordLabel: "Yangi parol",
    phNewPassword: "Yangi parol",
    changeWord: "O'zgartirish",
    googlePassNote: "Siz Google orqali kirdingiz — parolni Google boshqaradi.",
    msgSubActivated: "Obuna faollashtirildi.",
    msgSubFail: "Obunani faollashtirib bo'lmadi. Qayta urining.",
    msgEnterName: "Ism kiriting.",
    msgNameUpdated: "Ism yangilandi.",
    msgNameFail: "Ismni yangilab bo'lmadi. Qayta urining.",
    msgPassShort: "Parol kamida 6 ta belgidan iborat bo'lsin.",
    msgPassChanged: "Parol o'zgartirildi.",
    msgReauth: "Xavfsizlik uchun chiqib, qayta kiring, so'ng parolni o'zgartiring.",
    msgPassFail: "Parolni o'zgartirib bo'lmadi. Qayta urining.",
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
    free: "Bepul",
    premium: "Premium",
    operation: "Amallar",
    time: "Soat",
    ruler: "Chizg'ich",
    column: "Ustun usuli",
    fraction: "Kasrlar",
    perimeter: "Perimetr va yuza",
    sudoku: "Sudoku",
    notReleased: "Tez orada",
    fillBlanks: "Bo'sh joylarni to'ldiring",
    showNumber: "Sonni ko'rsat",
    showAnswer: "Javobni ko'rsat",
    areaLabel: "Yuza",
    perimeterLabel: "Perimetr",
    showOnRuler: "Javobni chizg'ichda ko'rsat",
    cmUnit: "sm",
    showTime: "Vaqtni ko'rsat",
    hourOne: "soat",   hourFew: "soat",   hourMany: "soat",
    minOne: "daqiqa",  minFew: "daqiqa",  minMany: "daqiqa",
    qPassedOnly: "Agar {passed} o'tsa.",
    qPassedReturned: "Agar {passed} o'tib, {returned} qaytarilsa.",
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

  // input placeholders: data-i18n-placeholder="key"
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key] !== undefined) el.setAttribute("placeholder", dict[key]);
  });

  document.documentElement.lang = currentLang;

  if (langCurrent) langCurrent.textContent = langLabels[currentLang];
  buildOptions();

  // let the game react to a language change (e.g. re-render the question)
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