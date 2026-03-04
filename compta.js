import { auth, db, Timestamp } from "./config.js";
import {
  collection, getDocs, addDoc, deleteDoc, doc,
  query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { money, esc, fmtDateFR } from "./common.js";

/**
 * Collections:
 * - transactions : ventes (AUTO)
 * - cashbook     : dépenses + gains hors ventes (MANUEL)
 * - users        : { name, grade: "Vendeur"|"Co-PDG"|"PDG", ... }
 */

const $ = (id) => document.getElementById(id);

const els = {
  q: $("q"),
  dateFrom: $("dateFrom"),
  dateTo: $("dateTo"),
  btnWeek: $("btnWeek"),
  btnApply: $("btnApply"),
  btnRefresh: $("btnRefresh"),
  btnAddCash: $("btnAddCash"),
  btnPdf: $("btnPdf"),
  btnLogout: $("btnLogout"),

  kpiSales: $("kpiSales"),
  kpiProfit: $("kpiProfit"),
  kpiCount: $("kpiCount"),
  kpiExpenses: $("kpiExpenses"),
  kpiOtherIncome: $("kpiOtherIncome"),
  kpiNet: $("kpiNet"),

  txBody: $("txBody"),
  cashBody: $("cashBody"),
  salaryBody: $("salaryBody"),
  periodPill: $("periodPill"),

  modalCash: $("modalCash"),
  cashClose: $("cashClose"),
  cashCancel: $("cashCancel"),
  cashSave: $("cashSave"),
  cashDate: $("cashDate"),
  cashType: $("cashType"),
  cashReason: $("cashReason"),
  cashAmount: $("cashAmount"),

  pdfRoot: $("pdfRoot"),
};

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

/** Semaine = Lundi 00:00 -> Dimanche 23:59 (timezone local) */
function getCurrentWeekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0=lundi, 6=dimanche
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: startOfDay(monday), to: endOfDay(sunday) };
}

