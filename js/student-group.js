/* =====================================================
   STUDENT GROUP (student-group.html?id=<groupId>)
   The group's lessons (start / already done + score) and its leaderboard.
===================================================== */
import {
  currentUser, getGroup, isMember, listLessons, listResults, lessonMaxScore, leaderboard,
} from "./groupstore.js";
import { t, esc, param, renderLeaderboard, initTabs } from "./groupui.js";

const groupId = param("id").toUpperCase();
const $ = (id) => document.getElementById(id);

let me = null, group = null;
let lessons = [], myResults = new Map(), board = [];

function renderRank() {
  const row = board.find((r) => r.uid === me.uid);
  $("myRank").textContent = row
    ? t("yourPosition", "Your position: #{rank} of {total} · {score} points")
        .replace("{rank}", row.rank).replace("{total}", board.length).replace("{score}", row.score)
    : "";
}

function renderLessons() {
  const listEl = $("lessonList");
  if (!lessons.length) {
    listEl.innerHTML = `<p class="gp-empty">${esc(t("noLessonsStudent", "Your teacher hasn't added any lessons yet."))}</p>`;
    return;
  }
  listEl.innerHTML = lessons.map((l) => {
    const max = lessonMaxScore(l);
    const r = myResults.get(l.id);
    const href = `student-lesson.html?group=${encodeURIComponent(groupId)}&lesson=${encodeURIComponent(l.id)}`;
    return `
      <div class="gp-item">
        <div class="gp-item-body">
          <div class="gp-item-title">${esc(l.title)}</div>
          <div class="gp-item-meta">${(l.questions || []).length} ${esc(t("questionsWord", "questions"))} ·
            ${max} ${esc(t("pointsWord", "points"))}</div>
        </div>
        ${!r
          ? `<a class="gp-btn gp-btn--sm" href="${href}">${esc(t("startWord", "Start"))}</a>`
          : r.status !== "finished" && r.stars === 0
          // paused at 0 stars: can still buy a refill and continue
          ? `<a class="gp-btn gp-btn--sm" href="${href}">${esc(t("continueWord", "Continue"))}</a>`
          : `<span class="gp-badge gp-badge--done">${esc(t("doneScore", "Done"))}: ${r.score} / ${max}</span>`}
      </div>`;
  }).join("");
}

function renderAll() {
  renderRank();
  renderLessons();
  renderLeaderboard($("board"), board, me.uid);
}

document.addEventListener("languagechange", () => { if (group) renderAll(); });

(async () => {
  me = await currentUser();
  if (!me) return;   // role-guard redirects
  try {
    group = groupId && await isMember(groupId, me.uid) ? await getGroup(groupId) : null;
  } catch (e) { group = null; }
  $("loading").hidden = true;
  if (!group) { $("notFound").hidden = false; return; }

  document.title = "Tetragon — " + group.name;
  $("groupName").textContent = group.name;
  $("teacherName").textContent = group.teacherName || "";
  $("page").hidden = false;
  initTabs();

  try {
    const [ls, results, lb] = await Promise.all([listLessons(groupId), listResults(groupId), leaderboard(groupId)]);
    lessons = ls;
    myResults = new Map(results.filter((r) => r.uid === me.uid).map((r) => [r.lessonId, r]));
    board = lb;
    renderAll();
  } catch (e) {
    console.error("load group failed:", e);
  }
})();
