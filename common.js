export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const escapeHtml = esc;

export function fmtMoney(n, currency = "$") {
  const x = Number(n || 0);
  const v = Number.isFinite(x) ? x : 0;
  return `${currency}${Math.round(v).toLocaleString("en-US")}`;
}

export function fmtDate(d) {
  const dd = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dd.getTime())) return "-";
  const day = String(dd.getDate()).padStart(2, "0");
  const mon = String(dd.getMonth() + 1).padStart(2, "0");
  const y = dd.getFullYear();
  return `${day}/${mon}/${y}`;
}

export function toDateInputValue(d) {
  const dd = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dd.getTime())) return "";
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, "0");
  const day = String(dd.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeekRange(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { from: monday, to: sunday };
}

export function normRole(r) {
  const s = String(r || "").toLowerCase().trim();
  const admins = ["admin", "pdg", "patron", "direction"];
  if (admins.includes(s)) return "admin";
  return "staff";
}

export function toBool(v, def = false) {
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "oui" || s === "actif";
}

import { db } from "./config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export async function checkIsAdmin(uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data();
    const role = normRole(data.role || data.rank);
    return role === "admin";
  } catch (e) {
    console.error("Error checking admin status:", e);
    return false;
  }
}

export function showDenyScreen(containerSelector = ".main-content") {
  const main = document.querySelector(containerSelector);
  if (main) {
    main.innerHTML = `
      <header class="top-bar">
        <div class="page-info">
          <h1>Accès Refusé</h1>
        </div>
      </header>
      <div class="content-body">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Autorisation insuffisante</div>
          </div>
          <p class="muted" style="padding:18px">Vous n'avez pas l'autorisation de consulter cette page. Seuls les administrateurs y ont accès.</p>
        </div>
      </div>
    `;
  }
}

export function renderUserBadge(userData) {
  const topBar = document.querySelector(".top-bar");
  if (!topBar) return;

  const role = userData.role || userData.rank || "Staff";
  const name = userData.name || "Utilisateur";

  const badge = document.createElement("div");
  badge.className = "user-badge";
  badge.innerHTML = `
    <div class="user-info-badge">
      <span class="role-badge">${esc(role)}</span>
      <span class="separator-badge">-</span>
      <span class="name-badge">${esc(name)}</span>
    </div>
  `;

  topBar.appendChild(badge);
}
