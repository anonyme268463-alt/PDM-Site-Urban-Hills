import { db, auth } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, getDocs, doc, deleteDoc, addDoc, query, where, orderBy, Timestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { checkIsAdmin, showDenyScreen, fmtMoney, esc, renderUserBadge, getWeekRange, toDateInputValue, handleSignOut } from "./common.js";

const periodLabel = document.getElementById("periodLabel");
const btnWeek = document.getElementById("btnWeek");
const btnApply = document.getElementById("btnApply");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const btnRefresh = document.getElementById("btnRefresh");
const qInput = document.getElementById("qInput");

const kpiCa = document.getElementById("kpiCa");
const kpiProfit = document.getElementById("kpiProfit");
const kpiCount = document.getElementById("kpiCount");
const kpiExpense = document.getElementById("kpiExpense");
const kpiOther = document.getElementById("kpiOther");
const kpiNet = document.getElementById("kpiNet");

const txTbody = document.getElementById("txTbody");
const cashTbody = document.getElementById("cashTbody");
const salaryTbody = document.getElementById("salaryTbody");

const btnAddCash = document.getElementById("btnAddCash");
const cashModal = document.getElementById("cashModal");
const cashCancel = document.getElementById("cashCancel");
const cashSave = document.getElementById("cashSave");
const cashDate = document.getElementById("cashDate");
const cashType = document.getElementById("cashType");
const cashReason = document.getElementById("cashReason");
const cashAmount = document.getElementById("cashAmount");

const btnPdf = document.getElementById("btnPdf");
const btnLogout = document.getElementById("btnLogout");

const reportModal = document.getElementById("reportModal");
const reportPreviewContent = document.getElementById("reportPreviewContent");
const btnPrintReport = document.getElementById("btnPrintReport");

let range = { from: null, to: null };
let txRows = [];
let cashRows = [];
let usersRows = [];
let allTx = [];
let allCash = [];
let currentUser = null;

function setRange(r) {
  range = r;
  dateFrom.value = toDateInputValue(r.from);
  dateTo.value = toDateInputValue(r.to);
  periodLabel.textContent = `Du ${r.from.toLocaleDateString()} au ${r.to.toLocaleDateString()}`;
}

function parseDateInputs() {
  const f = dateFrom.value;
  const t = dateTo.value;
  if (!f || !t) return null;
  const from = new Date(f + "T00:00:00");
  const to = new Date(t + "T23:59:59");
  return { from, to };
}

function norm(s) { return String(s || "").trim().toLowerCase(); }
const moneyBase = (tx) => Number(tx.sellPrice || 0);

function renderTransactions(list) {
  if (!list.length) {
    txTbody.innerHTML = `<tr><td colspan="8" class="muted">Aucune vente.</td></tr>`;
    return;
  }
  txTbody.innerHTML = list.map(tx => `
    <tr>
      <td>${tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : "-"}</td>
      <td>${esc(tx.clientName || tx.client || "-")}</td>
      <td>${esc(tx.model || tx.vehicle || "-")}</td>
      <td><span class="badge badge-info">${esc(tx.detail || "Vente directe")}</span></td>
      <td>${fmtMoney(tx.sellPrice)}</td>
      <td>${fmtMoney(tx.buyPrice)}</td>
      <td>${fmtMoney(tx.profit)}</td>
      <td>${esc(tx.sellerName || tx.importedSeller || tx.vendeur || "-")}</td>
    </tr>
  `).join("");
}

function renderCashbook(list) {
  if (!list.length) {
    cashTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucune opération.</td></tr>`;
    return;
  }
  cashTbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.date?.toDate ? c.date.toDate().toLocaleDateString() : "-"}</td>
      <td><span class="badge ${c.type === "expense" ? "badge-danger" : "badge-success"}">${c.type === "expense" ? "Dépense" : "Autre"}</span></td>
      <td>${esc(c.reason)}</td>
      <td>${fmtMoney(c.amount)}</td>
      <td style="text-align:right;"><button class="btn btn-danger btn-sm" data-del="${c.__id}">Suppr</button></td>
    </tr>
  `).join("");
}

