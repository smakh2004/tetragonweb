/* =====================================================
   GROUP (group.html?id=<groupId>) — teacher
   One group: its ID to share, its lessons (with each student's result),
   its leaderboard and its students.
===================================================== */
import {
  currentUser, getGroup, deleteGroup, listLessons, deleteLesson, lessonMaxScore,
  listMembers, removeMember, listResults, resetAttempt, leaderboard,
  isPremiumAsync, countTeacherLessons, FREE_MAX_GAMES,
} from "./groupstore.js";
import { t, esc, param, renderLeaderboard, initTabs, copyText } from "./groupui.js";

const groupId = param("id").toUpperCase();

const $ = (id) => document.getElementById(id);
const lessonList  = $("lessonList");
const studentList = $("studentList");
const boardEl     = $("board");

let group = null;
let premium = false;   // free teachers: FREE_MAX_GAMES lessons across all groups
let lessons = [], members = [], results = [], board = [];
const openResults = new Set();   // lesson ids whose results are expanded
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/* ---------- render ---------- */
function resultOf(lessonId, uid) {
  return results.find((r) => r.lessonId === lessonId && r.uid === uid);
}

function renderLessons() {
  if (!lessons.length) {
    lessonList.innerHTML = `<p class="gp-empty">${esc(t("noLessons", "No lessons yet."))}</p>`;
    return;
  }
  lessonList.innerHTML = lessons.map((l) => {
    const done = members.filter((m) => resultOf(l.id, m.uid)).length;
    const max = lessonMaxScore(l);
    const open = openResults.has(l.id);
    const rows = open ? members
      .map((m) => ({ m, r: resultOf(l.id, m.uid) }))
      .sort((a, b) => (b.r ? b.r.score : -1) - (a.r ? a.r.score : -1))
      .map(({ m, r }) => `
        <div class="gp-results-row">
          <span>${esc(m.name)}</span>
          ${r ? `<b>${r.score} / ${max}</b> <span class="gp-sub">${fmtTime(r.timeSpent || 0)}</span>
                 <button class="gp-btn gp-btn--danger gp-btn--sm" type="button"
                   data-act="reset" data-lesson="${l.id}" data-uid="${esc(m.uid)}">${esc(t("resetWord", "Reset"))}</button>`
              : `<span class="gp-badge">${esc(t("notTaken", "Not taken"))}</span>`}
        </div>`).join("") || `<p class="gp-empty">${esc(t("lbEmpty", "No students in this group yet."))}</p>` : "";
    return `
      <div class="gp-item has-results">
        <div class="gp-item-body">
          <div class="gp-item-title">${esc(l.title)}</div>
          <div class="gp-item-meta">
            ${(l.questions || []).length} ${esc(t("questionsWord", "questions"))} ·
            ${max} ${esc(t("pointsWord", "points"))} ·
            ${done}/${members.length} ${esc(t("doneCount", "done"))}
          </div>
        </div>
        <div class="gp-item-actions">
          <button class="gp-btn gp-btn--ghost gp-btn--sm" type="button" data-act="results" data-lesson="${l.id}">
            ${esc(open ? t("hideResults", "Hide results") : t("resultsWord", "Results"))}</button>
          <a class="gp-btn gp-btn--ghost gp-btn--sm" href="group-lesson.html?group=${encodeURIComponent(groupId)}&lesson=${encodeURIComponent(l.id)}">
            ${esc(t("editWord", "Edit"))}</a>
          <button class="gp-btn gp-btn--danger gp-btn--sm" type="button" data-act="delete" data-lesson="${l.id}">
            ${esc(t("deleteWord", "Delete"))}</button>
        </div>
        ${open ? `<div class="gp-results">${rows}</div>` : ""}
      </div>`;
  }).join("");
}

