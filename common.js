export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

// Lundi 00:00 → Dimanche 23:59:59 (local)
export function getWeekRange(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay(); // 0 dimanche, 1 lundi...
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
  if (s.includes("admin")) return "admin";
  return "staff";
}

export function toBool(v, def = false) {
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "oui" || s === "actif";
}
