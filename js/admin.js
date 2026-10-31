/* =====================================================
   TETRAGON — Admin dashboard (admin.html)
   Only the email(s) in js/admin-config.js can open it, and the
   Firestore rules (isAdmin) enforce the same thing server-side.

   Data sources:
     users/{uid}               registered accounts, role, subscription
     click_transactions/{id}   Click payments (written by functions/index.js)
     presence/{uid}            heartbeat from js/track.js  -> online / last active
     visits/{YYYY-MM-DD}       visit counter from js/track.js
     groups, lessonGames       counted only
===================================================== */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, onSnapshot, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { isAdminEmail } from "./admin-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const ONLINE_MS = 5 * 60 * 1000;
const DAY_MS    = 24 * 60 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const show = (id) => ["adminLoading", "adminDenied", "adminVerify", "adminBody"]
  .forEach((x) => { $(x).hidden = x !== id; });

/* ---------- state ---------- */
let users = [];          // merged rows
let payments = [];       // click_transactions
let presence = new Map();// uid -> { lastSeen: Date, page, email }
let visits = new Map();  // "YYYY-MM-DD" -> count
let sort = { key: "createdAt", dir: -1 };
let stopPresence = null;

/* ---------- helpers ---------- */
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
const pad = (n) => String(n).padStart(2, "0");
function dayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function fmtDate(d) { return d ? pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() : "—"; }
function fmtDateTime(d) { return d ? fmtDate(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) : "—"; }
function fmtNum(n) { return Number(n || 0).toLocaleString("en-US").replace(/,/g, " "); }
function fmtSum(n) { return fmtNum(n) + " so'm"; }
function ago(d) {
  if (!d) return "never";
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 86400 * 30) return Math.floor(s / 86400) + " d ago";
  return fmtDate(d);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function lastSeenOf(u) { const p = presence.get(u.uid); return p ? p.lastSeen : null; }
function isOnline(u) { const d = lastSeenOf(u); return !!d && Date.now() - d < ONLINE_MS; }

function showError(msg) { $("adminError").hidden = !msg; $("adminError").textContent = msg || ""; }

/* ---------- auth gate ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("login.html?next=admin.html"); return; }
  if (!isAdminEmail(user.email)) { show("adminDenied"); return; }
  if (!user.emailVerified) { show("adminVerify"); return; }
  $("adminEmail").textContent = user.email;
  show("adminBody");
  await loadAll();
  watchPresence();
});

$("sendVerifyBtn").onclick = async () => {
  try {
    await sendEmailVerification(auth.currentUser);
    $("verifyMsg").textContent = "Sent to " + auth.currentUser.email + ". Open the link, then reload.";
  } catch (e) { $("verifyMsg").textContent = "Couldn't send: " + (e.code || e.message); }
};
$("verifyDoneBtn").onclick = async () => {
  try { await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); } catch (e) {}
  location.reload();
};
$("signoutBtn").onclick = async () => {
  try { await signOut(auth); } catch (e) {}
  location.href = "login.html";
};
$("refreshBtn").onclick = async () => {
  $("refreshBtn").disabled = true;
  await loadAll();
  $("refreshBtn").disabled = false;
};

/* ---------- loading ---------- */
async function safe(label, p, fallback) {
  try { return await p; }
  catch (e) {
    console.error(label, e);
    errors.push(label + (e.code === "permission-denied" ? " (permission denied — deploy firestore.rules)" : ": " + (e.code || e.message)));
    return fallback;
  }
}
let errors = [];