function calculateBalanceAt(transactions, cashEntries, endTs) {
  const txs = transactions.filter(t => (t.createdAt?.toMillis?.() || 0) <= endTs);
  const cash = cashEntries.filter(c => (c.date?.toMillis?.() || 0) <= endTs);

  const profit = txs.reduce((s, t) => s + (t.profit || 0), 0);
  const other = cash.filter(c => c.type !== "expense").reduce((s, c) => s + (c.amount || 0), 0);
  const expense = cash.filter(c => c.type === "expense").reduce((s, c) => s + (c.amount || 0), 0);

  // To be accurate we need to subtract salaries.
  // For historical balance, we need to calculate salaries week by week?
  // User asked for "Trésorerie": Balance (Profits + Gains - Expenses - Salaries).
  // This is complex for a simple frontend. Let's assume salaries are recorded or we calculate them here.

  // Since we don't have a "salary" collection, we must estimate by calculating commissions for ALL past txs.
  // We'll calculate commissions in chunks of weeks to be more realistic? No, just total works for "Actuelle".
  const sals = calculateSalariesForPeriod(txs).reduce((s, r) => s + r.salary, 0);

  return profit + other - expense - sals;
}

function renderKpis() {
  const ca = txRows.reduce((s, tx) => s + Number(tx.sellPrice || 0), 0);
  const profit = txRows.reduce((s, tx) => s + Number(tx.profit || 0), 0);
  const expense = cashRows.filter(c => c.type === "expense").reduce((s, c) => s + Number(c.amount || 0), 0);
  const other = cashRows.filter(c => c.type === "other").reduce((s, c) => s + Number(c.amount || 0), 0);
  const salaries = calculateSalariesForPeriod(txRows).reduce((s, r) => s + r.salary, 0);
  const net = profit - expense + other - salaries;

  kpiCa.textContent = fmtMoney(ca);
  kpiProfit.textContent = fmtMoney(profit);
  kpiCount.textContent = String(txRows.length);
  kpiExpense.textContent = fmtMoney(expense);
  kpiOther.textContent = fmtMoney(other);
  kpiNet.textContent = fmtMoney(net);

  // Treasury S-1 (End of previous week)
  const lastWeekEnd = new Date(range.from);
  lastWeekEnd.setMilliseconds(lastWeekEnd.getMilliseconds() - 1);
  const treasuryPrev = calculateBalanceAt(allTx, allCash, lastWeekEnd.getTime());

  // Treasury Now (Total balance)
  const treasuryTotal = calculateBalanceAt(allTx, allCash, Date.now());

  const kpiTreasuryPrev = document.getElementById("kpiTreasuryPrev");
  const kpiTreasuryTotal = document.getElementById("kpiTreasuryTotal");
  if (kpiTreasuryPrev) kpiTreasuryPrev.textContent = fmtMoney(treasuryPrev);
  if (kpiTreasuryTotal) kpiTreasuryTotal.textContent = fmtMoney(treasuryTotal);
}

function gradeRate(grade) {
  const g = String(grade || "").toLowerCase();
  // Co-PDG / Patron / Direction etc. (matches "co" and "pdg" or "patron")
  if (g.includes("co") && (g.includes("pdg") || g.includes("patron"))) return 0.12;
  // PDG/Patron/Admin (Main owner) gets 5% of total sales
  if (g.includes("pdg") || g.includes("patron") || g.includes("admin")) return 0.05;
  // Default Vendeur rate
  return 0.10;
}

