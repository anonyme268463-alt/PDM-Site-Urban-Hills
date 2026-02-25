// common.js
import { auth } from "./config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

export function showToast(message, kind = "ok") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  el.style.background = kind === "err" ? "#ffb4b4" : "#47e6a6";
  el.style.color = "#111";
  window.clearTimeout(el.__t);
  el.__t = window.setTimeout(() => (el.style.display = "none"), 2800);
}

export function formatMoney(n) {
  const num = Number(n || 0);
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
  } catch {
    return "$" + Math.round(num).toLocaleString("en-US");
  }
}

export function parseMoney(str) {
  if (typeof str !== "string") return Number(str || 0);
  const cleaned = str.replace(/[^0-9.,-]/g, "").replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function isoDate(d = new Date()) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const pad = (x) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}

export function toDateAny(v) {
  // Firestore Timestamp -> Date or string -> Date
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function logout(redirectTo = "./pdm-staff.html") {
  try {
    await signOut(auth);
  } finally {
    window.location.href = redirectTo;
  }
}

export function parseSimpleCSV(text) {
  // basic CSV: comma-separated, supports quoted values
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      row.push(cur.trim()); cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQ) {
      if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
      row = []; cur = "";
      // swallow \r\n
      if (ch === "\r" && text[i+1] === "\n") i++;
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows;
}