async function loadAll() {
  errors = [];
  const [uSnap, tSnap, vSnap, gCount, lCount, pSnap] = await Promise.all([
    safe("users", getDocs(collection(db, "users")), null),
    safe("payments", getDocs(collection(db, "click_transactions")), null),
    safe("visits", getDocs(collection(db, "visits")), null),
    safe("groups", getCountFromServer(collection(db, "groups")), null),
    safe("lessons", getCountFromServer(collection(db, "lessonGames")), null),
    safe("presence", getDocs(collection(db, "presence")), null),
  ]);
  showError(errors.length ? "Couldn't load: " + errors.join(" · ") : "");

  if (pSnap) setPresence(pSnap);

  payments = tSnap ? tSnap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, uid: x.uid || "", plan: x.plan || "", amount: Number(x.amount) || 0,
             status: x.status || "", created: toDate(x.created), applied: x.applied };
  }) : [];

  // paid totals per user
  const paidBy = new Map();
  payments.filter((p) => p.status === "paid").forEach((p) => {
    const t = paidBy.get(p.uid) || { sum: 0, n: 0 };
    t.sum += p.amount; t.n += 1; paidBy.set(p.uid, t);
  });

  const now = Date.now();
  users = uSnap ? uSnap.docs.map((d) => {
    const x = d.data();
    const planExpires = toDate(x.planExpires);
    let status = "free";
    if (x.subscription === "active") status = planExpires && planExpires.getTime() < now ? "expired" : "paid";
    const t = paidBy.get(d.id) || { sum: 0, n: 0 };
    return {
      uid: d.id,
      email: x.email || (presence.get(d.id) || {}).email || "",
      name: x.displayName || "",
      role: x.role || "teacher",
      status,
      plan: x.plan || "",
      createdAt: toDate(x.createdAt),
      paidAt: toDate(x.paidAt),
      planExpires,
      totalPaid: t.sum,
      payCount: t.n,
    };
  }) : [];

  visits = new Map(vSnap ? vSnap.docs.map((d) => [d.id, Number(d.data().count) || 0]) : []);

  $("kGroups").textContent  = gCount ? fmtNum(gCount.data().count) : "—";
  $("kLessons").textContent = lCount ? fmtNum(lCount.data().count) : "—";

  renderAll();
}

function setPresence(snap) {
  presence = new Map(snap.docs.map((d) => {
    const x = d.data();
    return [d.id, { lastSeen: toDate(x.lastSeen), page: x.page || "", email: x.email || "" }];
  }));
}

function watchPresence() {
  if (stopPresence) stopPresence();
  stopPresence = onSnapshot(collection(db, "presence"), (snap) => {
    setPresence(snap);
    renderAll();
  }, (e) => console.error("presence", e));
  // "online" depends on the clock too, so re-check every 30s
  if (!watchPresence.timer) watchPresence.timer = setInterval(renderAll, 30 * 1000);
}

/* ---------- render ---------- */
function renderAll() {
  renderStats();
  renderCharts();
  renderUsers();
  renderPayments();
  renderOnline();
  $("updated").textContent = fmtDateTime(new Date());
}

