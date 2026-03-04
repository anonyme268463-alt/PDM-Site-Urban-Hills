import { auth, db } from "./config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection, getDocs, query, where, orderBy,
  addDoc, deleteDoc, doc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ------------------------- Helpers ------------------------- */
const $ = (id) => document.getElementById(id);

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function toDate(tsOrDate) {
  if (!tsOrDate) return null;
  // Firestore Timestamp
  if (typeof tsOrDate.toDate === "function") return tsOrDate.toDate();
  // JS Date
  if (tsOrDate instanceof Date) return tsOrDate;
  // string/number
  const d = new Date(tsOrDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(d) {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Lundi 00:00 -> Dimanche 23:59:59
function currentWeekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // lundi=0 ... dimanche=6
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [startOfDay(monday), endOfDay(sunday)];
}

function safeText(v) {
  return (v === undefined || v === null || v === "") ? "—" : String(v);
}

/* ------------------------- State ------------------------- */
let rangeFrom = null;
let rangeTo = null;
let searchTerm = "";

let cachedSales = [];     // transactions filtered
let cachedCashbook = [];  // cashbook filtered
let cachedUsers = [];     // users

/* ------------------------- DOM refs ------------------------- */
const salesTbody = $("salesTbody");
const cashbookTbody = $("cashbookTbody");
const salaryTbody = $("salaryTbody");

const kpiRevenue = $("kpiRevenue");
const kpiProfit = $("kpiProfit");
const kpiCount = $("kpiCount");
const kpiExpenses = $("kpiExpenses");
const kpiOtherIncome = $("kpiOtherIncome");
const kpiNet = $("kpiNet");
const periodLabel = $("periodLabel");

/* ------------------------- Modal ------------------------- */
function openModal() {
  const m = $("cashbookModal");
  m.style.display = "block";
  m.setAttribute("aria-hidden", "false");
}
function closeModal() {
  const m = $("cashbookModal");
  m.style.display = "none";
  m.setAttribute("aria-hidden", "true");
}

/* ------------------------- Data loading ------------------------- */
async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  cachedUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function pickSaleDate(data) {
  // On essaie d'abord "date" (logique métier), sinon createdAt
  return toDate(data.date) || toDate(data.createdAt) || null;
}

function computeSaleAmounts(data) {
  const qty = Number(data.qty ?? 1) || 1;

  const sell = Number(
    data.sellPrice ?? data.price ?? data.sell ?? 0
  ) || 0;

  const buy = Number(
    data.buyPrice ?? data.buy ?? 0
  ) || 0;

  // Profit : si champ "profit" existe, on le prend, sinon calc simple
  const profit = Number(data.profit ?? ((sell - buy) * qty)) || 0;

  return {
    qty,
    sellTotal: sell * qty,
    buyTotal: buy * qty,
    profit
  };
}

async function loadTransactionsInRange() {
  // On ne dépend PAS d'une structure d'index compliquée :
  // -> on lit et on filtre côté client (OK vu la taille actuelle),
  // -> si tu veux, on optimisera ensuite avec des indexes (where date >= ...)
  const snap = await getDocs(query(collection(db, "transactions"), orderBy("createdAt", "desc")));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  cachedSales = all.filter(x => {
    const d = pickSaleDate(x);
    if (!d) return false;
    if (rangeFrom && d < rangeFrom) return false;
    if (rangeTo && d > rangeTo) return false;

    if (searchTerm) {
      const blob = `${x.clientName || ""} ${x.client || ""} ${x.model || ""} ${x.vehicle || ""} ${x.sellerName || ""} ${x.importedSeller || ""}`.toLowerCase();
      if (!blob.includes(searchTerm)) return false;
    }
    return true;
  });
}

async function loadCashbookInRange() {
  const snap = await getDocs(query(collection(db, "cashbook"), orderBy("date", "desc")));
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  cachedCashbook = all.filter(x => {
    const d = toDate(x.date) || toDate(x.createdAt) || null;
    if (!d) return false;
    if (rangeFrom && d < rangeFrom) return false;
    if (rangeTo && d > rangeTo) return false;

    if (searchTerm) {
      const blob = `${x.reason || ""} ${x.type || ""}`.toLowerCase();
      if (!blob.includes(searchTerm)) return false;
    }
    return true;
  });
}

/* ------------------------- Rendering ------------------------- */
function renderSalesTable() {
  if (!salesTbody) return;
  if (!cachedSales.length) {
    salesTbody.innerHTML = `<tr><td colspan="7">Aucune vente sur la période.</td></tr>`;
    return;
  }

  salesTbody.innerHTML = cachedSales.map(s => {
    const d = pickSaleDate(s);
    const a = computeSaleAmounts(s);
    const seller = s.sellerName || s.importedSeller || s.sellerEmail || "—";
    const client = s.clientName || s.client || "—";
    const model = s.model || s.vehicle || "—";

    return `
      <tr>
        <td>${fmtDate(d)}</td>
        <td>${safeText(client)}</td>
        <td>${safeText(model)}</td>
        <td>${money(a.sellTotal)}</td>
        <td>${money(a.buyTotal)}</td>
        <td>${money(a.profit)}</td>
        <td>${safeText(seller)}</td>
      </tr>
    `;
  }).join("");
}

function renderCashbookTable() {
  if (!cashbookTbody) return;
  if (!cachedCashbook.length) {
    cashbookTbody.innerHTML = `<tr><td colspan="5">Aucune opération manuelle sur la période.</td></tr>`;
    return;
  }

  cashbookTbody.innerHTML = cachedCashbook.map(x => {
    const d = toDate(x.date) || toDate(x.createdAt);
    const type = x.type === "income" ? "Gain" : "Dépense";
    const sign = x.type === "income" ? "+" : "−";
    const amt = Number(x.amount || 0);

    return `
      <tr>
        <td>${fmtDate(d)}</td>
        <td>${type}</td>
        <td>${safeText(x.reason)}</td>
        <td>${sign} ${money(amt)}</td>
        <td>
          <button class="btn btn-danger" data-delcb="${x.id}">Supprimer</button>
        </td>
      </tr>
    `;
  }).join("");

  cashbookTbody.querySelectorAll("[data-delcb]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delcb");
      if (!confirm("Supprimer cette opération ?")) return;
      await deleteDoc(doc(db, "cashbook", id));
      await refreshAll();
    });
  });
}

