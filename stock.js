// stock.js
import { app, auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Elements
const searchInput = document.getElementById("searchInput");
const refreshBtn  = document.getElementById("refreshBtn");
const addStockBtn = document.getElementById("addStockBtn");
const addResBtn   = document.getElementById("addResBtn");

const statStockQty   = document.getElementById("statStockQty");
const statStockLines = document.getElementById("statStockLines");
const statResActive  = document.getElementById("statResActive");

const stockTbody = document.getElementById("stockTable");
const resTbody   = document.getElementById("resTable");

// Modal
const editModal  = document.getElementById("editModal");
const closeModal = document.getElementById("closeModal");
const mTitle     = document.getElementById("mTitle");
const mSub       = document.getElementById("mSub");
const mBrand     = document.getElementById("mBrand");
const mModel     = document.getElementById("mModel");
const mQty       = document.getElementById("mQty");
const mClient    = document.getElementById("mClient");
const saveBtn    = document.getElementById("saveBtn");
const cancelBtn  = document.getElementById("cancelBtn");

const logoutBtn  = document.getElementById("logoutBtn");

let mode = "stock";          // "stock" | "res"
let editTarget = null;       // { kind, id } or null
let rowsStock = [];
let rowsRes = [];

function fmtDate(ts) {
  try {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
    return d.toLocaleDateString("fr-FR");
  } catch { return "—"; }
}

function openModal({ title, sub, kind, row }) {
  mode = kind;
  editTarget = row?.id ? { kind, id: row.id } : null;

  mTitle.textContent = title;
  mSub.textContent = sub;

  mBrand.value  = row?.brand  ?? "";
  mModel.value  = row?.model  ?? "";
  mQty.value    = row?.qty    ?? 1;
  mClient.value = row?.client ?? "";

  // Client only for reservation
  mClient.closest(".field").style.display = (kind === "res") ? "" : "none";

  editModal.classList.add("open");
  editModal.setAttribute("aria-hidden", "false");
}

function closeModalFn() {
  editModal.classList.remove("open");
  editModal.setAttribute("aria-hidden", "true");
  editTarget = null;
}

function filterText(s) {
  return (s ?? "").toString().trim().toLowerCase();
}

function applyFilter() {
  const q = filterText(searchInput.value);

  const s = q
    ? rowsStock.filter(r => [r.brand, r.model].some(x => filterText(x).includes(q)))
    : rowsStock;

  const r = q
    ? rowsRes.filter(r => [r.brand, r.model, r.client].some(x => filterText(x).includes(q)))
    : rowsRes;

  renderStock(s);
  renderRes(r);
}

function renderStock(list) {
  if (!list.length) {
    stockTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucune ligne.</td></tr>`;
    return;
  }

  stockTbody.innerHTML = list.map(row => `
    <tr>
      <td>${row.brand ?? "-"}</td>
      <td>${row.model ?? "-"}</td>
      <td>${row.qty ?? 0}</td>
      <td>${fmtDate(row.createdAt)}</td>
      <td class="td-actions">
        <button class="btn btn-sm" data-action="edit" data-kind="stock" data-id="${row.id}">Modifier</button>
        <button class="btn btn-sm btn-danger" data-action="del" data-kind="stock" data-id="${row.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

function renderRes(list) {
  if (!list.length) {
    resTbody.innerHTML = `<tr><td colspan="7" class="muted">Aucune ligne.</td></tr>`;
    return;
  }

  resTbody.innerHTML = list.map(row => `
    <tr>
      <td>${row.brand ?? "-"}</td>
      <td>${row.model ?? "-"}</td>
      <td>${row.client ?? "-"}</td>
      <td>${row.qty ?? 0}</td>
      <td><span class="pill">${row.status ?? "RÉSERVÉ"}</span></td>
      <td>${fmtDate(row.createdAt)}</td>
      <td class="td-actions">
        <button class="btn btn-sm" data-action="edit" data-kind="res" data-id="${row.id}">Modifier</button>
        <button class="btn btn-sm btn-danger" data-action="del" data-kind="res" data-id="${row.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

function refreshStats() {
  const totalQty = rowsStock.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  statStockQty.textContent = `${totalQty}`;
  statStockLines.textContent = `${rowsStock.length}`;
  statResActive.textContent = `${rowsRes.length}`;
}

// Firestore listeners
let unsubStock = null;
let unsubRes = null;

function startListeners() {
  const qStock = query(collection(db, "stock"), orderBy("createdAt", "desc"));
  const qRes   = query(collection(db, "reservations"), orderBy("createdAt", "desc"));

  unsubStock = onSnapshot(qStock, (snap) => {
    rowsStock = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilter();
    refreshStats();
  });

  unsubRes = onSnapshot(qRes, (snap) => {
    rowsRes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilter();
    refreshStats();
  });
}

function stopListeners() {
  try { unsubStock?.(); } catch {}
  try { unsubRes?.(); } catch {}
  unsubStock = unsubRes = null;
}

// Events
searchInput.addEventListener("input", applyFilter);

refreshBtn.addEventListener("click", () => {
  // force redraw (snapshots already live)
  applyFilter();
  refreshStats();
});

addStockBtn.addEventListener("click", () => {
  openModal({
    title: "Ajouter",
    sub: "Si client vide → Stock",
    kind: "stock",
    row: { qty: 1 }
  });
});

addResBtn.addEventListener("click", () => {
  openModal({
    title: "Ajouter",
    sub: "Client requis → Réservation",
    kind: "res",
    row: { qty: 1, status: "RÉSERVÉ" }
  });
});

closeModal.addEventListener("click", closeModalFn);
cancelBtn.addEventListener("click", closeModalFn);
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) closeModalFn();
});

saveBtn.addEventListener("click", async () => {
  const brand = (mBrand.value || "").trim();
  const model = (mModel.value || "").trim();
  const qty = Math.max(0, Number(mQty.value || 0));
  const client = (mClient.value || "").trim();

  if (!brand || !model) {
    alert("Marque et modèle sont requis.");
    return;
  }

  try {
    if (editTarget) {
      // update existing
      const colName = editTarget.kind === "res" ? "reservations" : "stock";
      const ref = doc(db, colName, editTarget.id);

      const payload = {
        brand, model, qty,
        updatedAt: serverTimestamp()
      };

      if (editTarget.kind === "res") {
        payload.client = client || "-";
        payload.status = "RÉSERVÉ";
      }

      await updateDoc(ref, payload);
    } else {
      // create new
      if (mode === "res") {
        if (!client) {
          alert("Client requis pour une réservation.");
          return;
        }
        await addDoc(collection(db, "reservations"), {
          brand, model, qty,
          client,
          status: "RÉSERVÉ",
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || null
        });
      } else {
        await addDoc(collection(db, "stock"), {
          brand, model, qty,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || null
        });
      }
    }

    closeModalFn();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'enregistrement.");
  }
});

function handleTableClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const kind = btn.dataset.kind;       // stock | res
  const id = btn.dataset.id;

  const list = (kind === "res") ? rowsRes : rowsStock;
  const row = list.find(r => r.id === id);
  if (!row) return;

  if (action === "edit") {
    openModal({
      title: "Modifier",
      sub: kind === "res" ? "Réservation" : "Stock",
      kind,
      row
    });
  }

  if (action === "del") {
    const ok = confirm("Supprimer cette ligne ?");
    if (!ok) return;
    const colName = kind === "res" ? "reservations" : "stock";
    deleteDoc(doc(db, colName, id)).catch((err) => {
      console.error(err);
      alert("Erreur lors de la suppression.");
    });
  }
}

stockTbody.addEventListener("click", handleTableClick);
resTbody.addEventListener("click", handleTableClick);

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

// Auth guard (simple)
onAuthStateChanged(auth, (user) => {
  if (!user) {
    stopListeners();
    window.location.href = "pdm-staff.html";
    return;
  }
  if (!unsubStock && !unsubRes) startListeners();
});
