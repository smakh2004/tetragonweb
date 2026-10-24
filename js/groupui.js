/* =====================================================
   GROUP-UI — small helpers shared by the group pages
===================================================== */

// translate a key via the shared language system; fall back to English text
export function t(key, fallback) {
  try {
    const v = window.getText && window.getText(key);
    return (v && v !== key) ? v : fallback;
  } catch (e) { return fallback; }
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function param(name) {
  return new URLSearchParams(location.search).get(name) || "";
}

// Ranked list; the signed-in student's row is highlighted.
export function renderLeaderboard(el, rows, meUid) {
  if (!rows.length) {
    el.innerHTML = `<p class="gp-empty">${esc(t("lbEmpty", "No students in this group yet."))}</p>`;
    return;
  }
  el.innerHTML = `<ol class="lb">${rows.map((r) => `
    <li class="lb-row${r.uid === meUid ? " me" : ""}${r.rank <= 3 ? " top" + r.rank : ""}">
      <span class="lb-rank">${r.rank}</span>
      <span class="lb-name">${esc(r.name)}${r.uid === meUid ? ` <em>(${esc(t("youWord", "you"))})</em>` : ""}</span>
      <span class="lb-lessons">${r.lessons} ${esc(t("lessonsWord", "lessons"))}</span>
      <span class="lb-score">${r.score}</span>
    </li>`).join("")}</ol>`;
}

// Tabs: <button class="gp-tab" data-tab="x"> + <section data-panel="x">
export function initTabs(root = document) {
  const tabs = root.querySelectorAll(".gp-tab");
  const show = (name) => {
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  };
  tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  if (tabs[0]) show(tabs[0].dataset.tab);
  return show;
}

export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = t("copiedWord", "Copied!");
    setTimeout(() => { btn.textContent = old; }, 1400);
  } catch (e) {}
}