function renderKpisAndSalaries() {
  // KPIs ventes
  let revenue = 0;
  let profit = 0;

  // totals vendeurs (par sellerName/email/uid)
  const sellerTotals = new Map(); // key -> { revenue, count }

  for (const s of cachedSales) {
    const a = computeSaleAmounts(s);
    revenue += a.sellTotal;
    profit += a.profit;

    const key =
      s.sellerId ||
      s.sellerUID ||
      s.sellerName ||
      s.importedSeller ||
      s.sellerEmail ||
      "unknown";

    const cur = sellerTotals.get(key) || { revenue: 0, count: 0 };
    cur.revenue += a.sellTotal;
    cur.count += 1;
    sellerTotals.set(key, cur);
  }

  // KPIs cashbook
  let expenses = 0;
  let otherIncome = 0;
  for (const x of cachedCashbook) {
    const amt = Number(x.amount || 0);
    if (x.type === "income") otherIncome += amt;
    else expenses += amt;
  }

  // Net
  const net = profit + otherIncome - expenses;

  kpiRevenue.textContent = money(revenue);
  kpiProfit.textContent = money(profit);
  kpiCount.textContent = String(cachedSales.length);
  kpiExpenses.textContent = money(expenses);
  kpiOtherIncome.textContent = money(otherIncome);
  kpiNet.textContent = money(net);

  // Salaires
  // commission rates:
  const rateByGrade = {
    "Vendeur": 0.10,
    "Co-PDG": 0.12,
    "PDG": 0.05
  };

  // On prépare lignes par user:
  const rows = [];

  // Total ventes pour PDG (toutes ventes période)
  const pdgPool = revenue * rateByGrade["PDG"];

  for (const u of cachedUsers) {
    const grade = u.grade || "Vendeur";
    const name = u.name || u.email || u.id;

    if (grade === "PDG") {
      rows.push({
        name,
        grade,
        ventes: cachedSales.length,
        commission: "5% sur tout",
        salaire: pdgPool
      });
      continue;
    }

    const key1 = u.id;      // doc id = uid
    const key2 = u.email;
    const key3 = u.name;

    const tot =
      sellerTotals.get(key1) ||
      sellerTotals.get(key2) ||
      sellerTotals.get(key3) ||
      { revenue: 0, count: 0 };

    const rate = rateByGrade[grade] ?? 0.10;
    const pay = tot.revenue * rate;

    rows.push({
      name,
      grade,
      ventes: tot.count,
      commission: `${Math.round(rate * 100)}%`,
      salaire: pay
    });
  }

  // tri : PDG en haut, puis Co-PDG, puis vendeurs, puis salaire desc
  const gradeOrder = { "PDG": 0, "Co-PDG": 1, "Vendeur": 2 };
  rows.sort((a, b) => {
    const ga = gradeOrder[a.grade] ?? 9;
    const gb = gradeOrder[b.grade] ?? 9;
    if (ga !== gb) return ga - gb;
    return (b.salaire || 0) - (a.salaire || 0);
  });

  if (!rows.length) {
    salaryTbody.innerHTML = `<tr><td colspan="5">Aucun utilisateur.</td></tr>`;
    return;
  }

  salaryTbody.innerHTML = rows.map(r => `
    <tr>
      <td>${safeText(r.name)}</td>
      <td>${safeText(r.grade)}</td>
      <td>${safeText(r.ventes)}</td>
      <td>${safeText(r.commission)}</td>
      <td>${money(r.salaire || 0)}</td>
    </tr>
  `).join("");
}

