// common.js
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

export function fmtDate(value) {
  try {
    if (!value) return "—";
    // Firestore Timestamp -> Date
    const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

export function badge(text, variant = "neutral") {
  const v = String(variant);
  return `<span class="pill pill-${escapeHtml(v)}">${escapeHtml(text)}</span>`;
}
