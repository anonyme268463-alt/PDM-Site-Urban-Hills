// stock.js
import { auth, db } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const els = {
  logoutBtn: $("logoutBtn"),

  kpiStockQty: $("kpiStockQty"),
  kpiStockLines: $("kpiStockLines"),
  kpiResCount: $("kpiResCount"),

  search: $("search"),
  stockTable: $("stockTable"),
  resTable: $("resTable"),

  addStockBtn: $("addStockBtn"),
  addResBtn: $("addResBtn"),
  refreshBtn: $("refreshBtn"),

  // modal commun
  modal: $("itemModal"),
  closeModal: $("closeModal"),
  cancelBtn: $("cancelBtn"),
  saveBtn: $("saveBtn"),
  mTitle: $("mTitle"),

  // form
  fType: $("fType"), // "stock" ou "reservations"
  fBrand: $("fBrand"),
  fModel: $("fModel"),
  fQty: $("fQty"),
  fStatus: $("fStatus"), // reserved / delivered / cancelled (reservations)
  fClientName: $("fClientName"),
  fNotes: $("fNotes"),
};

let currentUser = null;
let currentRole = "staff";
let stockCache = [];
let resCache = [];
let editing = { type: null, id: null };

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toDateFr(ts) {
  if (!ts) return "-";
  if (ts instanceof Timestamp) return ts.toDate().toLocaleDateString("fr-FR");
  if (typeof ts === "number") return new Date(ts).toLocaleDateString("fr-FR");
  return "-";
}

async function loadRole(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    currentRole = snap.exists() ? (snap.data().role || "staff") : "staff";
  } catch {
    currentRole = "staff";
  }
}

function isAdmin() {
  return currentRole === "admin";
}

function showModal(open) {
  els.modal.classList.toggle("hidden", !open);
}

function resetForm(type) {
  editing = { type: null, id: null };
  els.mTitle.textContent = type === "reservations" ? "Ajouter reservation" : "Ajouter stock";
  els.fType.value = type;

  els.fBrand.value = "";
  els.fModel.value = "";
  els.fQty.value = 1;
  els.fStatus.value = "reserved";
  els.fClientName.value = "";
  els.fNotes.value = "";

  // champs visibles selon type
  updateFormVisibility();
}

function updateFormVisibility() {
  const type = els.fType.value;
  const isRes = type === "reservations";

  // option simple : cacher client/status si stock
  $("rowClient")?.classList.toggle("hidden", !isRes);
  $("rowStatus")?.classList.toggle("hidden", !isRes);
}

function openAddStock() {
  resetForm("stock");
  showModal(true);
}

function openAddRes() {
  resetForm("reservations");
  showModal(true);
}

function openEdit(type, item) {
  editing = { type, id: item.id };
  els.mTitle.textContent = type === "reservations" ? "Modifier reservation" : "Modifier stock";
  els.fType.value = type;

  els.fBrand.value = item.brand || "";
  els.fModel.value = item.model || "";
  els.fQty.value = Number(item.qty || 0);

  els.fStatus.value = item.status || "reserved";
  els.fClientName.value = item.clientName || "";
  els.fNotes.value = item.notes || "";

  updateFormVisibility();
  showModal(true);
}

function computeKpis() {
  const totalQty = stockCache.reduce((acc, x) => acc + Number(x.qty || 0), 0);
  els.kpiStockQty.textContent = String(totalQty);
  els.kpiStockLines.textContent = String(stockCache.length);

  // reservations actives = status reserved
  const activeRes = resCache.filter((x) => (x.status || "reserved") === "reserved").length;
  els.kpiResCount.textContent = String(activeRes);
}

