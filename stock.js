// Stock & Réservations (Firestore)
// Collections utilisées :
// - stock/{id}: { brand, model, qty, createdAt, updatedAt, createdBy }
// - reservations/{id}: { clientName, brand, model, qty, status, createdAt, updatedAt, createdBy }

import { auth, db } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const els = {
  logoutBtn: document.getElementById("logoutBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  addStockBtn: document.getElementById("addStockBtn"),
  addResBtn: document.getElementById("addResBtn"),
  search: document.getElementById("search"),

  kpiStockQty: document.getElementById("kpiStockQty"),
  kpiStockLines: document.getElementById("kpiStockLines"),
  kpiResCount: document.getElementById("kpiResCount"),

  stockTable: document.getElementById("stockTable"),
  resTable: document.getElementById("resTable"),

  // modal
  itemModal: document.getElementById("itemModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalCancelBtn: document.getElementById("modalCancelBtn"),
  modalSaveBtn: document.getElementById("modalSaveBtn"),

  fType: document.getElementById("fType"),
  fBrand: document.getElementById("fBrand"),
  fModel: document.getElementById("fModel"),
  fQty: document.getElementById("fQty"),
  fClient: document.getElementById("fClient"),
  fStatus: document.getElementById("fStatus"),
  rowClient: document.getElementById("rowClient"),
  rowStatus: document.getElementById("rowStatus"),
};

let currentUser = null;
let editing = null; // { type: "stock"|"reservations", id: string }
let stockRows = [];
let resRows = [];

function moneySafe(n){ return Number.isFinite(n) ? n : 0; }

function showModal(open) {
  els.itemModal.style.display = open ? "flex" : "none";
  els.itemModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function setType(type) {
  els.fType.value = type;
  const isRes = type === "reservations";
  els.rowClient.style.display = isRes ? "block" : "none";
  els.rowStatus.style.display = isRes ? "block" : "none";
}

function openCreate(type) {
  editing = null;
  setType(type);
  els.modalTitle.textContent = (type === "stock") ? "Ajouter au stock" : "Nouvelle réservation";
  els.fBrand.value = "";
  els.fModel.value = "";
  els.fQty.value = 1;
  els.fClient.value = "";
  els.fStatus.value = "reserved";
  showModal(true);
}

function openEdit(type, row) {
  editing = { type, id: row.id };
  setType(type);
  els.modalTitle.textContent = (type === "stock") ? "Modifier stock" : "Modifier réservation";
  els.fBrand.value = row.brand ?? "";
  els.fModel.value = row.model ?? "";
  els.fQty.value = row.qty ?? 0;
  els.fClient.value = row.clientName ?? "";
  els.fStatus.value = row.status ?? "reserved";
  showModal(true);
}

function getSearch() {
  return (els.search.value || "").trim().toLowerCase();
}

function render() {
  const q = getSearch();

  const stockFiltered = stockRows.filter(r => {
    const hay = `${r.brand||""} ${r.model||""}`.toLowerCase();
    return !q || hay.includes(q);
  });

  const resFiltered = resRows.filter(r => {
    const hay = `${r.clientName||""} ${r.brand||""} ${r.model||""} ${r.status||""}`.toLowerCase();
    return !q || hay.includes(q);
  });

  // KPIs
  const qtySum = stockRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  els.kpiStockQty.textContent = String(qtySum);
  els.kpiStockLines.textContent = String(stockRows.length);
  els.kpiResCount.textContent = String(resRows.length);

  // Stock table
  if (stockFiltered.length === 0) {
    els.stockTable.innerHTML = `<tr><td colspan="4" class="muted">Aucun élément.</td></tr>`;
  } else {
    els.stockTable.innerHTML = stockFiltered.map(r => `
      <tr>
        <td>${escapeHtml(r.brand || "")}</td>
        <td>${escapeHtml(r.model || "")}</td>
        <td class="right">${Number(r.qty) || 0}</td>
        <td class="right">
          <button class="btn btn-sm" data-action="edit-stock" data-id="${r.id}">Modifier</button>
          <button class="btn btn-sm btn-danger" data-action="del-stock" data-id="${r.id}">Supprimer</button>
        </td>
      </tr>
    `).join("");
  }

  // Reservations table
  if (resFiltered.length === 0) {
    els.resTable.innerHTML = `<tr><td colspan="6" class="muted">Aucune réservation.</td></tr>`;
  } else {
    els.resTable.innerHTML = resFiltered.map(r => `
      <tr>
        <td>${escapeHtml(r.clientName || "—")}</td>
        <td>${escapeHtml(r.brand || "")}</td>
        <td>${escapeHtml(r.model || "")}</td>
        <td><span class="badge">${escapeHtml(labelStatus(r.status))}</span></td>
        <td class="right">${Number(r.qty) || 0}</td>
        <td class="right">
          <button class="btn btn-sm" data-action="edit-res" data-id="${r.id}">Modifier</button>
          <button class="btn btn-sm btn-danger" data-action="del-res" data-id="${r.id}">Supprimer</button>
        </td>
      </tr>
    `).join("");
  }
}

function labelStatus(s) {
  if (s === "cancelled") return "Annulé";
  if (s === "delivered") return "Livré";
  return "Réservé";
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

async function saveModal() {
  const type = els.fType.value; // "stock" or "reservations"
  const brand = (els.fBrand.value || "").trim();
  const model = (els.fModel.value || "").trim();
  const qty = Math.max(0, Number(els.fQty.value || 0));

  if (!brand || !model) {
    alert("Marque et modèle sont obligatoires.");
    return;
  }

  const base = {
    brand,
    model,
    qty,
    updatedAt: serverTimestamp(),
  };

  if (type === "reservations") {
    const clientName = (els.fClient.value || "").trim();
    const status = els.fStatus.value || "reserved";
    if (!clientName) {
      alert("Client obligatoire pour une réservation.");
      return;
    }
    base.clientName = clientName;
    base.status = status;
  }

  try {
    if (!editing) {
      await addDoc(collection(db, type), {
        ...base,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
      });
    } else {
      await updateDoc(doc(db, editing.type, editing.id), base);
    }
    showModal(false);
  } catch (e) {
    console.error(e);
    alert("Erreur Firestore (permissions ou config).");
  }
}

async function removeRow(type, id) {
  if (!confirm("Supprimer définitivement ?")) return;
  try {
    await deleteDoc(doc(db, type, id));
  } catch (e) {
    console.error(e);
    alert("Suppression impossible (permissions).");
  }
}

function bindTableClicks() {
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === "edit-stock") {
      const row = stockRows.find(r => r.id === id);
      if (row) openEdit("stock", row);
    }
    if (action === "del-stock") removeRow("stock", id);

    if (action === "edit-res") {
      const row = resRows.find(r => r.id === id);
      if (row) openEdit("reservations", row);
    }
    if (action === "del-res") removeRow("reservations", id);
  });
}

function bindUi() {
  els.logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "pdm-staff.html";
  });

  els.refreshBtn?.addEventListener("click", () => render());
  els.search?.addEventListener("input", () => render());

  els.addStockBtn?.addEventListener("click", () => openCreate("stock"));
  els.addResBtn?.addEventListener("click", () => openCreate("reservations"));

  els.modalCloseBtn?.addEventListener("click", () => showModal(false));
  els.modalCancelBtn?.addEventListener("click", () => showModal(false));
  els.itemModal?.addEventListener("click", (e) => {
    if (e.target === els.itemModal) showModal(false);
  });
  els.modalSaveBtn?.addEventListener("click", saveModal);
}

function startSnapshots() {
  const qStock = query(collection(db, "stock"), orderBy("updatedAt", "desc"));
  const qRes = query(collection(db, "reservations"), orderBy("updatedAt", "desc"));

  onSnapshot(qStock, (snap) => {
    stockRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    console.error("stock snapshot", err);
    els.stockTable.innerHTML = `<tr><td colspan="4" class="muted">Erreur Firestore (permissions).</td></tr>`;
  });

  onSnapshot(qRes, (snap) => {
    resRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    console.error("reservations snapshot", err);
    els.resTable.innerHTML = `<tr><td colspan="6" class="muted">Erreur Firestore (permissions).</td></tr>`;
  });
}

bindUi();
bindTableClicks();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "pdm-staff.html";
    return;
  }
  currentUser = user;
  startSnapshots();
});
