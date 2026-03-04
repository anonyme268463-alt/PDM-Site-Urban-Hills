import { db, auth } from "./config.js";
import { requireAdmin } from "./guard.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

// ---------------------- DOM
const $ = (id) => document.getElementById(id);

const txBody = $("txBody");
const cashBody = $("cashBody");
const payBody = $("payBody");

const kpiCA = $("kpiCA");
const kpiProfit = $("kpiProfit");
const kpiCount = $("kpiCount");
const kpiExpense = $("kpiExpense");
const kpiOther = $("kpiOther");
const kpiNet = $("kpiNet");

const search = $("search");
const dateStart = $("dateStart");
const dateEnd = $("dateEnd");
const rangeLabel = $("rangeLabel");
const payPeriod = $("payPeriod");

const btnThisWeek = $("btnThisWeek");
const btnApply = $("btnApply");
const btnRefresh = $("btnRefresh");
const btnPdf = $("btnPdf");
const btnAddCash = $("btnAddCash");

const logoutBtn = $("logoutBtn");

// Modal cashbook
const cashModal = $("cashModal");
const closeCashModal = $("closeCashModal");
const cancelCash = $("cancelCash");
const saveCash = $("saveCash");
const cashType = $("cashType");
const cashLabel = $("cashLabel");
const cashAmount = $("cashAmount");
const cashDate = $("cashDate");

// ---------------------- Helpers
function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-US");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseTxDate(t) {
  // ventes.js stocke "date" comme string YYYY-MM-DD
  if (t?.date && typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
    const [y, m, day] = t.date.split("-").map(Number);
    return new Date(y, m - 1, day, 12, 0, 0);
  }
  // fallback Firestore Timestamp
  if (t?.createdAt?.toDate) {
    try { return t.createdAt.toDate(); } catch {}
  }
  return null;
}

function parseCashDate(c) {
  if (c?.date && typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date)) {
    const [y, m, day] = c.date.split("-").map(Number);
    return new Date(y, m - 1, day, 12, 0, 0);
  }
  if (c?.createdAt?.toDate) {
    try { return c.createdAt.toDate(); } catch {}
  }
  return null;
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

function getCurrentWeekRange() {
  // Lundi -> Dimanche (local)
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = lundi
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [startOfDay(monday), endOfDay(sunday)];
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function gradeRate(grade) {
  const g = normalize(grade);
  if (g === "co-pdg" || g === "copdg" || g === "co pdg") return 0.12;
  if (g === "pdg") return 0.05; // PDG = sur tout (traité à part)
  return 0.10; // vendeur (default)
}

function isInRange(d, a, b) {
  if (!d) return false;
  return d >= a && d <= b;
}

function openModal() { cashModal.classList.remove("hidden"); }
function closeModal() { cashModal.classList.add("hidden"); }

// ---------------------- State
let CACHE = {
  transactions: [],
  cashbook: [],
  users: [],
};

let RANGE = {
  start: null,
  end: null,
};

// ---------------------- Data load
async function loadAll() {
  txBody.innerHTML = `<tr><td colspan="7">Chargement...</td></tr>`;
  cashBody.innerHTML = `<tr><td colspan="5">Chargement...</td></tr>`;
  payBody.innerHTML = `<tr><td colspan="5">Chargement...</td></tr>`;

  const [txSnap, cashSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, "transactions")),
    getDocs(collection(db, "cashbook")),
    getDocs(collection(db, "users")),
  ]);

  CACHE.transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  CACHE.cashbook = cashSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  CACHE.users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  render();
}

