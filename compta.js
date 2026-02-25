// compta.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout, formatMoney, parseMoney, isoDate, toDateAny } from "./common.js";

import {
  collection, addDoc, doc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const salesRef = collection(db, "sales");
const cashRef  = collection(db, "cashbook"); // {date, kind:income|expense, amount, reason, createdAt}

let sales = [];
let cash = [];

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function computeTotals() {
  let buys = 0, sells = 0;
  for (const s of sales) {
    buys += Number(s.buyPrice || 0) || 0;
    sells += Number(s.sellPrice || s.amount || 0) || 0;
  }
  const profit = sells - buys;

  let incomes = 0, expenses = 0;
  for (const c of cash) {
    const amt = Number(c.amount || 0) || 0;
    if (c.kind === "income") incomes += amt;
    if (c.kind === "expense") expenses += amt;
  }

  const totalCash = profit + incomes - expenses;

  $("totalBuys").textContent = formatMoney(buys);
  $("totalSells").textContent = formatMoney(sells);
  $("totalProfit").textContent = formatMoney(profit);
  $("totalCash").textContent = formatMoney(totalCash);

  // also PDF placeholders if present
  const setIf = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  setIf("pdf-totalBuys", formatMoney(buys));
  setIf("pdf-totalSells", formatMoney(sells));
  setIf("pdf-totalProfit", formatMoney(profit));
  setIf("pdf-totalIncomes", formatMoney(incomes));
  setIf("pdf-totalExpenses", formatMoney(expenses));
  setIf("pdf-totalBalance", formatMoney(totalCash));
}

function renderSales() {
  const tbody = $("transactionsTable");
  if (!tbody) return;

  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="7">Aucune transaction</td></tr>';
    return;
  }

  tbody.innerHTML = sales.slice(0, 50).map(s => {
    const d = toDateAny(s.date) || toDateAny(s.createdAt) || new Date();
    const vehicle = s.vehicle || s.vehicleName || "";
    const buy = Number(s.buyPrice || 0) || 0;
    const sell = Number(s.sellPrice || s.amount || 0) || 0;
    const seller = s.seller || "";
    const commSeller = Number(s.commSeller || 0) || 0;
    const commBoss = Number(s.commBoss || 0) || 0;
    return `<tr>
      <td>${d.toLocaleDateString("fr-FR")}</td>
      <td>${escapeHtml(vehicle)}</td>
      <td>${formatMoney(buy)}</td>
      <td>${formatMoney(sell)}</td>
      <td>${escapeHtml(seller)}</td>
      <td>${formatMoney(commSeller)}</td>
      <td>${formatMoney(commBoss)}</td>
    </tr>`;
  }).join("");
}

function renderCashbook() {
  const tbody = $("cashbookTable");
  if (!tbody) return;

  if (!cash.length) {
    tbody.innerHTML = '<tr><td colspan="5">Aucun mouvement</td></tr>';
    return;
  }

  tbody.innerHTML = cash.map(c => `
    <tr>
      <td>${escapeHtml(c.date || "")}</td>
      <td>${escapeHtml(c.kind === "income" ? "Revenu" : "Dépense")}</td>
      <td>${formatMoney(c.amount || 0)}</td>
      <td>${escapeHtml(c.reason || "")}</td>
      <td>
        <button class="btn" data-action="del-cash" data-id="${c.id}" style="padding:6px 12px;font-size:12px;background:#ff4444">🗑️</button>
      </td>
    </tr>
  `).join("");
}

async function addCash(kind) {
  const date = ($("manualDate")?.value || "").trim() || isoDate(new Date());
  const reason = ($("manualReason")?.value || "").trim();
  const amount = parseMoney(String($("manualAmount")?.value || "0"));

  if (!reason) return showToast("Raison obligatoire", "err");
  if (!amount) return showToast("Montant obligatoire", "err");

  await addDoc(cashRef, { date, kind, amount, reason, createdAt: serverTimestamp() });

  $("manualReason").value = "";
  $("manualAmount").value = "";
  showToast(kind === "income" ? "Revenu ajouté !" : "Dépense ajoutée !");
}

async function deleteCash(id) {
  if (!confirm("Supprimer ce mouvement ?")) return;
  await deleteDoc(doc(db, "cashbook", id));
  showToast("Supprimé !");
}

function refreshCompta() {
  // temps réel déjà actif
  showToast("OK (temps réel)");
}

function uploadPDF() {
  showToast("Import PDF : à brancher plus tard (optionnel)", "err");
}

function generatePDF() {
  showToast("Export PDF : à brancher plus tard (optionnel)", "err");
}

document.getElementById("logoutBtn")?.addEventListener("click", () => logout());
document.getElementById("addIncomeBtn")?.addEventListener("click", () => addCash("income").catch(()=>showToast("Erreur revenu","err")));
document.getElementById("addExpenseBtn")?.addEventListener("click", () => addCash("expense").catch(()=>showToast("Erreur dépense","err")));
document.getElementById("refreshComptaBtn")?.addEventListener("click", refreshCompta);
document.getElementById("uploadPdfBtn")?.addEventListener("click", uploadPDF);
document.getElementById("generatePdfBtn")?.addEventListener("click", generatePDF);

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.getAttribute("data-action") === "del-cash") {
    deleteCash(btn.getAttribute("data-id")).catch(()=>showToast("Erreur suppression","err"));
  }
});

onSnapshot(query(salesRef, orderBy("date", "desc")), (snap) => {
  sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSales();
  computeTotals();
});

onSnapshot(query(cashRef, orderBy("createdAt", "desc")), (snap) => {
  cash = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCashbook();
  computeTotals();
});

showToast("PDM Comptabilité chargé !");