function toDateInputValue(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseRangeFromUI() {
  const df = els.dateFrom.value ? new Date(els.dateFrom.value) : null;
  const dt = els.dateTo.value ? new Date(els.dateTo.value) : null;
  if (!df || !dt) return null;
  return { from: startOfDay(df), to: endOfDay(dt) };
}

function txDate(tx) {
  const d = tx?.date || tx?.createdAt;
  if (!d) return null;
  // Firestore Timestamp
  if (typeof d?.toDate === "function") return d.toDate();
  // already Date
  if (d instanceof Date) return d;
  // string/number fallback
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function cashDate(op) {
  const d = op?.date || op?.createdAt;
  if (!d) return null;
  if (typeof d?.toDate === "function") return d.toDate();
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getSell(tx) {
  const v = tx.sellPrice ?? tx.sell ?? tx.price ?? 0;
  return Number(v) || 0;
}
function getBuy(tx) {
  const v = tx.buyPrice ?? tx.buy ?? 0;
  return Number(v) || 0;
}
function getProfit(tx) {
  const explicit = tx.profit;
  if (explicit != null && !isNaN(Number(explicit))) return Number(explicit);
  const s = getSell(tx);
  const b = getBuy(tx);
  return (s && b) ? (s - b) : 0;
}

function getSellerKey(tx) {
  return tx.sellerId || tx.sellerUID || tx.sellerUid || tx.seller || tx.sellerName || tx.importedSeller || "—";
}

function isSale(tx) {
  const t = (tx.type || "").toLowerCase();
  // on garde large : tout ce qui ressemble à une vente / sale / transaction de vente
  if (t.includes("sale")) return true;
  if (t.includes("vente")) return true;
  // si pas de type, mais présence sellPrice/price + seller -> probablement vente
  const hasMoney = (tx.sellPrice != null) || (tx.price != null);
  const hasSeller = !!(tx.sellerId || tx.sellerName || tx.seller);
  return hasMoney && hasSeller;
}

function gradeRate(grade) {
  const g = (grade || "").toLowerCase();
  if (g === "vendeur") return 0.10;
  if (g === "co-pdg" || g === "copdg" || g === "co pdg") return 0.12;
  if (g === "pdg") return 0.05;
  return 0.10; // défaut safe
}

async function loadUsersMap() {
  const snap = await getDocs(collection(db, "users"));
  const map = new Map();
  snap.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  return map;
}

function setPeriodPill(from, to) {
  const label = `${fmtDateFR(from)} → ${fmtDateFR(to)}`;
  els.periodPill.innerHTML = `<span class="dot"></span> Période : <b>${esc(label)}</b>`;
}

function setLoading(tbody, cols) {
  tbody.innerHTML = `<tr><td colspan="${cols}" style="padding:14px; color:rgba(255,255,255,.55);">Chargement...</td></tr>`;
}

function setEmpty(tbody, cols, msg = "Aucun résultat.") {
  tbody.innerHTML = `<tr><td colspan="${cols}" style="padding:14px; color:rgba(255,255,255,.55);">${esc(msg)}</td></tr>`;
}

/**
 * Queries (range)
 * -> pour éviter les soucis d’index, on fait simple:
 *    on filtre sur "createdAt" si possible, sinon on récupère et filtre en JS.
 */
async function fetchTransactions(from, to) {
  // tentative query sur createdAt (si le champ existe partout)
  // sinon on récupère tout et filtre localement.
  let rows = [];

  try {
    const qy = query(
      collection(db, "transactions"),
      where("createdAt", ">=", Timestamp.fromDate(from)),
      where("createdAt", "<=", Timestamp.fromDate(to)),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(qy);
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    return rows;
  } catch (e) {
    // fallback : full scan + filtre local
    const snap = await getDocs(collection(db, "transactions"));
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    return rows.filter((tx) => {
      const d = txDate(tx);
      return d && d >= from && d <= to;
    }).sort((a, b) => (txDate(b)?.getTime() || 0) - (txDate(a)?.getTime() || 0));
  }
}

async function fetchCashbook(from, to) {
  let rows = [];
  try {
    const qy = query(
      collection(db, "cashbook"),
      where("date", ">=", Timestamp.fromDate(from)),
      where("date", "<=", Timestamp.fromDate(to)),
      orderBy("date", "desc")
    );
    const snap = await getDocs(qy);
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    return rows;
  } catch (e) {
    const snap = await getDocs(collection(db, "cashbook"));
    snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
    return rows.filter((op) => {
      const d = cashDate(op);
      return d && d >= from && d <= to;
    }).sort((a, b) => (cashDate(b)?.getTime() || 0) - (cashDate(a)?.getTime() || 0));
  }
}

function applySearchFilter(list, q) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return list;
  return list.filter((x) => {
    const bag = [
      x.clientName, x.client, x.model, x.vehicle, x.brand,
      x.sellerName, x.seller, x.importedSeller, x.detail, x.notes
    ].filter(Boolean).join(" ").toLowerCase();
    return bag.includes(s);
  });
}

function renderTransactions(txs) {
  if (!txs.length) return setEmpty(els.txBody, 7);

  els.txBody.innerHTML = txs.map((tx) => {
    const d = txDate(tx);
    const client = tx.clientName || tx.client || "—";
    const model = tx.model || tx.vehicle || "—";
    const sell = money(getSell(tx));
    const buy = money(getBuy(tx));
    const profit = money(getProfit(tx));
    const seller = tx.sellerName || tx.seller || tx.importedSeller || tx.sellerId || "—";

    return `
      <tr>
        <td style="padding:12px;">${esc(d ? fmtDateFR(d) : "—")}</td>
        <td style="padding:12px;">${esc(client)}</td>
        <td style="padding:12px;">${esc(model)}</td>
        <td style="padding:12px;">${esc(sell)}</td>
        <td style="padding:12px;">${esc(buy)}</td>
        <td style="padding:12px; color:rgba(246,210,107,.95); font-weight:800;">${esc(profit)}</td>
        <td style="padding:12px;">${esc(seller)}</td>
      </tr>
    `;
  }).join("");
}

function renderCashbook(ops) {
  if (!ops.length) return setEmpty(els.cashBody, 5);

  els.cashBody.innerHTML = ops.map((op) => {
    const d = cashDate(op);
    const type = (op.type || "").toLowerCase() === "income" ? "Gain" : "Dépense";
    const reason = op.reason || op.label || op.detail || "—";
    const amount = money(Number(op.amount || 0));
    const isIncome = (op.type || "").toLowerCase() === "income";

    return `
      <tr>
        <td style="padding:12px;">${esc(d ? fmtDateFR(d) : "—")}</td>
        <td style="padding:12px; font-weight:800; color:${isIncome ? "rgba(71,230,166,.95)" : "rgba(255,107,107,.95)"}">${esc(type)}</td>
        <td style="padding:12px;">${esc(reason)}</td>
        <td style="padding:12px; font-weight:800;">${esc(amount)}</td>
        <td style="padding:12px;">
          <button class="btn" data-del-cash="${esc(op.id)}">Supprimer</button>
        </td>
      </tr>
    `;
  }).join("");

  // delete handlers
  els.cashBody.querySelectorAll("[data-del-cash]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-cash");
      if (!confirm("Supprimer cette opération ?")) return;
      await deleteDoc(doc(db, "cashbook", id));
      await refresh();
    });
  });
}