function renderStats() {
  const now = Date.now();
  const today = startOfToday().getTime();
  const total = users.length;
  const online = users.filter(isOnline).length;
  const active = (ms) => users.filter((u) => { const d = lastSeenOf(u); return d && now - d < ms; }).length;
  const newer = (ms) => users.filter((u) => u.createdAt && now - u.createdAt < ms).length;
  const paid = users.filter((u) => u.status === "paid");
  const expiring = paid.filter((u) => u.planExpires && u.planExpires - now < 7 * DAY_MS).length;

  $("kOnline").textContent   = fmtNum(online);
  $("kActive24").textContent = fmtNum(active(DAY_MS));
  $("kActive7").textContent  = fmtNum(active(7 * DAY_MS));

  $("kTotal").textContent    = fmtNum(total);
  $("kNewToday").textContent = fmtNum(users.filter((u) => u.createdAt && u.createdAt >= today).length);
  $("kNew7").textContent     = fmtNum(newer(7 * DAY_MS));
  $("kNew30").textContent    = fmtNum(newer(30 * DAY_MS));

  $("kPaid").textContent     = fmtNum(paid.length);
  $("kConv").textContent     = total ? (paid.length / total * 100).toFixed(1) + "%" : "0%";
  $("kExpired").textContent  = fmtNum(users.filter((u) => u.status === "expired").length);
  $("kExpiring").textContent = fmtNum(expiring);

  const ok = payments.filter((p) => p.status === "paid");
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  $("kRevenue").textContent  = fmtSum(ok.reduce((s, p) => s + p.amount, 0));
  $("kRevMonth").textContent = fmtSum(ok.filter((p) => p.created && p.created >= monthStart).reduce((s, p) => s + p.amount, 0));
  $("kPayCount").textContent = fmtNum(ok.length);

  const todayKey = dayKey(new Date());
  let v30 = 0, vAll = 0;
  const cutoff = dayKey(new Date(now - 29 * DAY_MS));
  visits.forEach((n, k) => { vAll += n; if (k >= cutoff) v30 += n; });
  $("kVisitsToday").textContent = fmtNum(visits.get(todayKey) || 0);
  $("kVisits30").textContent    = fmtNum(v30);
  $("kVisitsAll").textContent   = fmtNum(vAll);

  $("kTeachers").textContent = fmtNum(users.filter((u) => u.role === "teacher").length);
  $("kStudents").textContent = fmtNum(users.filter((u) => u.role === "student").length);

  const per = {};
  paid.forEach((u) => { const k = cap(u.plan) || "Unknown"; per[k] = (per[k] || 0) + 1; });
  const parts = Object.entries(per).map(([k, n]) => `${n} ${k}`);
  $("kPlans").textContent = parts.length ? parts.join(" · ") : "none yet";

  $("tnUsers").textContent = fmtNum(total);
  $("tnPayments").textContent = fmtNum(ok.length);
  $("tnOnline").textContent = fmtNum(online);
}

/* ----- charts: one series each, simple bars with hover tooltip ----- */
function last30Days() {
  const out = [];
  const d = startOfToday();
  d.setDate(d.getDate() - 29);
  for (let i = 0; i < 30; i++) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return out;
}

function renderCharts() {
  const days = last30Days();
  const keys = days.map(dayKey);

  const signups = Object.fromEntries(keys.map((k) => [k, 0]));
  users.forEach((u) => { if (u.createdAt) { const k = dayKey(u.createdAt); if (k in signups) signups[k]++; } });

  const revenue = Object.fromEntries(keys.map((k) => [k, 0]));
  payments.forEach((p) => {
    if (p.status === "paid" && p.created) { const k = dayKey(p.created); if (k in revenue) revenue[k] += p.amount; }
  });

  barChart($("chartSignups"), days, keys.map((k) => signups[k]), (v) => fmtNum(v) + (v === 1 ? " user" : " users"));
  barChart($("chartVisits"),  days, keys.map((k) => visits.get(k) || 0), (v) => fmtNum(v) + (v === 1 ? " visit" : " visits"));
  barChart($("chartRevenue"), days, keys.map((k) => revenue[k]), fmtSum);
}

function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function shortNum(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + "k";
  return String(v);
}

function barChart(host, days, values, label) {
  const W = 600, H = 170, L = 34, B = 20, T = 6;
  const max = niceMax(Math.max(...values, 0));
  const n = values.length, slot = (W - L) / n, bw = Math.max(2, slot - 2); // 2px gap between bars
  const y = (v) => T + (H - T - B) * (1 - v / max);

  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;
  [0, 0.5, 1].forEach((f) => {
    const v = max * f, yy = y(v);
    s += `<line class="grid" x1="${L}" x2="${W}" y1="${yy}" y2="${yy}"/>`;
    s += `<text class="axis" x="${L - 6}" y="${yy + 3}" text-anchor="end">${shortNum(v)}</text>`;
  });
  values.forEach((v, i) => {
    const x = L + i * slot + 1, top = y(v), h = (H - B) - top;
    const r = Math.min(4, bw / 2, h);
    s += `<g data-i="${i}">`;
    s += `<rect class="bar-hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}"/>`;
    if (v > 0) {
      // rounded top, square at the baseline
      s += `<path class="bar" d="M${x},${H - B} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - B} Z"/>`;
    }
    s += `</g>`;
    if (i % 7 === 0 || i === n - 1) {
      s += `<text class="axis" x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${pad(days[i].getDate())}.${pad(days[i].getMonth() + 1)}</text>`;
    }
  });
  s += `</svg>`;
  host.innerHTML = s;

  const tip = $("tip");
  host.querySelectorAll("g[data-i]").forEach((g) => {
    g.addEventListener("mousemove", (e) => {
      const i = +g.dataset.i;
      tip.hidden = false;
      tip.textContent = fmtDate(days[i]) + " · " + label(values[i]);
      tip.style.left = e.clientX + "px";
      tip.style.top = e.clientY + "px";
    });
    g.addEventListener("mouseleave", () => { tip.hidden = true; });
  });
}

