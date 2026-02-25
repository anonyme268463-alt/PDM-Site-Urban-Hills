// dashboard.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, formatMoney, logout, toDateAny } from "./common.js";

import {
  collection, query, orderBy, limit, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const $ = (id) => document.getElementById(id);

function startOfWeek(d = new Date()) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7;
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
    const d = toDateAny(r.date || r.createdAt) || new Date();
    return `<tr>
      <td>${d.toLocaleDateString("fr-FR")}</td>
      <td>${r.client || ""}</td>
      <td>${r.vehicle || ""}</td>
      <td>${formatMoney(r.amount || 0)}</td>
    </tr>`;
  }).join("");
}

async function refreshOnce() {
  const txSnap = await getDocs(collection(db, "transactions"));
  let total = 0;
  let week = 0;
  const weekStart = startOfWeek();

  txSnap.forEach(doc => {
    const d = doc.data();
    const amt = Number(d.amount || 0);
    total += amt;
    const date = toDateAny(d.date || d.createdAt);
    if (date && date >= weekStart) week += amt;
  });

  $("totalSales").textContent = formatMoney(total);
  $("weekSales").textContent = formatMoney(week);

  $("stockCount").textContent =
    (await getDocs(collection(db, "stock"))).size;

  $("resaCount").textContent =
    (await getDocs(collection(db, "reservations"))).size;

  const latest = await getDocs(
    query(collection(db, "transactions"), orderBy("date", "desc"), limit(8))
  );

  renderSalesTable(latest.docs.map(d => d.data()));
}

function watchRealtime() {
  onSnapshot(collection(db, "transactions"), refreshOnce);
  onSnapshot(collection(db, "stock"), snap => $("stockCount").textContent = snap.size);
  onSnapshot(collection(db, "reservations"), snap => $("resaCount").textContent = snap.size);
}

document.getElementById("logoutBtn")?.addEventListener("click", logout);
document.getElementById("refreshBtn")?.addEventListener("click", refreshOnce);

watchRealtime();
refreshOnce().catch(() =>
  showToast("Erreur Firestore", "err")
);

showToast("Dashboard chargé");