function renderSalaries({ txs, usersMap, from, to }) {
  // sales only
  const sales = txs.filter(isSale);

  // totals per seller (by uid if possible)
  const bySeller = new Map();

  for (const tx of sales) {
    const sellerId = tx.sellerId || tx.sellerUID || tx.sellerUid || null;
    const key = sellerId || (tx.sellerName || tx.seller || tx.importedSeller || "—");
    const sell = getSell(tx);

    const prev = bySeller.get(key) || { key, sellerId, salesCount: 0, salesSum: 0 };
    prev.salesCount += 1;
    prev.salesSum += sell;
    bySeller.set(key, prev);
  }

  // build rows from users when possible
  const rows = [];
  for (const [key, v] of bySeller.entries()) {
    let u = null;
    if (v.sellerId && usersMap.has(v.sellerId)) u = usersMap.get(v.sellerId);

    const name = u?.name || u?.email || (typeof key === "string" ? key : "—");
    const grade = u?.grade || "Vendeur";
    const rate = gradeRate(grade);
    const commission = v.salesSum * rate;

    rows.push({
      name,
      grade,
      salesCount: v.salesCount,
      commissionRate: rate,
      salary: commission,
      sort: v.salesSum,
    });
  }

  // PDG line (5% on all sales in period) based on users.grade === "PDG"
  const totalSales = sales.reduce((acc, tx) => acc + getSell(tx), 0);
  const pdgs = [...usersMap.values()].filter((u) => (u.grade || "").toLowerCase() === "pdg");

  for (const pdg of pdgs) {
    rows.push({
      name: pdg.name || pdg.email || "PDG",
      grade: "PDG",
      salesCount: sales.length,
      commissionRate: 0.05,
      salary: totalSales * 0.05,
      sort: totalSales + 1e15, // always top
      isPDG: true,
    });
  }

  rows.sort((a, b) => (b.sort || 0) - (a.sort || 0));

  if (!rows.length) return setEmpty(els.salaryBody, 5, "Aucun salaire à calculer sur cette période.");

  els.salaryBody.innerHTML = rows.map((r) => `
    <tr>
      <td style="padding:12px; font-weight:900;">${esc(r.name)}</td>
      <td style="padding:12px;">${esc(r.grade)}</td>
      <td style="padding:12px;">${esc(String(r.salesCount))}</td>
      <td style="padding:12px;">${esc(Math.round((r.commissionRate || 0) * 100) + "%")}</td>
      <td style="padding:12px; color:rgba(246,210,107,.95); font-weight:900;">${esc(money(r.salary))}</td>
    </tr>
  `).join("");

  setPeriodPill(from, to);
}

function updateKPIs({ txs, ops }) {
  const sales = txs.filter(isSale);
  const totalSales = sales.reduce((acc, tx) => acc + getSell(tx), 0);
  const totalProfit = sales.reduce((acc, tx) => acc + getProfit(tx), 0);
  const count = sales.length;

  const expenses = ops
    .filter((x) => (x.type || "").toLowerCase() === "expense")
    .reduce((acc, x) => acc + (Number(x.amount) || 0), 0);

  const otherIncome = ops
    .filter((x) => (x.type || "").toLowerCase() === "income")
    .reduce((acc, x) => acc + (Number(x.amount) || 0), 0);

  const net = totalProfit + otherIncome - expenses;

  els.kpiSales.textContent = money(totalSales);
  els.kpiProfit.textContent = money(totalProfit);
  els.kpiCount.textContent = String(count);
  els.kpiExpenses.textContent = money(expenses);
  els.kpiOtherIncome.textContent = money(otherIncome);
  els.kpiNet.textContent = money(net);
}