function calculateSalariesForPeriod(transactions, periodEndTs = Infinity) {
  const totalBaseAll = transactions.reduce((s, tx) => s + moneyBase(tx), 0);
  const sellersMap = new Map();

  usersRows.forEach(u => sellersMap.set(u.__id, { id: u.__id, name: u.name || u.email || u.__id, grade: u.grade || u.role || u.rank || "Vendeur", count: 0, base: 0 }));

  transactions.forEach(tx => {
    const sid = tx.sellerId;
    const sname = tx.sellerName || tx.importedSeller || tx.vendeur || "Vendeur Inconnu";
    if (sid && !sellersMap.has(sid)) sellersMap.set(sid, { id: sid, name: sname, grade: "Vendeur", count: 0, base: 0 });
    else if (!sid && !Array.from(sellersMap.values()).some(e => norm(e.name) === norm(sname))) {
      sellersMap.set("legacy_" + sname, { id: null, name: sname, grade: "Vendeur", count: 0, base: 0 });
    }
  });

  return Array.from(sellersMap.values()).map(s => {
    const rate = gradeRate(s.grade);
    const lg = s.grade.toLowerCase();
    let count = 0, base = 0;

    // PDG/Patron/Admin gets 5% of TOTAL company turnover
    if ((lg.includes("pdg") || lg.includes("patron") || lg.includes("admin")) && !lg.includes("co")) {
      count = transactions.length;
      base = totalBaseAll;
    } else {
      // Others get commission on their own sales
      const userTxs = transactions.filter(tx => (tx.sellerId && tx.sellerId === s.id) || (norm(tx.sellerName || tx.importedSeller || tx.vendeur) === norm(s.name)));
      count = userTxs.length;
      base = userTxs.reduce((sum, tx) => sum + moneyBase(tx), 0);
    }
    return { ...s, count, salary: base * rate, rate };
  }).filter(r => r.salary > 0 || r.count > 0 || String(r.grade).toLowerCase().includes("pdg") || String(r.grade).toLowerCase().includes("admin"));
}

