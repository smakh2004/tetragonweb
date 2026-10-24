/* =====================================================
   GROUP LESSON EDITOR (group-lesson.html) — teacher
     group-lesson.html?group=<id>               -> NEW lesson in that group
     group-lesson.html?group=<id>&lesson=<id>   -> EDIT that lesson
   Each question: text, 4 options (radio marks the correct one),
   time limit in seconds and the points it is worth.
   Free teachers: FREE_MAX_QUESTIONS questions per lesson and FREE_MAX_GAMES
   lessons across all their groups; premium teachers: unlimited.
===================================================== */
import {
  currentUser, getGroup, getLesson, saveLesson, isPremiumAsync,
  OPTION_COUNT, DEFAULT_TIME, DEFAULT_SCORE, FREE_MAX_GAMES, FREE_MAX_QUESTIONS,
} from "./groupstore.js";
import { t, param } from "./groupui.js";

const groupId  = param("group").toUpperCase();
let   lessonId = param("lesson");

const $ = (id) => document.getElementById(id);
const nameInput = $("lessonName");
const qList     = $("questionsList");
const saveBtn   = $("saveBtn");
const msg       = $("msg");
const totalEl   = $("total");

const LETTERS = ["A", "B", "C", "D"];
let questions = [];   // [{ text, options:[a,b,c,d], correct, time, score }]
let user = null;
let premium = false;  // free teachers: FREE_MAX_QUESTIONS per lesson, FREE_MAX_GAMES lessons

function blankQuestion() {
  return { text: "", options: Array(OPTION_COUNT).fill(""), correct: 0, time: DEFAULT_TIME, score: DEFAULT_SCORE };
}

function setMsg(text, ok, subscribeLink) {
  msg.textContent = text || "";
  if (subscribeLink) {
    const a = el("a", "", { href: "subscription.html", textContent: " " + t("subscribe", "Subscribe") });
    msg.appendChild(a);
  }
  msg.className = "edit-msg" + (ok ? " ok" : "");
  msg.hidden = !text;
}