// ---------------------- Rendering
function render() {
  const q = normalize(search?.value);

  const a = RANGE.start;
  const b = RANGE.end;

  const rangeTxt = `${a.toLocaleDateString("fr-FR")} → ${b.toLocaleDateString("fr-FR")}`;
  rangeLabel.textContent = `Période affichée : ${rangeTxt}`;
  payPeriod.textContent = rangeTxt;

  // Filter TX
  let tx = CACHE.transactions
    .map((t) => ({ ...t, _dt: parseTxDate(t) }))
    .filter((t) => isInRange(t._dt, a, b));

  if (q) {
    tx = tx.filter((t) => {
      const hay = [
        t.client,
        t.model,
        t.seller,
      ].map(normalize).join(" ");
      return hay.includes(q);
    });
  }

  // Filter cashbook
  let cash = CACHE.cashbook
    .map((c) => ({ ...c, _dt: parseCashDate(c) }))
    .filter((c) => isInRange(c._dt, a, b));

  if (q) {
    cash = cash.filter((c) => {
      const hay = [c.label, c.type].map(normalize).join(" ");
      return hay.includes(q);
    });
  }

  // KPIs
  const ca = tx.reduce((s, t) => s + Number(t.sellPrice || 0), 0);
  const profit = tx.reduce((s, t) => s + Number(t.profit ?? (Number(t.sellPrice || 0) - Number(t.buyPrice || 0))), 0);
  const count = tx.length;

  const expense = cash
    .filter((c) => normalize(c.type) === "expense")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const other = cash
    .filter((c) => normalize(c.type) === "income")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const net = profit + other - expense;

  kpiCA.textContent = money(ca);
  kpiProfit.textContent = money(profit);
  kpiCount.textContent = String(count);
  kpiExpense.textContent = money(expense);
  kpiOther.textContent = money(other);
  kpiNet.textContent = money(net);

  // TX table
  if (tx.length === 0) {
    txBody.innerHTML = `<tr><td colspan="7">Aucune vente sur la période</td></tr>`;
  } else {
    txBody.innerHTML = tx
      .sort((x, y) => (y._dt?.getTime() || 0) - (x._dt?.getTime() || 0))
      .map((t) => {
        const dt = t._dt ? t._dt.toLocaleDateString("fr-FR") : "-";
        const buy = Number(t.buyPrice || 0);
        const sell = Number(t.sellPrice || 0);
        const pr = Number(t.profit ?? (sell - buy));
        return `
          <tr>
            <td>${dt}</td>
            <td>${t.client || "-"}</td>
            <td>${t.model || "-"}</td>
            <td>${money(sell)}</td>
            <td>${money(buy)}</td>
            <td>${money(pr)}</td>
            <td>${t.seller || "-"}</td>
          </tr>
        `;
      })
      .join("");
  }

  // Cashbook table
  if (cash.length === 0) {
    cashBody.innerHTML = `<tr><td colspan="5">Aucune opération manuelle sur la période</td></tr>`;
  } else {
    cashBody.innerHTML = cash
      .sort((x, y) => (y._dt?.getTime() || 0) - (x._dt?.getTime() || 0))
      .map((c) => {
        const dt = c._dt ? c._dt.toLocaleDateString("fr-FR") : "-";
        const type = normalize(c.type) === "expense" ? "Dépense" : "Gain";
        const amt = Number(c.amount || 0);
        return `
          <tr>
            <td>${dt}</td>
            <td>${type}</td>
            <td>${c.label || "-"}</td>
            <td>${money(amt)}</td>
            <td class="no-print">
              <div class="table-actions">
                <button class="btn btn-danger" data-del="${c.id}">Supprimer</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    cashBody.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        if (!confirm("Supprimer cette opération ?")) return;
        await deleteDoc(doc(db, "cashbook", id));
        await loadAll();
      });
    });
  }

  // Payroll
  renderPayroll(tx, ca);
}

function renderPayroll(tx, totalCA) {
  // map users by name/email for matching seller string
  const byKey = new Map();
  const users = CACHE.users.map((u) => ({
    id: u.id,
    name: u.name || u.displayName || u.email || u.id,
    email: u.email || "",
    grade: u.grade || "Vendeur",
  }));

  for (const u of users) {
    byKey.set(normalize(u.name), u);
    if (u.email) byKey.set(normalize(u.email), u);
  }

  // Aggregate per seller (own sales)
  const agg = new Map(); // userId -> {user, count, ca}
  for (const t of tx) {
    const sellerStr = normalize(t.seller || "");
    if (!sellerStr) continue;

    const u = byKey.get(sellerStr);
    if (!u) continue;

    const key = u.id;
    if (!agg.has(key)) agg.set(key, { user: u, count: 0, ca: 0 });
    const a = agg.get(key);

    a.count += 1;
    a.ca += Number(t.sellPrice || 0);
  }

  // PDG line (5% on all sales)
  const pdgUser = users.find((u) => normalize(u.grade) === "pdg") || null;
  const pdgSalary = totalCA * 0.05;

  // Build rows (exclude PDG from "own commission" rows to avoid confusion)
  const rows = Array.from(agg.values())
    .filter((x) => normalize(x.user.grade) !== "pdg")
    .sort((a, b) => b.ca - a.ca)
    .map((x) => {
      const rate = gradeRate(x.user.grade);
      const salary = x.ca * rate;
      const pct = Math.round(rate * 100);
      return `
        <tr>
          <td>${x.user.name}</td>
          <td>${x.user.grade}</td>
          <td>${x.count}</td>
          <td>${pct}%</td>
          <td><b>${money(salary)}</b></td>
        </tr>
      `;
    });

  const pdgRow = `
    <tr>
      <td>${pdgUser ? pdgUser.name : "PDG"}</td>
      <td>PDG</td>
      <td>${tx.length}</td>
      <td>5% (global)</td>
      <td><b>${money(pdgSalary)}</b></td>
    </tr>
  `;

  if (rows.length === 0 && tx.length === 0) {
    payBody.innerHTML = `<tr><td colspan="5">Aucune vente sur la période</td></tr>`;
    return;
  }

  payBody.innerHTML = pdgRow + rows.join("");
}

// ---------------------- Actions
function applyRangeFromInputs() {
  const s = dateStart.value;
  const e = dateEnd.value;
  if (!s || !e) return;

  const ds = startOfDay(new Date(s + "T12:00:00"));
  const de = endOfDay(new Date(e + "T12:00:00"));

  RANGE.start = ds;
  RANGE.end = de;

  render();
}

function setThisWeek() {
  const [a, b] = getCurrentWeekRange();
  RANGE.start = a;
  RANGE.end = b;

  dateStart.value = toISODate(a);
  dateEnd.value = toISODate(b);

  render();
}

async function addCashEntry() {
  const type = cashType.value;
  const label = cashLabel.value.trim();
  const amt = Number(cashAmount.value || 0);
  const dt = cashDate.value;

  if (!label) return alert("Libellé obligatoire.");
  if (!amt || amt <= 0) return alert("Montant invalide.");
  if (!dt) return alert("Date obligatoire.");

  const user = auth.currentUser;
  await addDoc(collection(db, "cashbook"), {
    type, // "expense" | "income"
    label,
    amount: amt,
    date: dt, // YYYY-MM-DD (simple & aligné avec transactions)
    createdAt: serverTimestamp(),
    createdBy: user?.uid || null,
    createdByName: user?.displayName || user?.email || null,
  });

  closeModal();
  cashLabel.value = "";
  cashAmount.value = "";
  // garde la date si tu veux (pratique) => on ne reset pas cashDate

  await loadAll();
}

// ---------------------- Init
async function init() {
  // Admin guard
  const ok = await requireAdmin();
  if (!ok) return;

  // default week
  const [a, b] = getCurrentWeekRange();
  RANGE.start = a;
  RANGE.end = b;
  dateStart.value = toISODate(a);
  dateEnd.value = toISODate(b);

  // listeners
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "pdm-staff.html";
    });
  }

  if (search) search.addEventListener("input", render);

  btnThisWeek?.addEventListener("click", setThisWeek);
  btnApply?.addEventListener("click", applyRangeFromInputs);
  btnRefresh?.addEventListener("click", loadAll);

  btnPdf?.addEventListener("click", () => window.print());

  btnAddCash?.addEventListener("click", () => {
    // date par défaut = aujourd'hui (dans la plage)
    cashDate.value = toISODate(new Date());
    openModal();
  });

  closeCashModal?.addEventListener("click", closeModal);
  cancelCash?.addEventListener("click", closeModal);
  cashModal?.addEventListener("click", (e) => { if (e.target === cashModal) closeModal(); });

  saveCash?.addEventListener("click", addCashEntry);

  await loadAll();
}

init();
