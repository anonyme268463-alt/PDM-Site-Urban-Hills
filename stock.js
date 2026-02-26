import { db, auth } from "./config.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const stockTbody = document.getElementById("stockTable");
const resTbody = document.getElementById("resTable");
const search = document.getElementById("search");

const statStockQty = document.getElementById("statStockQty");
const statStockLines = document.getElementById("statStockLines");
const statResActive = document.getElementById("statResActive");

const refreshBtn = document.getElementById("refreshBtn");
const addStockBtn = document.getElementById("addStockBtn");
const addResBtn = document.getElementById("addResBtn");

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "pdm-staff.html";
  });
}

// Modal
const modal = document.getElementById("editModal");
const closeModalBtn = document.getElementById("closeModal");
const cancelBtn = document.getElementById("cancelBtn");
const saveBtn = document.getElementById("saveBtn");

const mTitle = document.getElementById("mTitle");
const mSub = document.getElementById("mSub");
const mBrand = document.getElementById("mBrand");
const mModel = document.getElementById("mModel");
const mQty = document.getElementById("mQty");
const mClient = document.getElementById("mClient");

// State
let CACHE = { stock: [], res: [] };
let EDIT = { mode: "create", type: "stock", id: null }; // type: stock | reservation

function toDateSafe(ts) {
  try {
    if (ts?.toDate) return ts.toDate();
  } catch (e) {}
  return null;
}

function fmtDate(ts) {
  const d = toDateSafe(ts);
  return d ? d.toLocaleDateString("fr-FR") : "-";
}

function badgeStatus(status) {
  const s = (status || "").toString().toLowerCase();
  if (s === "reserved" || s === "réservé" || s === "reserve") return `<span class="badge badge-warn">Réservé</span>`;
  if (s === "done" || s === "vendu" || s === "sold") return `<span class="badge badge-yes">Vendu</span>`;
  if (s === "cancel" || s === "annulé" || s === "annule") return `<span class="badge badge-no">Annulé</span>`;
  return `<span class="badge">${status || "-"}</span>`;
}

