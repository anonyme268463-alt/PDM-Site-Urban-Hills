import { checkIsAdmin, showDenyScreen } from "./common.js";
import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, getDocs, addDoc, deleteDoc, doc, query, where, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import {
  $, escapeHtml, fmtMoney, fmtDate, toDateInputValue, getWeekRange
} from "./common.js";

/** DOM */
const btnLogout = $("#logoutBtn");
const btnRefresh = $("#refreshBtn");
const btnWeek = $("#btnWeek");
const btnApply = $("#btnApply");
const btnAddCash = $("#btnAddCash");
const btnPdf = $("#btnPdf");

const periodLabel = $("#periodLabel");
const dateFrom = $("#dateFrom");
const dateTo = $("#dateTo");
const qInput = $("#qInput");

const kpiCa = $("#kpiCa");
const kpiProfit = $("#kpiProfit");
const kpiCount = $("#kpiCount");
const kpiExpense = $("#kpiExpense");
const kpiOther = $("#kpiOther");
const kpiNet = $("#kpiNet");

const txTbody = $("#txTbody");
const cashTbody = $("#cashTbody");
const salaryTbody = $("#salaryTbody");

const cashModal = $("#cashModal");
const cashDate = $("#cashDate");
const cashType = $("#cashType");
const cashReason = $("#cashReason");
const cashAmount = $("#cashAmount");
const cashCancel = $("#cashCancel");
const cashSave = $("#cashSave");

/** State */
let currentUser = null;
let range = { from: null, to: null };
let txRows = [];
let cashRows = [];
let usersRows = [];

/** Helpers */
function setRange(r) {
  range = r;
  periodLabel.textContent = `${fmtDate(r.from)} — ${fmtDate(r.to)}`;
  dateFrom.value = toDateInputValue(r.from);
  dateTo.value = toDateInputValue(r.to);
}

function parseDateInputs() {
  const f = dateFrom.value;
  const t = dateTo.value;
  if (!f || !t) return null;
  const from = new Date(f + "T00:00:00");
  const to = new Date(t + "T23:59:59");
  return { from, to };
}

function norm(s) { return String(s || "").toLowerCase().trim(); }

function txDate(row) {
  if (!row.createdAt) return null;
  return row.createdAt.toDate ? row.createdAt.toDate() : new Date(row.createdAt);
}

function moneyBase(tx) {
  // If manual profit exists, use it, else sell - buy
  if (Number.isFinite(tx.profit)) return tx.profit;
  const s = Number(tx.sellPrice || tx.price || 0);
  const b = Number(tx.buyPrice || 0);
  return s - b;
}

/** Render */
function renderTransactions(list) {
  if (!list.length) {
    txTbody.innerHTML = `<tr><td colspan="7" class="muted">Aucune vente sur la période.</td></tr>`;
    return;
  }

  txTbody.innerHTML = list.map(tx => {
    const d = txDate(tx);
    const sell = tx.sellPrice || tx.price || 0;
    const buy = tx.buyPrice || 0;
    const profit = moneyBase(tx);
    const seller = tx.sellerName || tx.importedSeller || tx.vendeur || "-";

    return `
      <tr>
        <td>${escapeHtml(d ? fmtDate(d) : "-")}</td>
        <td>${escapeHtml(tx.clientName || tx.client || "-")}</td>
        <td>${escapeHtml(tx.vehicle || tx.model || "-")}</td>
        <td>${escapeHtml(fmtMoney(sell))}</td>
        <td>${escapeHtml(fmtMoney(buy))}</td>
        <td>${escapeHtml(fmtMoney(profit))}</td>
        <td>${escapeHtml(seller)}</td>
      </tr>
    `;
  }).join("");
}

