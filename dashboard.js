// dashboard.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, formatMoney, logout, toDateAny } from "./common.js";

import {
  collection, query, orderBy, limit, onSnapshot, getDocs, where
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const $ = (id) => document.getElementById(id);

function startOfWeek(d = new Date()) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // monday=0
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() - day);
  return dt;
}

function renderSalesTable(rows) {
  const tbody = $("salesTable");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4">Aucune vente</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const d = toDateAny(r.date) || new Date();
    const dStr = d.toLocaleDateString("fr-FR");
    return `<tr>
      <td>${dStr}</td>
      <td>${escapeHtml(r.client || r.clientName || "")}</td>
      <td>${escapeHtml(r.vehicle || r.vehicleName || "")}</td>
      <td>${formatMoney(r.amount || r.montant || 0)}</td>
    </tr>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function refreshOnce() {
  // Sales totals
  const salesRef = collection(db, "sales");
  const allSales = await getDocs(salesRef);
  let total = 0;
  let week = 0;
  const weekStart = startOfWeek(new Date());
  allSales.forEach(doc => {
    const d = doc.data();
    const amt = Number(d.amount ?? d.montant ?? 0) || 0;
    total += amt;
    const dd = toDateAny(d.date) || toDateAny(d.createdAt);
    if (dd && dd >= weekStart) week += amt;
  });

  const stockSnap = await getDocs(collection(db, "stock"));
  const resaSnap = await getDocs(collection(db, "reservations"));

  $("totalSales").textContent = formatMoney(total);
  $("weekSales").textContent = formatMoney(week);
  $("stockCount").textContent = String(stockSnap.size);
  $("resaCount").textContent = String(resaSnap.size);

  // Latest sales
  const qLatest = query(salesRef, orderBy("date", "desc"), limit(8));
  const latestSnap = await getDocs(qLatest);
  const rows = latestSnap.docs.map(d => d.data());
  renderSalesTable(rows);

  showToast("Dashboard à jour");
}

function watchRealtime() {
  // Latest sales realtime
  const salesRef = collection(db, "sales");
  const qLatest = query(salesRef, orderBy("date", "desc"), limit(8));
  onSnapshot(qLatest, (snap) => {
    const rows = snap.docs.map(d => d.data());
    renderSalesTable(rows);
  });

  // Simple counts realtime
  onSnapshot(collection(db, "stock"), (snap) => {
    const el = $("stockCount");
    if (el) el.textContent = String(snap.size);
  });

  onSnapshot(collection(db, "reservations"), (snap) => {
    const el = $("resaCount");
    if (el) el.textContent = String(snap.size);
  });

  // Totals (recompute on sales changes)
  onSnapshot(salesRef, (snap) => {
    let total = 0;
    let week = 0;
    const weekStart = startOfWeek(new Date());
    snap.forEach(doc => {
      const d = doc.data();
      const amt = Number(d.amount ?? d.montant ?? 0) || 0;
      total += amt;
      const dd = toDateAny(d.date) || toDateAny(d.createdAt);
      if (dd && dd >= weekStart) week += amt;
    });
    const tEl = $("totalSales");
    const wEl = $("weekSales");
    if (tEl) tEl.textContent = formatMoney(total);
    if (wEl) wEl.textContent = formatMoney(week);
  });
}

document.getElementById("logoutBtn")?.addEventListener("click", () => logout());
document.getElementById("refreshBtn")?.addEventListener("click", refreshOnce);

showToast("PDM Dashboard chargé !");
watchRealtime();
refreshOnce().catch(() => showToast("Erreur Firestore (vérifie les règles)", "err"));