function openModal({ mode, type, item }) {
  EDIT = { mode, type, id: item?.id || null };

  // Reset
  mBrand.value = item?.brand || "";
  mModel.value = item?.model || "";
  mQty.value = String(item?.qty ?? 1);
  mClient.value = item?.clientName || "";

  if (mode === "create" && type === "stock") {
    mTitle.textContent = "Ajouter";
    mSub.textContent = "Stock";
    mClient.value = "";
  } else if (mode === "create" && type === "reservation") {
    mTitle.textContent = "Ajouter";
    mSub.textContent = "Réservation";
  } else {
    mTitle.textContent = "Modifier";
    mSub.textContent = type === "reservation" ? "Réservation" : "Stock";
  }

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

async function load() {
  stockTbody.innerHTML = `<tr><td colspan="5">Chargement...</td></tr>`;
  resTbody.innerHTML = `<tr><td colspan="7">Chargement...</td></tr>`;

  const [stockSnap, resSnap] = await Promise.all([
    getDocs(collection(db, "stock")),
    getDocs(collection(db, "reservations")),
  ]);

  const stock = stockSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const res = resSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  CACHE = { stock, res };
  render();
}

function render() {
  const q = (search?.value || "").trim().toLowerCase();

  const stockFiltered = CACHE.stock.filter((s) => {
    const brand = (s.brand || "").toLowerCase();
    const model = (s.model || "").toLowerCase();
    return !q || brand.includes(q) || model.includes(q);
  });

  const resFiltered = CACHE.res.filter((r) => {
    const brand = (r.brand || "").toLowerCase();
    const model = (r.model || "").toLowerCase();
    const client = (r.clientName || "").toLowerCase();
    return !q || brand.includes(q) || model.includes(q) || client.includes(q);
  });

  // Stats
  const qtyTotal = stockFiltered.reduce((sum, s) => sum + Number(s.qty || 0), 0);
  statStockQty.textContent = String(qtyTotal);
  statStockLines.textContent = String(stockFiltered.length);

  const activeRes = resFiltered.filter((r) => {
    const st = (r.status || "").toString().toLowerCase();
    return st === "reserved" || st === "réservé" || st === "reserve" || st === "";
  }).length;
  statResActive.textContent = String(activeRes);

  // STOCK TABLE
  if (stockFiltered.length === 0) {
    stockTbody.innerHTML = `<tr><td colspan="5">Aucune ligne stock</td></tr>`;
  } else {
    stockTbody.innerHTML = stockFiltered
      .sort((a, b) => (toDateSafe(b.createdAt)?.getTime?.() || 0) - (toDateSafe(a.createdAt)?.getTime?.() || 0))
      .map((s) => {
        return `
          <tr>
            <td>${s.brand || "-"}</td>
            <td>${s.model || "-"}</td>
            <td>${Number(s.qty || 0)}</td>
            <td>${fmtDate(s.createdAt)}</td>
            <td style="text-align:right;">
              <button class="btn" data-edit-stock="${s.id}">Modifier</button>
              <button class="btn btn-danger" data-del-stock="${s.id}">Supprimer</button>
            </td>
          </tr>
        `;
      })
      .join("");

    stockTbody.querySelectorAll("[data-edit-stock]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-edit-stock");
        const item = CACHE.stock.find((x) => x.id === id);
        openModal({ mode: "edit", type: "stock", item });
      });
    });
    stockTbody.querySelectorAll("[data-del-stock]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-del-stock");
        if (!confirm("Supprimer cette ligne stock ?")) return;
        await deleteDoc(doc(db, "stock", id));
        await load();
      });
    });
  }

  // RES TABLE
  if (resFiltered.length === 0) {
    resTbody.innerHTML = `<tr><td colspan="7">Aucune réservation</td></tr>`;
  } else {
    resTbody.innerHTML = resFiltered
      .sort((a, b) => (toDateSafe(b.createdAt)?.getTime?.() || 0) - (toDateSafe(a.createdAt)?.getTime?.() || 0))
      .map((r) => {
        return `
          <tr>
            <td>${r.brand || "-"}</td>
            <td>${r.model || "-"}</td>
            <td>${r.clientName || "-"}</td>
            <td>${Number(r.qty || 0)}</td>
            <td>${badgeStatus(r.status || "reserved")}</td>
            <td>${fmtDate(r.createdAt)}</td>
            <td style="text-align:right;">
              <button class="btn" data-edit-res="${r.id}">Modifier</button>
              <button class="btn btn-danger" data-del-res="${r.id}">Supprimer</button>
            </td>
          </tr>
        `;
      })
      .join("");

    resTbody.querySelectorAll("[data-edit-res]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-edit-res");
        const item = CACHE.res.find((x) => x.id === id);
        openModal({ mode: "edit", type: "reservation", item });
      });
    });
    resTbody.querySelectorAll("[data-del-res]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-del-res");
        if (!confirm("Supprimer cette réservation ?")) return;
        await deleteDoc(doc(db, "reservations", id));
        await load();
      });
    });
  }
}

async function save() {
  const brand = (mBrand.value || "").trim();
  const model = (mModel.value || "").trim();
  const qty = Number(mQty.value || 0);
  const clientName = (mClient.value || "").trim();

  if (!brand || !model) {
    alert("Marque et modèle sont obligatoires.");
    return;
  }
  if (Number.isNaN(qty) || qty < 0) {
    alert("Quantité invalide.");
    return;
  }

  // règle demandée : si client rempli => reservation, sinon stock
  const inferredType = clientName ? "reservation" : "stock";
  const type = EDIT.mode === "edit" ? EDIT.type : inferredType;

  saveBtn.disabled = true;
  try {
    if (type === "stock") {
      const payload = {
        brand,
        model,
        qty,
        updatedAt: serverTimestamp(),
      };

      if (EDIT.mode === "create") {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "stock"), payload);
      } else {
        await updateDoc(doc(db, "stock", EDIT.id), payload);
      }
    } else {
      const payload = {
        brand,
        model,
        clientName: clientName || "-",
        qty,
        status: "reserved",
        updatedAt: serverTimestamp(),
      };

      if (EDIT.mode === "create") {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "reservations"), payload);
      } else {
        await updateDoc(doc(db, "reservations", EDIT.id), payload);
      }
    }

    closeModal();
    await load();
  } finally {
    saveBtn.disabled = false;
  }
}

// Events
if (search) search.addEventListener("input", render);

if (refreshBtn) refreshBtn.addEventListener("click", load);

if (addStockBtn) addStockBtn.addEventListener("click", () => openModal({ mode: "create", type: "stock" }));
if (addResBtn) addResBtn.addEventListener("click", () => openModal({ mode: "create", type: "reservation" }));

if (saveBtn) saveBtn.addEventListener("click", save);

// Start
load();