function renderStudents() {
  if (!members.length) {
    studentList.innerHTML = `<p class="gp-empty">${esc(t("noStudents", "No students yet. Share the group ID so they can join."))}</p>`;
    return;
  }
  studentList.innerHTML = [...members].sort((a, b) => a.name.localeCompare(b.name)).map((m) => `
    <div class="gp-item">
      <div class="gp-item-body">
        <div class="gp-item-title">${esc(m.name)}</div>
        <div class="gp-item-meta">${esc(m.email)}</div>
      </div>
      <button class="gp-btn gp-btn--danger gp-btn--sm" type="button" data-act="remove" data-uid="${esc(m.uid)}">
        ${esc(t("removeWord", "Remove"))}</button>
    </div>`).join("");
}

function renderAll() {
  renderLessons();
  renderStudents();
  renderLeaderboard(boardEl, board);
}

async function refresh() {
  [lessons, members, results, board] = await Promise.all([
    listLessons(groupId), listMembers(groupId), listResults(groupId), leaderboard(groupId),
  ]);
  renderAll();
}

/* ---------- actions ---------- */
lessonList.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const lessonId = b.dataset.lesson;
  if (b.dataset.act === "results") {
    openResults.has(lessonId) ? openResults.delete(lessonId) : openResults.add(lessonId);
    renderLessons();
  } else if (b.dataset.act === "delete") {
    if (!confirm(t("confirmDeleteLesson", "Delete this lesson and all students' results for it?"))) return;
    b.disabled = true;
    await deleteLesson(groupId, lessonId).catch((err) => console.error(err));
    await refresh();
  } else if (b.dataset.act === "reset") {
    if (!confirm(t("confirmReset", "Delete this student's result so they can take the lesson again?"))) return;
    b.disabled = true;
    await resetAttempt(groupId, lessonId, b.dataset.uid).catch((err) => console.error(err));
    await refresh();
  }
});

studentList.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act=remove]");
  if (!b) return;
  if (!confirm(t("confirmRemoveStudent", "Remove this student from the group?"))) return;
  b.disabled = true;
  await removeMember(groupId, b.dataset.uid).catch((err) => console.error(err));
  await refresh();
});

$("copyBtn").addEventListener("click", (e) => copyText(groupId, e.currentTarget));

// free teachers: block "Create lesson" once they have FREE_MAX_GAMES lessons in all groups
$("newLessonBtn").addEventListener("click", async (e) => {
  if (premium) return;
  e.preventDefault();
  const href = e.currentTarget.href;
  const msg = $("lessonMsg");
  const have = await countTeacherLessons(group.teacherId).catch(() => 0);
  if (have < FREE_MAX_GAMES) { location.href = href; return; }
  msg.textContent = t("gameLimitReached", "Free plan: up to {max} lessons.").replace("{max}", FREE_MAX_GAMES) + " ";
  const a = document.createElement("a");
  a.href = "subscription.html";
  a.textContent = t("subscribe", "Subscribe");
  msg.appendChild(a);
  msg.hidden = false;
});

$("deleteGroupBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (!confirm(t("confirmDeleteGroup", "Delete this group, its lessons and all results? This can't be undone."))) return;
  btn.disabled = true;
  try {
    await deleteGroup(groupId);
    location.href = "groups.html";
  } catch (err) {
    console.error("delete group failed:", err);
    btn.disabled = false;
  }
});

document.addEventListener("languagechange", () => { if (group) renderAll(); });

/* ---------- boot ---------- */
(async () => {
  const user = await currentUser();
  if (!user) return;   // role-guard redirects
  try {
    group = groupId ? await getGroup(groupId) : null;
  } catch (e) { group = null; }
  $("loading").hidden = true;
  if (!group || group.teacherId !== user.uid) { group = null; $("notFound").hidden = false; return; }

  document.title = "Tetragon — " + group.name;
  $("groupName").textContent = group.name;
  $("groupId").textContent = groupId;
  $("newLessonBtn").href = "group-lesson.html?group=" + encodeURIComponent(groupId);
  premium = await isPremiumAsync(user.uid).catch(() => false);
  $("page").hidden = false;
  initTabs();
  try { await refresh(); } catch (e) { console.error("load group failed:", e); }
})();
