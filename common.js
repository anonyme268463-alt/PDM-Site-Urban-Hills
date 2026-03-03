// common.js — helpers partagés

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function fmtDate(ts) {
  // accepte: Firestore Timestamp, Date, number(ms), string
  try {
    let d = null;
    if (!ts) return "";
    if (typeof ts?.toDate === "function") d = ts.toDate();
    else if (ts instanceof Date) d = ts;
    else if (typeof ts === "number") d = new Date(ts);
    else d = new Date(ts);

    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR");
  } catch {
    return "";
  }
}

export function normRole(role) {
  const r = String(role || "staff").toLowerCase();
  return r === "admin" ? "admin" : "staff";
}

export function toBool(v, fallback = true) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}