function render() {
  const q = (els.search?.value || "").trim().toLowerCase();

  const stockList = !q
    ? stockCache
    : stockCache.filter((x) => (x.model || "").toLowerCase().includes(q) || (x.brand || "").toLowerCase().includes(q));

  const resList = !q
    ? resCache
    : resCache.filter(
        (x) =>
          (x.model || "").toLowerCase().includes(q) ||
          (x.brand || "").toLowerCase().includes(q) ||
          (x.clientName || "").toLowerCase().includes(q)
      );

  // STOCK TABLE
  els.stockTable.innerHTML = stockList.length
    ? stockList
        .map((x) => {
          const canEdit = isAdmin() || x.createdBy === currentUser?.uid;
          return `
          <tr>
            <td>${escapeHtml(x.brand || "-")}</td>
            <td>${escapeHtml(x.model || "-")}</td>
            <td>${escapeHtml(String(x.qty ?? 0))}</td>
            <td>${escapeHtml(toDateFr(x.createdAt))}</td>
            <td style="text-align:right; white-space:nowrap;">
              <button class="btn btn-sm" data-act="edit" data-type="stock" data-id="${x.id}" ${canEdit ? "" : "disabled"}>Edit</button>
              <button class="btn btn-sm btn-danger" data-act="del" data-type="stock" data-id="${x.id}" ${canEdit ? "" : "disabled"}>Del</button>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="5">Aucun stock</td></tr>`;

  // RESERVATIONS TABLE
  els.resTable.innerHTML = resList.length
    ? resList
        .map((x) => {
          const canEdit = isAdmin() || x.createdBy === currentUser?.uid;
          const status = x.status || "reserved";
          return `
          <tr>
            <td>${escapeHtml(x.brand || "-")}</td>
            <td>${escapeHtml(x.model || "-")}</td>
            <td>${escapeHtml(x.clientName || "-")}</td>
            <td>${escapeHtml(String(x.qty ?? 0))}</td>
            <td>${escapeHtml(status)}</td>
            <td>${escapeHtml(toDateFr(x.createdAt))}</td>
            <td style="text-align:right; white-space:nowrap;">
              <button class="btn btn-sm" data-act="edit" data-type="reservations" data-id="${x.id}" ${canEdit ? "" : "disabled"}>Edit</button>
              <button class="btn btn-sm btn-danger" data-act="del" data-type="reservations" data-id="${x.id}" ${canEdit ? "" : "disabled"}>Del</button>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="7">Aucune reservation</td></tr>`;
}

function normalizeDoc(d) {
  const x = d.data();
  return {
    id: d.id,
    brand: x.brand || "",
    model: x.model || "",
    qty: Number(x.qty || 0),
    status: x.status || "",
    clientName: x.clientName || "",
    notes: x.notes || "",
    createdAt: x.createdAt || null,
    createdBy: x.createdBy || "",
  };
}

async function loadAll() {
  // stock
  const stockSnap = await getDocs(query(collection(db, "stock"), orderBy("createdAt", "desc")));
  stockCache = stockSnap.docs.map(normalizeDoc);

  // reservations
  const resSnap = await getDocs(query(collection(db, "reservations"), orderBy("createdAt", "desc")));
  resCache = resSnap.docs.map(normalizeDoc);

  computeKpis();
  render();
}

async function saveItem() {
  const type = els.fType.value; // stock | reservations
  const brand = (els.fBrand.value || "").trim();
  const model = (els.fModel.value || "").trim();
  const qty = Number(els.fQty.value || 0);

  const status = (els.fStatus.value || "reserved").trim();
  const clientName = (els.fClientName.value || "").trim();
  const notes = (els.fNotes.value || "").trim();

  if (!brand || !model) {
    alert("Brand et model obligatoires");
    return;
  }

  const payload = {
    brand,
    model,
    qty: Number.isFinite(qty) ? qty : 0,
    notes,
    updatedAt: serverTimestamp(),
  };

  if (type === "reservations") {
    payload.status = status || "reserved";
    payload.clientName = clientName || "";
  }

  if (!editing.id) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = currentUser.uid;
    await addDoc(collection(db, type), payload);
  } else {
    await updateDoc(doc(db, type, editing.id), payload);
  }

  showModal(false);
  await loadAll();
}

async function deleteItem(type, id) {
  const list = type === "stock" ? stockCache : resCache;
  const item = list.find((x) => x.id === id);
  if (!item) return;

  const canEdit = isAdmin() || item.createdBy === currentUser?.uid;
  if (!canEdit) return;

  if (!confirm("Supprimer ?")) return;
  await deleteDoc(doc(db, type, id));
  await loadAll();
}

function bindEvents() {
  els.logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "pdm-staff.html";
  });

  els.addStockBtn?.addEventListener("click", openAddStock);
  els.addResBtn?.addEventListener("click", openAddRes);
  els.refreshBtn?.addEventListener("click", loadAll);

  els.search?.addEventListener("input", render);

  els.fType?.addEventListener("change", updateFormVisibility);

  els.closeModal?.addEventListener("click", () => showModal(false));
  els.cancelBtn?.addEventListener("click", () => showModal(false));
  els.modal?.addEventListener("click", (e) => {
    if (e.target === els.modal) showModal(false);
  });

  els.saveBtn?.addEventListener("click", saveItem);

  // delegation tables
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    const act = btn.dataset.act;
    const type = btn.dataset.type;
    const id = btn.dataset.id;

    if (act === "del") return deleteItem(type, id);

    if (act === "edit") {
      const list = type === "stock" ? stockCache : resCache;
      const item = list.find((x) => x.id === id);
      if (item) openEdit(type, item);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "pdm-staff.html";
    return;
  }
  currentUser = user;

  await loadRole(user.uid);
  bindEvents();
  updateFormVisibility();
  await loadAll();
});