function renderSalaries() {
  const finalRows = calculateSalariesForPeriod(txRows).sort((a, b) => b.salary - a.salary);

  salaryTbody.innerHTML = finalRows.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.grade)}</td>
      <td>${r.count}</td>
      <td>${Math.round(r.rate * 100)}%</td>
      <td>${fmtMoney(r.salary)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="muted">Aucune donnée.</td></tr>`;
}

async function loadAllData() {
  const [uSnap, tSnap, cSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "transactions")),
    getDocs(collection(db, "cashbook"))
  ]);

  usersRows = uSnap.docs.map(d => ({ __id: d.id, ...d.data() }));

  allTx = tSnap.docs.map(d => {
    const data = d.data();
    const sell = Number(data.sellPrice ?? data.price ?? 0);
    const buy = Number(data.buyPrice ?? 0);
    return { ...data, __id: d.id, sellPrice: sell, buyPrice: buy, profit: Number.isFinite(data.profit) ? Number(data.profit) : (sell - buy) };
  }).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

  allCash = cSnap.docs.map(d => ({ __id: d.id, ...d.data() }))
    .sort((a,b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0));
}

function filterData() {
  const start = range.from.getTime();
  const end = range.to.getTime();

  txRows = allTx.filter(t => {
    const ts = t.createdAt?.toMillis?.() || 0;
    return ts >= start && ts <= end;
  });

  cashRows = allCash.filter(c => {
    const ts = c.date?.toMillis?.() || 0;
    return ts >= start && ts <= end;
  });
}

function applySearchFilter() {
  const q = norm(qInput.value);
  const filtered = !q ? txRows : txRows.filter(tx => [tx.clientName, tx.client, tx.model, tx.vehicle, tx.sellerName, tx.importedSeller, tx.vendeur].some(x => norm(x).includes(q)));
  renderTransactions(filtered); renderSalaries(); renderKpis();
}

async function refreshAll() {
  txTbody.innerHTML = `<tr><td colspan="7" class="muted">Chargement…</td></tr>`;
  cashTbody.innerHTML = `<tr><td colspan="5" class="muted">Chargement…</td></tr>`;
  salaryTbody.innerHTML = `<tr><td colspan="5" class="muted">Chargement…</td></tr>`;
  try {
    if (allTx.length === 0) await loadAllData();
    filterData();
    renderCashbook(cashRows); renderSalaries(); renderKpis(); applySearchFilter();
  } catch(e) { console.error(e); }
}

async function forceRefresh() {
  allTx = []; allCash = [];
  await refreshAll();
}

btnAddCash?.addEventListener("click", () => { cashDate.value = toDateInputValue(new Date()); cashType.value = "expense"; cashReason.value = ""; cashAmount.value = ""; cashModal.classList.remove("hidden"); });
cashCancel?.addEventListener("click", () => cashModal.classList.add("hidden"));
if (cashModal) cashModal.addEventListener("click", (e) => { if (e.target === cashModal) cashModal.classList.add("hidden"); });
cashSave?.addEventListener("click", async () => {
  const d = cashDate.value ? new Date(cashDate.value + "T12:00:00") : null;
  const amount = Number(cashAmount.value);
  const reason = cashReason.value.trim();
  if (!d || !Number.isFinite(amount) || amount <= 0 || !reason) return alert("Remplis Date + Montant (>0) + Libellé.");
  try {
    await addDoc(collection(db, "cashbook"), { date: Timestamp.fromDate(d), type: cashType.value, reason, amount, createdAt: Timestamp.fromDate(new Date()), updatedAt: Timestamp.fromDate(new Date()), createdBy: currentUser?.uid || null });
    cashModal.classList.add("hidden"); await forceRefresh();
  } catch(e) { console.error(e); }
});

function generateReportHTML() {
  const dateStr = new Date().toLocaleDateString("fr-FR");
  const period = periodLabel.textContent;
  const treasuryPrev = document.getElementById("kpiTreasuryPrev")?.textContent || "$0";
  const treasuryTotal = document.getElementById("kpiTreasuryTotal")?.textContent || "$0";

  // Clone tables to remove action columns for the report
  const cloneTable = (selector, removeLast = true) => {
    const table = document.querySelector(selector).closest("table").cloneNode(true);
    if (removeLast) {
      table.querySelectorAll("tr").forEach(tr => {
        if (tr.lastElementChild) tr.lastElementChild.remove();
      });
    }
    return table.outerHTML;
  };

  const salariesHtml = cloneTable("#salaryTbody", false);
  const salesHtml = cloneTable("#txTbody", false); // Keep Vendeur for sales
  const cashbookHtml = cloneTable("#cashTbody", true);

  return `
    <div class="pdf-report" style="font-family: 'Poppins', sans-serif; color: #000; padding: 40px; background: #fff;">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
        .pdf-report h1, .pdf-report h2, .pdf-report h3 { color: #000; margin-top: 0; }
        .pdf-report .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px double #d4af37; padding-bottom: 20px; }
        .pdf-report .logo-box { display: flex; align-items: center; gap: 20px; }
        .pdf-report .logo-box img { height: 75px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
        .pdf-report .brand-info { line-height: 1.1; }
        .pdf-report .brand-info b { font-size: 24px; text-transform: uppercase; letter-spacing: 1.5px; display: block; }
        .pdf-report .brand-info span { color: #b08d1a; font-size: 13px; font-weight: 600; text-transform: uppercase; display: block; margin-top: 2px; }

        .pdf-report .report-meta { text-align: right; font-size: 12px; color: #777; }
        .pdf-report .report-meta b { color: #000; }

        .pdf-report .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
        .pdf-report .kpi-box { border: 1px solid #eee; padding: 20px; border-radius: 12px; background: linear-gradient(135deg, #ffffff, #fcfcfc); box-shadow: 0 4px 10px rgba(0,0,0,0.03); border-top: 4px solid #d4af37; }
        .pdf-report .kpi-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; font-weight: 700; }
        .pdf-report .kpi-value { font-size: 24px; font-weight: 800; color: #000; }
        .pdf-report .kpi-value.gold { color: #b08d1a; }

        .pdf-report h2 { font-size: 15px; border-left: 5px solid #d4af37; padding-left: 15px; margin-bottom: 20px; margin-top: 40px; text-transform: uppercase; letter-spacing: 2px; color: #111; font-weight: 800; }

        .pdf-report table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        .pdf-report th { background: #fdfdfd; text-align: left; padding: 12px 10px; border-bottom: 2px solid #d4af37; text-transform: uppercase; color: #444; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; }
        .pdf-report td { padding: 12px 10px; border-bottom: 1px solid #eee; color: #333; }
        .pdf-report tr:nth-child(even) { background: #fafafa; }
        .pdf-report .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; background: #f0f0f0; color: #666; border: 1px solid #ddd; }
        .pdf-report .badge-info { background: #e3f2fd; color: #1976d2; border-color: #bbdefb; }

        .pdf-report .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; }

        @media print {
          body * { visibility: hidden; }
          .pdf-report, .pdf-report * { visibility: visible; }
          .pdf-report { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 0 !important; margin: 0 !important; background: #fff !important; }
          .modal-overlay { background: none !important; backdrop-filter: none !important; position: static !important; }
          .modal-container { box-shadow: none !important; border: none !important; width: 100% !important; max-width: none !important; position: static !important; transform: none !important; }
          .modal-header, .modal-footer, .modal-body { padding: 0 !important; }
          .modal-header, .modal-footer { display: none !important; }
          .main-content, .app-container, .sidebar { display: none !important; }
          @page { margin: 1cm; }
        }
      </style>

      <div class="header">
        <div class="logo-box">
          <img src="PDM_Logo_Site.png" alt="PDM Logo">
          <div class="brand-info">
            <b>Premium Deluxe Motorsport</b>
            <span>Concessionnaire Urban Hills</span>
          </div>
        </div>
        <div class="report-meta">
          <div>Document financier officiel</div>
          <div>Édité le : <b>${dateStr}</b></div>
          <div style="margin-top: 5px; color: #000; font-weight: 600;">Période : ${esc(period)}</div>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="kpi-box">
          <div class="kpi-title">Chiffre d'Affaires</div>
          <div class="kpi-value gold">${kpiCa.textContent}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Profit Brut</div>
          <div class="kpi-value gold">${kpiProfit.textContent}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Dépenses & Frais</div>
          <div class="kpi-value" style="color: #c0392b;">${kpiExpense.textContent}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Résultat Net Période</div>
          <div class="kpi-value gold">${kpiNet.textContent}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Trésorerie S-1</div>
          <div class="kpi-value">${treasuryPrev}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Trésorerie Actuelle</div>
          <div class="kpi-value gold" style="border-bottom: 2px solid #d4af37; display: inline-block;">${treasuryTotal}</div>
        </div>
      </div>

      <h2>Rapport des Salaires & Commissions</h2>
      ${salariesHtml}

      <div style="page-break-before: always;"></div>

      <h2>Détail des Ventes du Stock</h2>
      ${salesHtml}

      <h2>Opérations de Trésorerie (Cashbook)</h2>
      ${cashbookHtml}

      <div class="footer">
        © ${new Date().getFullYear()} Premium Deluxe Motorsport — Document confidentiel à l'usage exclusif du département des finances publiques d'Urban Hills.
      </div>
    </div>
  `;
}

btnPdf?.addEventListener("click", () => {
  reportPreviewContent.innerHTML = generateReportHTML();
  reportModal.classList.remove("hidden");
});

btnPrintReport?.addEventListener("click", () => {
  window.print();
});

document.querySelectorAll("[data-close-report]").forEach(b => {
  b.addEventListener("click", () => reportModal.classList.add("hidden"));
});
if (reportModal) reportModal.addEventListener("click", (e) => { if (e.target === reportModal) reportModal.classList.add("hidden"); });

btnLogout?.addEventListener("click", async () => { await handleSignOut(auth); window.location.href = "pdm-staff.html"; });
btnWeek?.addEventListener("click", async () => { setRange(getWeekRange(new Date())); await refreshAll(); });
btnApply?.addEventListener("click", async () => { const r = parseDateInputs(); if (!r) return alert("Dates requises."); setRange(r); await refreshAll(); });
btnRefresh?.addEventListener("click", forceRefresh);
qInput?.addEventListener("input", applySearchFilter);
cashTbody?.addEventListener("click", async (e) => { const id = e.target?.dataset?.del; if (!id || !confirm("Supprimer ?")) return; await deleteDoc(doc(db, "cashbook", id)); await forceRefresh(); });

onAuthStateChanged(auth, async (u) => {
  if (!u) { window.location.href = "pdm-staff.html"; return; }
  if (!(await checkIsAdmin(u.uid))) { showDenyScreen(); return; }
  currentUser = u;
  try {
    const snap = await getDoc(doc(db, "users", u.uid));
    if (snap.exists()) renderUserBadge(snap.data());
  } catch(e) { console.error(e); }
  setRange(getWeekRange(new Date())); await refreshAll();
});
