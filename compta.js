import { db, auth } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, getDocs, doc, deleteDoc, addDoc, query, where, orderBy, Timestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { checkIsAdmin, showDenyScreen, fmtMoney, esc, renderUserBadge, getWeekRange, toDateInputValue } from "./common.js";

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

let range = { from: null, to: null };
let txRows = [];
let cashRows = [];
let usersRows = [];
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
    txTbody.innerHTML = `<tr><td colspan="7" class="muted">Aucune vente.</td></tr>`;
    return;
  }
  txTbody.innerHTML = list.map(tx => `
    <tr>
      <td>${tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : "-"}</td>
      <td>${esc(tx.clientName || tx.client || "-")}</td>
      <td>${esc(tx.model || tx.vehicle || "-")}</td>
      <td>${fmtMoney(tx.buyPrice)}</td>
      <td>${fmtMoney(tx.sellPrice)}</td>
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

function renderKpis() {
  const ca = txRows.reduce((s, tx) => s + Number(tx.sellPrice || 0), 0);
  const profit = txRows.reduce((s, tx) => s + Number(tx.profit || 0), 0);
  const expense = cashRows.filter(c => c.type === "expense").reduce((s, c) => s + Number(c.amount || 0), 0);
  const other = cashRows.filter(c => c.type === "other").reduce((s, c) => s + Number(c.amount || 0), 0);
  const salaries = Array.from(document.querySelectorAll("#salaryTbody tr")).reduce((s, tr) => {
    const val = tr.children[4]?.textContent || "$0";
    return s + Number(val.replace(/[^0-9.-]+/g, ""));
  }, 0);
  const net = profit - expense + other - salaries;

  kpiCa.textContent = fmtMoney(ca);
  kpiProfit.textContent = fmtMoney(profit);
  kpiCount.textContent = String(txRows.length);
  kpiExpense.textContent = fmtMoney(expense);
  kpiOther.textContent = fmtMoney(other);
  kpiNet.textContent = fmtMoney(net);
}

function gradeRate(grade) {
  const g = String(grade || "").toLowerCase();
  if (g.includes("co") && g.includes("pdg")) return 0.12;
  if (g.includes("pdg") || g.includes("patron") || g.includes("admin")) return 0.05;
  return 0.10;
}

function renderSalaries() {
  const totalBaseAll = txRows.reduce((s, tx) => s + moneyBase(tx), 0);
  const sellersMap = new Map();
  usersRows.forEach(u => sellersMap.set(u.__id, { id: u.__id, name: u.name || u.email || u.__id, grade: u.grade || u.role || u.rank || "Vendeur", count: 0, base: 0 }));
  txRows.forEach(tx => {
    const sid = tx.sellerId;
    const sname = tx.sellerName || tx.importedSeller || tx.vendeur || "Vendeur Inconnu";
    if (sid && !sellersMap.has(sid)) sellersMap.set(sid, { id: sid, name: sname, grade: "Vendeur", count: 0, base: 0 });
    else if (!sid && !Array.from(sellersMap.values()).some(e => norm(e.name) === norm(sname))) sellersMap.set("legacy_" + sname, { id: null, name: sname, grade: "Vendeur", count: 0, base: 0 });
  });

  const finalRows = Array.from(sellersMap.values()).map(s => {
    const rate = gradeRate(s.grade);
    const lg = s.grade.toLowerCase();
    let count = 0, base = 0;
    if ((lg.includes("pdg") || lg.includes("patron") || lg.includes("admin")) && !lg.includes("co")) { count = txRows.length; base = totalBaseAll; }
    else {
      const userTxs = txRows.filter(tx => (tx.sellerId && tx.sellerId === s.id) || (norm(tx.sellerName || tx.importedSeller || tx.vendeur) === norm(s.name)));
      count = userTxs.length; base = userTxs.reduce((sum, tx) => sum + moneyBase(tx), 0);
    }
    return { ...s, count, salary: base * rate, rate };
  }).filter(r => r.salary > 0 || r.count > 0 || String(r.grade).toLowerCase().includes("pdg") || String(r.grade).toLowerCase().includes("admin")).sort((a, b) => b.salary - a.salary);

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

async function loadUsers() {
  const snap = await getDocs(query(collection(db, "users"), orderBy("updatedAt", "desc")));
  usersRows = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
}

async function loadTransactions() {
  const qy = query(collection(db, "transactions"), where("createdAt", ">=", Timestamp.fromDate(range.from)), where("createdAt", "<=", Timestamp.fromDate(range.to)), orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);
  txRows = snap.docs.map(d => {
    const data = d.data();
    const sell = Number(data.sellPrice ?? data.price ?? 0);
    const buy = Number(data.buyPrice ?? 0);
    return { ...data, __id: d.id, sellPrice: sell, buyPrice: buy, profit: Number.isFinite(data.profit) ? Number(data.profit) : (sell - buy) };
  });
}

async function loadCashbook() {
  const qy = query(collection(db, "cashbook"), where("date", ">=", Timestamp.fromDate(range.from)), where("date", "<=", Timestamp.fromDate(range.to)), orderBy("date", "desc"));
  const snap = await getDocs(qy);
  cashRows = snap.docs.map(d => ({ __id: d.id, ...d.data() }));
}

function applySearchFilter() {
  const q = norm(qInput.value);
  const filtered = !q ? txRows : txRows.filter(tx => [tx.clientName, tx.client, tx.model, tx.vehicle, tx.sellerName, tx.importedSeller, tx.vendeur].some(x => norm(x).includes(q)));
  renderTransactions(filtered); renderKpis(); renderSalaries();
}

async function refreshAll() {
  txTbody.innerHTML = `<tr><td colspan="7" class="muted">Chargement…</td></tr>`;
  cashTbody.innerHTML = `<tr><td colspan="5" class="muted">Chargement…</td></tr>`;
  salaryTbody.innerHTML = `<tr><td colspan="5" class="muted">Chargement…</td></tr>`;
  try {
    await Promise.all([loadUsers(), loadTransactions(), loadCashbook()]);
    renderCashbook(cashRows); renderSalaries(); renderKpis(); applySearchFilter();
  } catch(e) { console.error(e); }
}

btnAddCash?.addEventListener("click", () => { cashDate.value = toDateInputValue(new Date()); cashType.value = "expense"; cashReason.value = ""; cashAmount.value = ""; cashModal.classList.remove("hidden"); });
cashCancel?.addEventListener("click", () => cashModal.classList.add("hidden"));
cashSave?.addEventListener("click", async () => {
  const d = cashDate.value ? new Date(cashDate.value + "T12:00:00") : null;
  const amount = Number(cashAmount.value);
  const reason = cashReason.value.trim();
  if (!d || !Number.isFinite(amount) || amount <= 0 || !reason) return alert("Remplis Date + Montant (>0) + Libellé.");
  try {
    await addDoc(collection(db, "cashbook"), { date: Timestamp.fromDate(d), type: cashType.value, reason, amount, createdAt: Timestamp.fromDate(new Date()), updatedAt: Timestamp.fromDate(new Date()), createdBy: currentUser?.uid || null });
    cashModal.classList.add("hidden"); await refreshAll();
  } catch(e) { console.error(e); }
});

btnPdf?.addEventListener("click", () => {
  const html = `<html><head><meta charset="utf-8"/><title>Compta — Export</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;font-size:12px;}th{background:#f4f4f4;}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;}.kpi{border:1px solid #ddd;padding:10px;border-radius:8px;}@media print{button{display:none;}}</style></head><body><h1>Comptabilité</h1><div class="muted">Période : ${esc(periodLabel.textContent)}</div><div class="kpis"><div class="kpi">CA total<b>${kpiCa.textContent}</b></div><div class="kpi">Profit total<b>${kpiProfit.textContent}</b></div><div class="kpi">Dépenses<b>${kpiExpense.textContent}</b></div><div class="kpi">Résultat net<b>${kpiNet.textContent}</b></div></div><h2>Salaires</h2>${document.querySelector("#salaryTbody").closest("table").outerHTML}<h2>Ventes</h2>${document.querySelector("#txTbody").closest("table").outerHTML}<h2>Cashbook</h2>${document.querySelector("#cashTbody").closest("table").outerHTML}<script>window.onload=()=>window.print();</script></body></html>`;
  const w = window.open("", "_blank"); w.document.write(html); w.document.close();
});

btnLogout?.addEventListener("click", async () => { await signOut(auth); window.location.href = "pdm-staff.html"; });
btnWeek?.addEventListener("click", async () => { setRange(getWeekRange(new Date())); await refreshAll(); });
btnApply?.addEventListener("click", async () => { const r = parseDateInputs(); if (!r) return alert("Dates requises."); setRange(r); await refreshAll(); });
btnRefresh?.addEventListener("click", refreshAll);
qInput?.addEventListener("input", applySearchFilter);
cashTbody?.addEventListener("click", async (e) => { const id = e.target?.dataset?.del; if (!id || !confirm("Supprimer ?")) return; await deleteDoc(doc(db, "cashbook", id)); await refreshAll(); });

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