function updateTotal() {
  const pts  = questions.reduce((s, q) => s + (Number(q.score) || 0), 0);
  const secs = questions.reduce((s, q) => s + (Number(q.time) || 0), 0);
  totalEl.textContent = `${questions.length} ${t("questionsWord", "questions")} · ${pts} ${t("pointsWord", "points")} · ` +
    `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function el(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

function numberField(labelText, value, min, onInput) {
  const wrap = el("label", "q-meta");
  wrap.append(labelText);
  const inp = el("input", "q-num", { type: "number", min: String(min), step: "1", value: String(value) });
  inp.addEventListener("input", () => { onInput(inp.value); updateTotal(); });
  wrap.appendChild(inp);
  return wrap;
}

function renderQuestions() {
  qList.innerHTML = "";
  questions.forEach((q, qi) => {
    const block = el("div", "q-block");

    // header: "Question N" + Delete
    const head = el("div", "q-head");
    head.appendChild(el("span", "q-title", { textContent: t("questionLabel", "Question") + " " + (qi + 1) }));
    const del = el("button", "q-del", { type: "button", textContent: t("deleteWord", "Delete") });
    del.addEventListener("click", () => {
      questions.splice(qi, 1);
      if (!questions.length) questions.push(blankQuestion());
      renderQuestions();
    });
    head.appendChild(del);
    block.appendChild(head);

    const qt = el("input", "q-text-input", { type: "text", value: q.text });
    qt.addEventListener("input", () => { q.text = qt.value; });
    block.appendChild(qt);

    // time + score
    const meta = el("div", "q-meta-row");
    meta.appendChild(numberField(t("timeSecLabel", "Time (sec)"), q.time, 5, (v) => { q.time = v; }));
    meta.appendChild(numberField(t("pointsLabel", "Points"), q.score, 1, (v) => { q.score = v; }));
    block.appendChild(meta);

    // options: letter + radio (correct) + text
    q.options.forEach((optText, oi) => {
      const row = el("div", "q-opt-row");
      row.appendChild(el("span", "q-opt-letter" + (q.correct === oi ? " active" : ""), { textContent: LETTERS[oi] }));

      const radioWrap = el("label", "q-opt-radio");
      const radio = el("input", "", { type: "radio", name: "correct-" + qi, checked: q.correct === oi });
      radio.addEventListener("change", () => {
        q.correct = oi;
        block.querySelectorAll(".q-opt-letter").forEach((l, idx) => l.classList.toggle("active", idx === oi));
      });
      radioWrap.append(radio, el("span", "q-opt-dot"));
      row.appendChild(radioWrap);

      const inp = el("input", "q-opt-input", { type: "text", value: optText });
      inp.addEventListener("input", () => { q.options[oi] = inp.value; });
      row.appendChild(inp);

      block.appendChild(row);
    });

    qList.appendChild(block);
  });
  updateTotal();
  updateAddBtn();
}

function updateAddBtn() {
  const maxed = !premium && questions.length >= FREE_MAX_QUESTIONS;
  $("addQBtn").classList.toggle("is-disabled", maxed);
  if (maxed) setMsg(t("questionLimitReached", "Free plan: up to {max} questions per lesson.").replace("{max}", FREE_MAX_QUESTIONS), false, true);
  else if (msg.querySelector("a")) setMsg("");
}

$("addQBtn").addEventListener("click", () => {
  if ($("addQBtn").classList.contains("is-disabled")) return;
  // new question copies the previous one's time + points
  const last = questions[questions.length - 1];
  const q = blankQuestion();
  if (last) { q.time = last.time; q.score = last.score; }
  questions.push(q);
  renderQuestions();
  const scroll = $("editScroll");
  scroll.scrollTop = scroll.scrollHeight;
});

function validate() {
  if (!nameInput.value.trim()) return t("needName", "Enter a lesson name.");
  for (const q of questions) {
    if (!q.text.trim() || q.options.some((o) => !o.trim())) return t("fillAllFields4", "Fill in every question and all 4 options.");
    if (!(Number(q.time) >= 5)) return t("needTime", "Each question needs at least 5 seconds.");
    if (!(Number(q.score) >= 1)) return t("needPoints", "Each question needs at least 1 point.");
  }
  return "";
}

saveBtn.addEventListener("click", async () => {
  if (saveBtn.classList.contains("busy")) return;
  const err = validate();
  if (err) { setMsg(err); return; }
  saveBtn.classList.add("busy");
  setMsg("");
  try {
    await saveLesson(groupId, lessonId, nameInput.value, questions, { uid: user.uid, premium });
    location.href = "group.html?id=" + encodeURIComponent(groupId);
  } catch (e) {
    if (!e.code) console.error("save group lesson failed:", e);
    saveBtn.classList.remove("busy");
    if (e.code === "GAME_LIMIT") {
      setMsg(t("gameLimitReached", "Free plan: up to {max} lessons.").replace("{max}", FREE_MAX_GAMES), false, true);
    } else if (e.code === "QUESTION_LIMIT") {
      setMsg(t("questionLimitReached", "Free plan: up to {max} questions per lesson.").replace("{max}", FREE_MAX_QUESTIONS), false, true);
    } else {
      setMsg(t("saveFailed", "Couldn't save. Try again."));
    }
  }
});

function labelSave() {
  saveBtn.textContent = lessonId ? t("saveWord", "Save") : t("createLesson", "Create lesson");
}

document.addEventListener("languagechange", () => { labelSave(); renderQuestions(); });

/* ---------- boot ---------- */
(async () => {
  user = await currentUser();
  if (!user) return;   // role-guard redirects
  premium = await isPremiumAsync(user.uid).catch(() => false);
  let group = null;
  try { group = groupId ? await getGroup(groupId) : null; } catch (e) {}
  $("loading").hidden = true;
  if (!group || group.teacherId !== user.uid) { $("notFound").hidden = false; return; }

  $("backLink").href = "group.html?id=" + encodeURIComponent(groupId);
  $("backName").textContent = group.name;

  if (lessonId) {
    const lesson = await getLesson(groupId, lessonId).catch(() => null);
    if (lesson) {
      nameInput.value = lesson.title || "";
      questions = (lesson.questions || []).map((q) => ({ ...q, options: [...q.options] }));
    } else {
      lessonId = "";
    }
  }
  if (!questions.length) questions.push(blankQuestion());

  labelSave();
  renderQuestions();
  $("page").hidden = false;
})();
