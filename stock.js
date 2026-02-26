// stock.js
import * as CFG from "./config.js";

import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

/* =========================
   Helpers
========================= */
const $ = (id) => document.getElementById(id);

function fmtDate(ts) {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusPill(status) {
  const s = (status || "reserved").toLowerCase();
  const label =
    s === "reserved" ? "Réservé" :
    s === "done" ? "Terminé" :
    s === "cancelled" ? "Annulé" : s;

  const cls =
    s === "reserved" ? "pill pill--blue" :
    s === "done" ? "pill pill--green" :
    s === "cancelled" ? "pill pill--red" : "pill";

  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

/* =========================
   Firebase handles
========================= */
const db = CFG.db;
const auth = CFG.auth;

if (!db || !auth) {
  console.error("[stock.js] config.js doit exporter db et auth.");
}

/* =========================
   DOM
========================= */
const stockTbody = $("stockTbody");
const resTbody = $("resTbody");

const statStockQty = $("statStockQty");
const statStockLines = $("statStockLines");
const statResActive = $("statResActive");

const searchInput = $("searchInput");

const btnRefresh = $("btnRefresh");
const btnAddStock = $("btnAddStock");
const btnAddReservation = $("btnAddReservation");
const btnLogout = $("btnLogout");

/* Modal */
const modalOverlay = $("modalOverlay");
const modalClose = $("modalClose");
const modalCancel = $("modalCancel");
const modalForm = $("modalForm");
const modalTitle = $("modalTitle");
const modalSubtitle = $("modalSubtitle");
const modalHint = $("modalHint");

const fBrand = $("fBrand");
const fModel = $("fModel");
const fQty = $("fQty");
const fClientName = $("fClientName");
const fStatus = $("fStatus");

const wrapClient = $("wrapClient");
const wrapStatus = $("wrapStatus");

/* =========================
   State
========================= */
let stockRows = [];        // {id, brand, model, qty, createdAt}
let reservationRows = [];  // {id, brand, model, qty, clientName, status, createdAt}

let modalMode = "stock";   // "stock" | "reservation"
let editingId = null;      // { mode, id }

/* =========================
   Render
========================= */
function applyFilter() {
  const q = (searchInput.value || "").trim().toLowerCase();

  const stockFiltered = !q
    ? stockRows
    : stockRows.filter(r =>
        `${r.brand} ${r.model}`.toLowerCase().includes(q)
      );

  const resFiltered = !q
    ? reservationRows
    : reservationRows.filter(r =>
        `${r.brand} ${r.model} ${r.clientName}`.toLowerCase().includes(q)
      );

  renderStock(stockFiltered);
  renderReservations(resFiltered);
  renderStats();
}

function renderStats() {
  const totalQty = stockRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  statStockQty.textContent = String(totalQty);
  statStockLines.textContent = String(stockRows.length);

  const active = reservationRows.filter(r => (r.status || "reserved") === "reserved").length;
  statResActive.textContent = String(active);
}

function renderStock(rows) {
  if (!rows.length) {
    stockTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucune ligne de stock.</td></tr>`;
    return;
  }

  stockTbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.brand)}</td>
      <td>${escapeHtml(r.model)}</td>
      <td>${escapeHtml(r.qty)}</td>
      <td>${escapeHtml(fmtDate(r.createdAt))}</td>
      <td class="tr">
        <button class="btn btn--sm" data-action="editStock" data-id="${r.id}">Modifier</button>
        <button class="btn btn--sm btn--danger" data-action="delStock" data-id="${r.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

function renderReservations(rows) {
  if (!rows.length) {
    resTbody.innerHTML = `<tr><td colspan="7" class="muted">Aucune réservation.</td></tr>`;
    return;
  }

  resTbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.brand)}</td>
      <td>${escapeHtml(r.model)}</td>
      <td>${escapeHtml(r.clientName || "—")}</td>
      <td>${escapeHtml(r.qty)}</td>
      <td>${statusPill(r.status)}</td>
      <td>${escapeHtml(fmtDate(r.createdAt))}</td>
      <td class="tr">
        <button class="btn btn--sm" data-action="editRes" data-id="${r.id}">Modifier</button>
        <button class="btn btn--sm btn--danger" data-action="delRes" data-id="${r.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

/* =========================
   Modal
========================= */
function openModal(mode, data = null) {
  modalMode = mode;
  editingId = data?.id || null;

  // Reset
  modalForm.reset();
  fQty.value = "1";
  fStatus.value = "reserved";
  fClientName.value = "";

  if (mode === "stock") {
    modalTitle.textContent = editingId ? "Modifier (Stock)" : "Ajouter (Stock)";
    modalSubtitle.textContent = "Collection: stock";
    wrapClient.classList.add("hidden");
    wrapStatus.classList.add("hidden");
    modalHint.textContent = "Ajoute / modifie une ligne de stock.";
  } else {
    modalTitle.textContent = editingId ? "Modifier (Réservation)" : "Ajouter (Réservation)";
    modalSubtitle.textContent = "Collection: reservations";
    wrapClient.classList.remove("hidden");
    wrapStatus.classList.remove("hidden");
    modalHint.textContent = "Réservation : client + statut.";
  }

  if (data) {
    fBrand.value = data.brand || "";
    fModel.value = data.model || "";
    fQty.value = String(data.qty ?? 1);
    fClientName.value = data.clientName || "";
    if (data.status) fStatus.value = data.status;
  }

  modalOverlay.classList.remove("hidden");
  modalOverlay.setAttribute("aria-hidden", "false");
  setTimeout(() => fBrand.focus(), 0);
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  modalOverlay.setAttribute("aria-hidden", "true");
  editingId = null;
}

modalClose?.addEventListener("click", closeModal);
modalCancel?.addEventListener("click", closeModal);
modalOverlay?.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeModal();
});

/* =========================
   CRUD
========================= */
async function saveModal() {
  const brand = (fBrand.value || "").trim();
  const model = (fModel.value || "").trim();
  const qty = Math.max(0, Number(fQty.value || 0));
  const clientName = (fClientName.value || "").trim();
  const status = (fStatus.value || "reserved").trim();

  if (!brand || !model) return;

  if (modalMode === "stock") {
    const payload = {
      brand,
      model,
      qty,
      updatedAt: serverTimestamp(),
      ...(editingId ? {} : { createdAt: serverTimestamp() }),
    };

    if (editingId) {
      await updateDoc(doc(db, "stock", editingId), payload);
    } else {
      await addDoc(collection(db, "stock"), payload);
    }
  } else {
    const payload = {
      brand,
      model,
      qty,
      clientName,
      status,
      updatedAt: serverTimestamp(),
      ...(editingId ? {} : { createdAt: serverTimestamp() }),
    };

    if (editingId) {
      await updateDoc(doc(db, "reservations", editingId), payload);
    } else {
      await addDoc(collection(db, "reservations"), payload);
    }
  }

  closeModal();
}

async function deleteRow(mode, id) {
  if (!confirm("Confirmer la suppression ?")) return;
  const col = mode === "stock" ? "stock" : "reservations";
  await deleteDoc(doc(db, col, id));
}

/* =========================
   Events
========================= */
searchInput?.addEventListener("input", applyFilter);

btnRefresh?.addEventListener("click", () => applyFilter());
btnAddStock?.addEventListener("click", () => openModal("stock"));
btnAddReservation?.addEventListener("click", () => openModal("reservation"));

stockTbody?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.action === "editStock") {
    const row = stockRows.find(r => r.id === id);
    openModal("stock", row);
  }
  if (btn.dataset.action === "delStock") {
    deleteRow("stock", id);
  }
});

resTbody?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.action === "editRes") {
    const row = reservationRows.find(r => r.id === id);
    openModal("reservation", row);
  }
  if (btn.dataset.action === "delRes") {
    deleteRow("reservation", id);
  }
});

modalForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await saveModal();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l’enregistrement (voir console).");
  }
});

btnLogout?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "pdm-staff.html";
  } catch (e) {
    console.error(e);
  }
});

/* =========================
   Live listeners
========================= */
function attachListeners() {
  // STOCK
  const qStock = query(collection(db, "stock"), orderBy("createdAt", "desc"));
  onSnapshot(qStock, (snap) => {
    stockRows = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        brand: data.brand ?? "",
        model: data.model ?? "",
        qty: data.qty ?? 0,
        createdAt: data.createdAt,
      };
    });
    applyFilter();
  }, (err) => console.error("[stock] snapshot error:", err));

  // RESERVATIONS
  const qRes = query(collection(db, "reservations"), orderBy("createdAt", "desc"));
  onSnapshot(qRes, (snap) => {
    reservationRows = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        brand: data.brand ?? "",
        model: data.model ?? "",
        qty: data.qty ?? 0,
        clientName: data.clientName ?? "",
        status: data.status ?? "reserved",
        createdAt: data.createdAt,
      };
    });
    applyFilter();
  }, (err) => console.error("[reservations] snapshot error:", err));
}

/* =========================
   Boot
========================= */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "pdm-staff.html";
    return;
  }
  attachListeners();
});