/* ----- users table ----- */
function filteredUsers() {
  const q = $("userSearch").value.trim().toLowerCase();
  const f = $("userFilter").value;
  const now = Date.now();
  let list = users.filter((u) => {
    if (q && !(u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q))) return false;
    switch (f) {
      case "paid": return u.status === "paid";
      case "free": return u.status === "free";
      case "expired": return u.status === "expired";
      case "expiring": return u.status === "paid" && u.planExpires && u.planExpires - now < 7 * DAY_MS;
      case "online": return isOnline(u);
      case "teacher": case "student": return u.role === f;
      case "new7": return u.createdAt && now - u.createdAt < 7 * DAY_MS;
      default: return true;
    }
  });
  const val = (u) => sort.key === "lastSeen" ? lastSeenOf(u) : u[sort.key];
  list.sort((a, b) => {
    let x = val(a), y = val(b);
    if (x instanceof Date) x = x.getTime();
    if (y instanceof Date) y = y.getTime();
    if (x == null || x === "") return 1;          // empties always last
    if (y == null || y === "") return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
  });
  return list;
}

function planBadge(u) {
  if (u.status === "paid") return `<span class="badge badge--paid">${esc(cap(u.plan) || "Paid")}</span>`;
  if (u.status === "expired") return `<span class="badge badge--expired">Expired${u.plan ? " · " + esc(cap(u.plan)) : ""}</span>`;
  return `<span class="badge">Free</span>`;
}

function renderUsers() {
  const list = filteredUsers();
  const now = Date.now();
  const body = $("usersTable").tBodies[0];
  if (!list.length) {
    body.innerHTML = `<tr><td class="empty" colspan="8">No users match.</td></tr>`;
  } else {
    body.innerHTML = list.map((u) => {
      const seen = lastSeenOf(u);
      const soon = u.status === "paid" && u.planExpires && u.planExpires - now < 7 * DAY_MS;
      return `<tr>
        <td><div class="u-cell"><span class="${isOnline(u) ? "on-dot" : "off-dot"}" title="${isOnline(u) ? "Online" : "Offline"}"></span>
          <div><div class="u-email">${esc(u.email || "(no email)")}</div><div class="u-name">${esc(u.name || u.uid)}</div></div></div></td>
        <td>${esc(cap(u.role))}</td>
        <td>${planBadge(u)}</td>
        <td title="${fmtDateTime(u.createdAt)}">${fmtDate(u.createdAt)}</td>
        <td title="${fmtDateTime(seen)}">${ago(seen)}</td>
        <td>${fmtDate(u.paidAt)}</td>
        <td class="${soon ? "soon" : ""}">${fmtDate(u.planExpires)}</td>
        <td class="num">${u.totalPaid ? fmtSum(u.totalPaid) + (u.payCount > 1 ? ` <span class="admin-muted">×${u.payCount}</span>` : "") : "—"}</td>
      </tr>`;
    }).join("");
  }
  $("usersFoot").textContent = `Showing ${fmtNum(list.length)} of ${fmtNum(users.length)} users`;
}