function renderPeriodLabel() {
  const fromTxt = rangeFrom ? fmtDate(rangeFrom) : "—";
  const toTxt = rangeTo ? fmtDate(rangeTo) : "—";
  periodLabel.textContent = `${fromTxt} → ${toTxt}`;
}

/* ------------------------- Actions ------------------------- */
async function refreshAll() {
  // sécurité DOM
  if (!salesTbody || !cashbookTbody || !salaryTbody) return;

  renderPeriodLabel();

  salesTbody.innerHTML = `<tr><td colspan="7">Chargement...</td></tr>`;
  cashbookTbody.innerHTML = `<tr><td colspan="5">Chargement...</td></tr>`;
  salaryTbody.innerHTML = `<tr><td colspan="5">Chargement...</td></tr>`;

  await Promise.all([
    loadUsers(),
    loadTransactionsInRange(),
    loadCashbookInRange()
  ]);

  renderSalesTable();
  renderCashbookTable();
  renderKpisAndSalaries();
}

/* ------------------------- Boot ------------------------- */
function bindUI() {
  $("btnLogout")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "./index.html";
  });

  $("searchInput")?.addEventListener("input", (e) => {
    searchTerm = (e.target.value || "").trim().toLowerCase();
  });

  $("btnRefresh")?.addEventListener("click", refreshAll);

  $("btnWeek")?.addEventListener("click", async () => {
    const [a, b] = currentWeekRange();
    rangeFrom = a;
    rangeTo = b;

    // set inputs
    const df = $("dateFrom");
    const dt = $("dateTo");
    if (df) df.value = a.toISOString().slice(0, 10);
    if (dt) dt.value = b.toISOString().slice(0, 10);

    await refreshAll();
  });

  $("btnApplyRange")?.addEventListener("click", async () => {
    const df = $("dateFrom")?.value;
    const dt = $("dateTo")?.value;

    rangeFrom = df ? startOfDay(new Date(df)) : null;
    rangeTo = dt ? endOfDay(new Date(dt)) : null;

    await refreshAll();
  });

  $("btnExportPdf")?.addEventListener("click", () => {
    // Simple & efficace : impression -> "Enregistrer en PDF"
    window.print();
  });

  $("btnAddCashbook")?.addEventListener("click", () => {
    // default date = today
    const today = new Date().toISOString().slice(0, 10);
    if ($("cbDate")) $("cbDate").value = today;
    if ($("cbType")) $("cbType").value = "expense";
    if ($("cbReason")) $("cbReason").value = "";
    if ($("cbAmount")) $("cbAmount").value = "";
    openModal();
  });

  $("btnCloseModal")?.addEventListener("click", closeModal);
  $("btnCancelModal")?.addEventListener("click", closeModal);

  // click backdrop to close
  document.querySelectorAll("[data-close='1']").forEach(el => {
    el.addEventListener("click", closeModal);
  });

  $("btnSaveCashbook")?.addEventListener("click", async () => {
    const dateStr = $("cbDate")?.value;
    const type = $("cbType")?.value;
    const reason = ($("cbReason")?.value || "").trim();
    const amount = Number($("cbAmount")?.value || 0);

    if (!dateStr) return alert("Date obligatoire.");
    if (!reason) return alert("Libellé obligatoire.");
    if (!amount || amount <= 0) return alert("Montant invalide.");

    const date = new Date(dateStr);
    const payload = {
      type: type === "income" ? "income" : "expense",
      reason,
      amount,
      date: Timestamp.fromDate(startOfDay(date)),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await addDoc(collection(db, "cashbook"), payload);
    closeModal();
    await refreshAll();
  });
}

function initDefaultRange() {
  const [a, b] = currentWeekRange();
  rangeFrom = a;
  rangeTo = b;

  const df = $("dateFrom");
  const dt = $("dateTo");
  if (df) df.value = a.toISOString().slice(0, 10);
  if (dt) dt.value = b.toISOString().slice(0, 10);
}

document.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  initDefaultRange();
  await refreshAll();
});
