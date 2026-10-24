/* =====================================================
   STUDENT HOME (student.html)
   Join a group with the ID from the teacher, and list joined groups.
===================================================== */
import { currentUser, joinGroup, listStudentGroups, normalizeCode } from "./groupstore.js";
import { t, esc } from "./groupui.js";

const form   = document.getElementById("joinForm");
const codeEl = document.getElementById("joinCode");
const btn    = document.getElementById("joinBtn");
const msg    = document.getElementById("msg");
const listEl = document.getElementById("groupList");

let user = null;
let groups = null;   // null until loaded

function setMsg(text) { msg.textContent = text || ""; msg.hidden = !text; }

function render() {
  if (!groups) return;
  if (!groups.length) {
    listEl.innerHTML = `<p class="gp-empty">${esc(t("noJoinedGroups", "You haven't joined a group yet. Ask your teacher for the group ID."))}</p>`;
    return;
  }
  listEl.innerHTML = groups.map((g) => `
    <a class="gp-item" href="student-group.html?id=${encodeURIComponent(g.id)}">
      <div class="gp-item-body">
        <div class="gp-item-title">${esc(g.name)}</div>
        <div class="gp-item-meta">${esc(t("teacherWord", "Teacher"))}: ${esc(g.teacherName)}</div>
      </div>
      <span class="gp-code">${esc(g.id)}</span>
    </a>`).join("");
}

async function load() {
  try {
    groups = await listStudentGroups(user.uid);
    render();
  } catch (e) {
    console.error("load groups failed:", e);
    listEl.innerHTML = `<p class="gp-empty">${esc(t("loadFailed", "Couldn't load. Refresh the page to try again."))}</p>`;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = normalizeCode(codeEl.value);
  if (!code) { setMsg(t("needGroupId", "Enter the group ID from your teacher.")); codeEl.focus(); return; }
  btn.disabled = true;
  setMsg("");
  try {
    await joinGroup(user, code);
    location.href = "student-group.html?id=" + encodeURIComponent(code);
  } catch (err) {
    if (err.code !== "NOT_FOUND") console.error("join group failed:", err);
    setMsg(err.code === "NOT_FOUND"
      ? t("groupNotFoundId", "No group with that ID. Check it and try again.")
      : t("saveFailed", "Couldn't save. Try again."));
    btn.disabled = false;
  }
});

document.addEventListener("languagechange", render);

(async () => {
  user = await currentUser();
  if (user) load();
})();