$("userSearch").addEventListener("input", renderUsers);
$("userFilter").addEventListener("change", renderUsers);
document.querySelectorAll("#usersTable th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    sort = { key, dir: sort.key === key ? -sort.dir : (["email", "role", "status"].includes(key) ? 1 : -1) };
    document.querySelectorAll("#usersTable th").forEach((x) => x.classList.remove("is-sorted", "asc", "desc"));
    th.classList.add("is-sorted", sort.dir === 1 ? "asc" : "desc");
    renderUsers();
  });
});

/* ----- payments table ----- */
function filteredPayments() {
  const f = $("payFilter").value;
  return payments
    .filter((p) => f === "all" || p.status === f)
    .sort((a, b) => (b.created || 0) - (a.created || 0));
}

function renderPayments() {
  const byUid = new Map(users.map((u) => [u.uid, u]));
  const list = filteredPayments();
  const body = $("payTable").tBodies[0];
  body.innerHTML = list.length ? list.map((p) => {
    const u = byUid.get(p.uid);
    const product = p.plan === "stars" ? "Star refill" : cap(p.plan) + " plan";
    return `<tr>
      <td>${fmtDateTime(p.created)}</td>
      <td><div class="u-email">${esc(u ? u.email : "(deleted user)")}</div><div class="u-name">${esc(p.uid)}</div></td>
      <td>${esc(product)}${p.plan === "stars" && p.status === "paid" && p.applied === false ? ' <span class="soon" title="Paid, but the lesson attempt was already finished — refund candidate">⚠ not applied</span>' : ""}</td>
      <td class="num">${fmtSum(p.amount)}</td>
      <td><span class="badge badge--${esc(p.status)}">${esc(cap(p.status))}</span></td>
      <td class="admin-muted">${esc(p.id)}</td>
    </tr>`;
  }).join("") : `<tr><td class="empty" colspan="6">No payments.</td></tr>`;
}
$("payFilter").addEventListener("change", renderPayments);

/* ----- online table ----- */
function renderOnline() {
  const byUid = new Map(users.map((u) => [u.uid, u]));
  const now = Date.now();
  const list = [...presence.entries()]
    .filter(([, p]) => p.lastSeen && now - p.lastSeen < ONLINE_MS)
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  const body = $("onlineTable").tBodies[0];
  body.innerHTML = list.length ? list.map(([uid, p]) => {
    const u = byUid.get(uid);
    return `<tr>
      <td><div class="u-cell"><span class="on-dot"></span><div class="u-email">${esc((u && u.email) || p.email || uid)}</div></div></td>
      <td>${u ? esc(cap(u.role)) : "—"}</td>
      <td>${u ? planBadge(u) : "—"}</td>
      <td>${esc(p.page)}</td>
      <td>${ago(p.lastSeen)}</td>
    </tr>`;
  }).join("") : `<tr><td class="empty" colspan="5">Nobody online right now.</td></tr>`;
}

/* ----- tabs ----- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t === tab));
    document.querySelectorAll(".tab-body").forEach((b) => { b.hidden = b.dataset.body !== tab.dataset.tab; });
  });
});

/* ----- CSV export ----- */
function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("exportUsers").onclick = () => downloadCsv(`tetragon-users-${dayKey(new Date())}.csv`, [
  ["UID", "Email", "Name", "Role", "Status", "Plan", "Registered", "Last active", "Paid on", "Expires", "Total paid (so'm)", "Payments"],
  ...filteredUsers().map((u) => [u.uid, u.email, u.name, u.role, u.status, u.plan, fmtDateTime(u.createdAt),
    fmtDateTime(lastSeenOf(u)), fmtDate(u.paidAt), fmtDate(u.planExpires), u.totalPaid, u.payCount]),
]);

$("exportPayments").onclick = () => {
  const byUid = new Map(users.map((u) => [u.uid, u]));
  downloadCsv(`tetragon-payments-${dayKey(new Date())}.csv`, [
    ["Date", "UID", "Email", "Product", "Amount (so'm)", "Status", "Click transaction"],
    ...filteredPayments().map((p) => [fmtDateTime(p.created), p.uid, (byUid.get(p.uid) || {}).email || "",
      p.plan, p.amount, p.status, p.id]),
  ]);
};