function renderCashbook(list) {
  if (!list.length) {
    cashTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucune opération manuelle sur la période.</td></tr>`;
    return;
  }

  cashTbody.innerHTML = list.map(row => {
    const d = txDate(row);
    const type = row.type === "income" ? "Gain" : "Dépense";
    const reason = row.reason || row.label || "-";
    const amount = Number(row.amount || 0);

    return `
      <tr>
        <td>${escapeHtml(d ? fmtDate(d) : "-")}</td>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(reason)}</td>
        <td>${escapeHtml(fmtMoney(amount))}</td>
        <td>
          <button class="btn btn-danger btn-sm" data-del="${row.__id}">Supprimer</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderKpis() {
  const ca = txRows.reduce((s, tx) => s + (Number.isFinite(tx.sellPrice) ? tx.sellPrice : Number.isFinite(tx.price) ? tx.price : 0), 0);
  const profit = txRows.reduce((s, tx) => s + moneyBase(tx), 0);
  const count = txRows.length;

  const expense = cashRows.filter(x => x.type === "expense").reduce((s, x) => s + Number(x.amount || 0), 0);
  const other = cashRows.filter(x => x.type === "income").reduce((s, x) => s + Number(x.amount || 0), 0);

  const net = profit + other - expense;

  kpiCa.textContent = fmtMoney(ca);
  kpiProfit.textContent = fmtMoney(profit);
  kpiCount.textContent = String(count);
  kpiExpense.textContent = fmtMoney(expense);
  kpiOther.textContent = fmtMoney(other);
  kpiNet.textContent = fmtMoney(net);
}

function gradeRate(grade) {
  const g = String(grade || "").toLowerCase();
  if (g.includes("co") && g.includes("pdg")) return 0.12;
  if (g.includes("pdg") || g.includes("patron") || g.includes("admin")) return 0.05;
  return 0.10; // vendeur
}

function renderSalaries() {
  if (!usersRows.length) {
    salaryTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucun utilisateur.</td></tr>`;
    return;
  }

  const totalBaseAll = txRows.reduce((s, tx) => s + moneyBase(tx), 0);

  const rows = usersRows.map(u => {
    const name = u.name || u.email || u.__id;
    const grade = u.grade || u.role || u.rank || "Vendeur";
    const rate = gradeRate(grade);

    let count = 0;
    let base = 0;

    const lowerGrade = String(grade).toLowerCase();
    // PDG/Admin gets a percentage of TOTAL sales
    if ((lowerGrade.includes("pdg") || lowerGrade.includes("patron") || lowerGrade.includes("admin")) && !lowerGrade.includes("co")) {
      count = txRows.length;
      base = totalBaseAll;
    } else {
      // Regular sellers get a percentage of THEIR sales
      const userTxs = txRows.filter(tx => {
        const sid = tx.sellerId;
        const sname = tx.sellerName || tx.importedSeller || tx.vendeur || "";
        return (sid && sid === u.__id) ||
               (norm(sname) === norm(u.name)) ||
               (norm(sname) === norm(u.email));
      });
      count = userTxs.length;
      base = userTxs.reduce((s, tx) => s + moneyBase(tx), 0);
    }

    const salary = base * rate;

    return {
      name, grade, count, rate, salary
    };
  });

  rows.sort((a, b) => (b.salary - a.salary));

  salaryTbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.grade)}</td>
      <td>${escapeHtml(String(r.count))}</td>
      <td>${escapeHtml(Math.round(r.rate * 100) + "%")}</td>
      <td>${escapeHtml(fmtMoney(r.salary))}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="muted">Aucune donnée.</td></tr>`;
}

/** Data loading */
async function loadUsers() {
  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
  usersRows = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
}

async function loadTransactions() {
  const fromTs = Timestamp.fromDate(range.from);
  const toTs = Timestamp.fromDate(range.to);

  const qy = query(
    collection(db, "transactions"),
    where("createdAt", ">=", fromTs),
    where("createdAt", "<=", toTs),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(qy);
  const raw = snap.docs.map(d => ({ __id: d.id, ...d.data() }));

  txRows = raw.map(x => {
    const sellPrice = Number(x.sellPrice ?? x.price ?? 0);
    const buyPrice = Number(x.buyPrice ?? 0);
    const profit = Number.isFinite(Number(x.profit)) ? Number(x.profit) : (sellPrice - buyPrice);
    return { ...x, sellPrice, buyPrice, profit };
  });
}

async function loadCashbook() {
  const fromTs = Timestamp.fromDate(range.from);
  const toTs = Timestamp.fromDate(range.to);

  const qy = query(
    collection(db, "cashbook"),
    where("date", ">=", fromTs),
    where("date", "<=", toTs),
    orderBy("date", "desc")
  );

  const snap = await getDocs(qy);
  cashRows = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
}

function applySearchFilter() {
  const q = norm(qInput.value);
  const txFiltered = !q ? txRows : txRows.filter(tx => {
    return (
      norm(tx.clientName).includes(q) ||
      norm(tx.client).includes(q) ||
      norm(tx.model).includes(q) ||
      norm(tx.vehicle).includes(q) ||
      norm(tx.sellerName).includes(q) ||
      norm(tx.importedSeller).includes(q) ||
      norm(tx.vendeur).includes(q)
    );
  });

  renderTransactions(txFiltered);
  renderKpis();
  renderSalaries();
}

async function refreshAll() {
  txTbody.innerHTML = `<tr><td colspan="7" class="muted">Chargement…</td></tr>`;
  cashTbody.innerHTML = `<tr><td colspan="5" class="muted">Chargement…</td></tr>`;
  salaryTbody.innerHTML = `<tr><td colspan="5" class="muted">Chargement…</td></tr>`;

  await Promise.all([loadUsers(), loadTransactions(), loadCashbook()]);
  renderCashbook(cashRows);
  renderKpis();
  renderSalaries();
  applySearchFilter();
}

/** Cash modal */
function openCashModal() {
  cashDate.value = toDateInputValue(new Date());
  cashType.value = "expense";
  cashReason.value = "";
  cashAmount.value = "";
  cashModal.classList.remove("hidden");
}

function closeCashModal() {
  cashModal.classList.add("hidden");
}

async function saveCash() {
  const d = cashDate.value ? new Date(cashDate.value + "T12:00:00") : null;
  const amount = Number(cashAmount.value);
  const reason = cashReason.value.trim();

  if (!d || !Number.isFinite(amount) || amount <= 0 || !reason) {
    alert("Remplis Date + Montant (>0) + Libellé.");
    return;
  }

  await addDoc(collection(db, "cashbook"), {
    date: Timestamp.fromDate(d),
    type: cashType.value,
    reason,
    amount,
    createdAt: Timestamp.fromDate(new Date()),
    updatedAt: Timestamp.fromDate(new Date()),
    createdBy: currentUser?.uid || null
  });

  closeCashModal();
  await refreshAll();
}

/** PDF export (sans lib) */
function exportPdf() {
  const html = `
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Comptabilité — Export</title>
    <style>
      body{font-family:Arial, sans-serif; padding:24px;}
      h1{margin:0 0 6px;}
      .muted{color:#666;}
      table{width:100%; border-collapse:collapse; margin:12px 0;}
      th,td{border:1px solid #ddd; padding:8px; font-size:12px;}
      th{background:#f4f4f4; text-align:left;}
      .kpis{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:12px 0;}
      .kpi{border:1px solid #ddd; padding:10px; border-radius:8px;}
      .kpi b{display:block; margin-top:6px; font-size:16px;}
      @media print { button{display:none;} }
    </style>
  </head>
  <body>
    <h1>Comptabilité</h1>
    <div class="muted">Période : ${escapeHtml(periodLabel.textContent)}</div>

    <div class="kpis">
      <div class="kpi">CA total (ventes)<b>${escapeHtml(kpiCa.textContent)}</b></div>
      <div class="kpi">Profit total (ventes)<b>${escapeHtml(kpiProfit.textContent)}</b></div>
      <div class="kpi">Nb ventes<b>${escapeHtml(kpiCount.textContent)}</b></div>
      <div class="kpi">Dépenses<b>${escapeHtml(kpiExpense.textContent)}</b></div>
      <div class="kpi">Gains autres<b>${escapeHtml(kpiOther.textContent)}</b></div>
      <div class="kpi">Résultat net<b>${escapeHtml(kpiNet.textContent)}</b></div>
    </div>

    <h2>Salaires vendeurs</h2>
    ${document.querySelector("#salaryTbody").closest("table").outerHTML}

    <h2>Transactions (ventes)</h2>
    ${document.querySelector("#txTbody").closest("table").outerHTML}

    <h2>Opérations manuelles (cashbook)</h2>
    ${document.querySelector("#cashTbody").closest("table").outerHTML}

    <script>window.onload=()=>window.print();</script>
  </body>
  </html>
  `;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Events */
btnLogout?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

btnWeek?.addEventListener("click", async () => {
  setRange(getWeekRange(new Date()));
  await refreshAll();
});

btnApply?.addEventListener("click", async () => {
  const r = parseDateInputs();
  if (!r) return alert("Choisis une date de début et une date de fin.");
  setRange(r);
  await refreshAll();
});

btnRefresh?.addEventListener("click", refreshAll);
qInput?.addEventListener("input", applySearchFilter);

btnAddCash?.addEventListener("click", openCashModal);
cashCancel?.addEventListener("click", closeCashModal);
cashSave?.addEventListener("click", saveCash);
cashModal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close) closeCashModal();
});

cashTbody?.addEventListener("click", async (e) => {
  const id = e.target?.dataset?.del;
  if (!id) return;
  if (!confirm("Supprimer cette opération ?")) return;
  await deleteDoc(doc(db, "cashbook", id));
  await refreshAll();
});

btnPdf?.addEventListener("click", exportPdf);

/** Init */
onAuthStateChanged(auth, async (u) => {
  if (!u) { window.location.href = "pdm-staff.html"; return; }
  const isAdmin = await checkIsAdmin(u.uid);
  if (!isAdmin) {
    showDenyScreen();
    return;
  }
  currentUser = u;
  setRange(getWeekRange(new Date()));
  await refreshAll();
});
