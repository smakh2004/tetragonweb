/* =====================================================
   MY GROUPS (groups.html) — teacher
   Lists the teacher's groups and creates new ones.
   Each group gets a short ID that students type to join.
===================================================== */
import { currentUser, createGroup, listTeacherGroups } from "./groupstore.js";
import { t, esc } from "./groupui.js";

const form    = document.getElementById("createForm");
const nameEl  = document.getElementById("groupName");
const btn     = document.getElementById("createBtn");
const msg     = document.getElementById("msg");
const listEl  = document.getElementById("groupList");

let user = null;
let groups = null;   // null until loaded

function setMsg(text) { msg.textContent = text || ""; msg.hidden = !text; }

function render() {
  if (!groups) return;
  if (!groups.length) {
    listEl.innerHTML = `<p class="gp-empty">${esc(t("noGroups", "No groups yet. Create your first one above."))}</p>`;
    return;
  }
  listEl.innerHTML = groups.map((g) => `
    <a class="gp-item" href="group.html?id=${encodeURIComponent(g.id)}">
      <div class="gp-item-body">
        <div class="gp-item-title">${esc(g.name)}</div>
        <div class="gp-item-meta">${esc(t("groupIdLabel", "Group ID"))}</div>
      </div>
      <span class="gp-code">${esc(g.id)}</span>
    </a>`).join("");
}

async function load() {
  try {
    groups = await listTeacherGroups(user.uid);
    render();
  } catch (e) {
    console.error("load groups failed:", e);
    listEl.innerHTML = `<p class="gp-empty">${esc(t("loadFailed", "Couldn't load. Refresh the page to try again."))}</p>`;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameEl.value.trim();
  if (!name) { setMsg(t("needGroupName", "Enter a group name.")); nameEl.focus(); return; }
  btn.disabled = true;
  setMsg("");
  try {
    const id = await createGroup(user, name);
    location.href = "group.html?id=" + encodeURIComponent(id);
  } catch (err) {
    console.error("create group failed:", err);
    setMsg(t("saveFailed", "Couldn't save. Try again."));
    btn.disabled = false;
  }
});

document.addEventListener("languagechange", () => { if (user) render(); });

(async () => {
  user = await currentUser();
  if (user) load();
})();