function openCashModal() {
  els.cashDate.value = toDateInputValue(new Date());
  els.cashType.value = "expense";
  els.cashReason.value = "";
  els.cashAmount.value = "";
  els.modalCash.style.display = "flex";
}
function closeCashModal() {
  els.modalCash.style.display = "none";
}

async function exportPDF() {
  const { jsPDF } = window.jspdf;
  const target = els.pdfRoot;

  // petite pause pour fonts/layout
  await new Promise((r) => setTimeout(r, 50));

  const canvas = await html2canvas(target, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
    scrollY: -window.scrollY,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let y = 0;
  let heightLeft = imgH;

  pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
  heightLeft -= pageH;

  while (heightLeft > 0) {
    pdf.addPage();
    y = - (imgH - heightLeft);
    pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
    heightLeft -= pageH;
  }

  pdf.save(`PDM_Comptabilite_${new Date().toISOString().slice(0,10)}.pdf`);
}

let currentRange = null;

async function refresh() {
  const range = currentRange || getCurrentWeekRange();
  const { from, to } = range;

  setLoading(els.txBody, 7);
  setLoading(els.cashBody, 5);
  setLoading(els.salaryBody, 5);

  const [usersMap, txsRaw, opsRaw] = await Promise.all([
    loadUsersMap(),
    fetchTransactions(from, to),
    fetchCashbook(from, to),
  ]);

  // search filter
  const qtxt = els.q.value || "";
  const txs = applySearchFilter(txsRaw, qtxt);
  const ops = applySearchFilter(opsRaw, qtxt);

  renderTransactions(txs);
  renderCashbook(ops);
  updateKPIs({ txs, ops });
  renderSalaries({ txs, usersMap, from, to });
}

function wireUI() {
  els.btnWeek.addEventListener("click", async () => {
    const r = getCurrentWeekRange();
    currentRange = r;
    els.dateFrom.value = toDateInputValue(r.from);
    els.dateTo.value = toDateInputValue(r.to);
    await refresh();
  });

  els.btnApply.addEventListener("click", async () => {
    const r = parseRangeFromUI();
    if (!r) return alert("Choisis une date de début et une date de fin.");
    currentRange = r;
    await refresh();
  });

  els.btnRefresh.addEventListener("click", refresh);

  els.q.addEventListener("input", () => {
    // léger debounce
    window.clearTimeout(window.__pdmQTimer);
    window.__pdmQTimer = window.setTimeout(refresh, 200);
  });

  els.btnAddCash.addEventListener("click", openCashModal);
  els.cashClose.addEventListener("click", closeCashModal);
  els.cashCancel.addEventListener("click", closeCashModal);
  els.modalCash.addEventListener("click", (e) => {
    if (e.target === els.modalCash) closeCashModal();
  });

  els.cashSave.addEventListener("click", async () => {
    const dateStr = els.cashDate.value;
    const type = els.cashType.value;
    const reason = els.cashReason.value.trim();
    const amount = Number(els.cashAmount.value);

    if (!dateStr) return alert("Date obligatoire.");
    if (!reason) return alert("Libellé obligatoire.");
    if (!amount || amount <= 0) return alert("Montant invalide.");

    const d = new Date(dateStr);
    await addDoc(collection(db, "cashbook"), {
      type, // "expense" | "income"
      reason,
      amount,
      date: Timestamp.fromDate(startOfDay(d)),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    closeCashModal();
    await refresh();
  });

  els.btnPdf.addEventListener("click", exportPDF);

  els.btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

function initDefaultWeekUI() {
  const r = getCurrentWeekRange();
  currentRange = r;
  els.dateFrom.value = toDateInputValue(r.from);
  els.dateTo.value = toDateInputValue(r.to);
  setPeriodPill(r.from, r.to);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  initDefaultWeekUI();
  wireUI();
  await refresh();
});
