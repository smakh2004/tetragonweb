/* =====================================================
   LESSON EDIT PAGE  (lesson-edit.html)   — matches mockup image 3
   Build a lesson: a name + question blocks (A / B / C, radio marks the
   correct one, per-question Delete), "Add question", then "Create lesson"
   writes the whole thing to Firestore at once.

   Entry modes:
     lesson-edit.html            -> NEW lesson (starts with 1 empty question)
     lesson-edit.html?game=<id>  -> EDIT: loads the name + all saved questions;
                                    the button reads "Save" and updateLesson()
                                    replaces the lesson's question set.

   Free teachers: at most FREE_MAX_QUESTIONS questions (Add question is
   blocked past the cap); creating a NEW lesson past FREE_MAX_GAMES is
   rejected on save with a nudge to subscribe.
===================================================== */
import {
  currentUser, isPremiumAsync,
  getGame, listQuestions, createLesson, updateLesson,
  FREE_MAX_QUESTIONS, FREE_MAX_GAMES,
} from "./lesson-store.js";

const T = (k) => (window.getText ? window.getText(k) : k);
function show(el, on = true) { if (el) el.hidden = !on; }

const loadingEl = document.getElementById("loading");
const signedOut = document.getElementById("signedOut");
const editWrap  = document.getElementById("editWrap");
const nameInput = document.getElementById("lessonName");
const qList     = document.getElementById("questionsList");
const addQBtn   = document.getElementById("addQBtn");
const createBtn = document.getElementById("createBtn");
const msg       = document.getElementById("msg");

const OPT_LETTERS = ["A", "B", "C"];

let uid = null;
let premium = false;
let gameId = null;         // set when editing an existing lesson
let questions = [];        // [{ text, options:[a,b,c], correct }]

function setMsg(text, ok) {
  if (!text) { show(msg, false); return; }
  msg.textContent = text;
  msg.className = "edit-msg" + (ok ? " ok" : "");
  show(msg, true);
}

async function boot() {
  const user = await currentUser();
  // not signed in -> go straight to the signup page (come back here after)
  if (!user) {
    const here = "lesson-edit.html" + location.search;   // keep ?game=<id> if editing
    window.location.replace("signup.html?next=" + encodeURIComponent(here));
    return;
  }
  uid = user.uid;
  premium = await isPremiumAsync(uid);

  const params = new URLSearchParams(location.search);
  gameId = params.get("game");

  if (gameId) {
    const game = await getGame(gameId);
    if (game) {
      nameInput.value = game.title || "";
      const qs = await listQuestions(gameId).catch(() => []);
      questions = qs.map((q) => ({
        text: q.text || "",
        options: (q.options && q.options.slice(0, 3)) || ["", "", ""],
        correct: typeof q.correct === "number" ? q.correct : 0,
      }));
      createBtn.textContent = T("saveWord");   // editing -> "Save"
    } else {
      gameId = null;
    }
  }

  if (questions.length === 0) questions.push(blankQuestion());

  show(loadingEl, false);
  show(editWrap, true);
  renderQuestions();
  updateAddBtn();
}

function blankQuestion() { return { text: "", options: ["", "", ""], correct: 0 }; }

function renderQuestions() {
  qList.innerHTML = "";
  questions.forEach((q, qi) => {
    const block = document.createElement("div");
    block.className = "q-block";

    // header: "Question N"  +  Delete
    const head = document.createElement("div");
    head.className = "q-head";
    const title = document.createElement("span");
    title.className = "q-title";
    title.textContent = T("questionLabel") + " " + (qi + 1);
    head.appendChild(title);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "q-del";
    del.textContent = T("deleteWord");
    del.addEventListener("click", () => {
      questions.splice(qi, 1);
      if (questions.length === 0) questions.push(blankQuestion());
      renderQuestions();
      updateAddBtn();
    });
    head.appendChild(del);
    block.appendChild(head);

    // question text
    const qt = document.createElement("input");
    qt.type = "text";
    qt.className = "q-text-input";
    qt.value = q.text;
    qt.placeholder = "";
    qt.addEventListener("input", () => { q.text = qt.value; });
    block.appendChild(qt);

    // 3 options: letter + radio (correct) + text
    q.options.forEach((optText, oi) => {
      const row = document.createElement("div");
      row.className = "q-opt-row";

      const letter = document.createElement("span");
      letter.className = "q-opt-letter" + (q.correct === oi ? " active" : "");
      letter.textContent = OPT_LETTERS[oi];
      row.appendChild(letter);

      const radioWrap = document.createElement("label");
      radioWrap.className = "q-opt-radio";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "correct-" + qi;
      radio.checked = q.correct === oi;
      radio.addEventListener("change", () => {
        q.correct = oi;
        // recolor the active letter without a full re-render
        block.querySelectorAll(".q-opt-letter").forEach((el, idx) =>
          el.classList.toggle("active", idx === oi));
      });
      const dot = document.createElement("span");
      dot.className = "q-opt-dot";
      radioWrap.appendChild(radio);
      radioWrap.appendChild(dot);
      row.appendChild(radioWrap);

      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "q-opt-input";
      inp.value = optText;
      inp.addEventListener("input", () => { q.options[oi] = inp.value; });
      row.appendChild(inp);

      block.appendChild(row);
    });

    qList.appendChild(block);
  });
}

function updateAddBtn() {
  const maxed = !premium && questions.length >= FREE_MAX_QUESTIONS;
  addQBtn.classList.toggle("is-disabled", maxed);
  if (maxed) setMsg(T("questionLimitReached").replace("{max}", FREE_MAX_QUESTIONS));
  else setMsg("");
}

addQBtn.addEventListener("click", () => {
  if (addQBtn.classList.contains("is-disabled")) return;
  questions.push(blankQuestion());
  renderQuestions();
  updateAddBtn();
  // scroll the new question into view
  const scroll = document.getElementById("editScroll");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
});

/* ---------- validate + save ---------- */
function validate() {
  const name = nameInput.value.trim();
  if (!name) return { ok: false, err: T("needName") };
  if (questions.length === 0) return { ok: false, err: T("needQuestions") };
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.text.trim() || q.options.some((o) => !o.trim())) {
      return { ok: false, err: T("fillAllFields") };
    }
  }
  return { ok: true, name };
}

createBtn.addEventListener("click", async () => {
  if (createBtn.classList.contains("busy")) return;
  const v = validate();
  if (!v.ok) { setMsg(v.err); return; }

  createBtn.classList.add("busy");
  setMsg("");

  try {
    if (gameId) {
      await updateLesson(gameId, v.name, questions, premium);
    } else {
      await createLesson(uid, v.name, questions, premium);
    }
    window.location.href = "lessons.html";
  } catch (e) {
    createBtn.classList.remove("busy");
    if (e && e.code === "GAME_LIMIT") {
      setMsg(T("gameLimitReached").replace("{max}", FREE_MAX_GAMES));
    } else if (e && e.code === "QUESTION_LIMIT") {
      setMsg(T("questionLimitReached").replace("{max}", FREE_MAX_QUESTIONS));
    } else {
      console.error("save lesson failed:", e);
      setMsg(T("saveFailed"));
    }
  }
});

document.addEventListener("languagechange", () => {
  createBtn.textContent = gameId ? T("saveWord") : T("createLesson");
  renderQuestions();
  updateAddBtn();
});

boot();