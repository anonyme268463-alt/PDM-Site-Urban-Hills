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

const tbody = document.getElementById("tableBody");
const search = document.getElementById("search");

const statTotal = document.getElementById("statTotal");
const statCats = document.getElementById("statCats");
const statMonth = document.getElementById("statMonth");

const refreshBtn = document.getElementById("refreshBtn");
const addBtn = document.getElementById("addBtn");

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
const mBrand = document.getElementById("mBrand");
const mModel = document.getElementById("mModel");
const mCategory = document.getElementById("mCategory");
const mPrice = document.getElementById("mPrice");
const mSellPrice = document.getElementById("mSellPrice");

let CACHE = [];
let EDIT = { mode: "create", id: null };

function toDateSafe(ts) {
  try { if (ts?.toDate) return ts.toDate(); } catch {}
  return null;
}
function fmtDate(ts) {
  const d = toDateSafe(ts);
  return d ? d.toLocaleDateString("fr-FR") : "-";
}
function money(n) {
  const v = Number(n || 0);
  return isNaN(v) ? "$0" : `$${v.toLocaleString("en-US")}`;
}

function openModal({ mode, item }) {
  EDIT = { mode, id: item?.id || null };
  mTitle.textContent = mode === "edit" ? "Modifier" : "Ajouter";

  mBrand.value = item?.brand || "";
  mModel.value = item?.model || "";
  mCategory.value = item?.category || "";
  mPrice.value = String(item?.price ?? 0);
  mSellPrice.value = String(item?.sellPrice ?? 0);

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

async function load() {
  tbody.innerHTML = `<tr><td colspan="7">Chargement...</td></tr>`;

  const snap = await getDocs(collection(db, "vehicles"));
  CACHE = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
}

function render() {
  const q = (search?.value || "").trim().toLowerCase();

  const list = CACHE.filter((v) => {
    const brand = (v.brand || "").toLowerCase();
    const model = (v.model || "").toLowerCase();
    const cat = (v.category || "").toLowerCase();
    return !q || brand.includes(q) || model.includes(q) || cat.includes(q);
  });

  // Stats
  statTotal.textContent = String(list.length);

  const cats = new Set(list.map((x) => (x.category || "").trim()).filter(Boolean));
  statCats.textContent = String(cats.size);

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthCount = list.filter((x) => {
    const d = toDateSafe(x.createdAt);
    return d && d.getMonth() === month && d.getFullYear() === year;
  }).length;
  statMonth.textContent = String(monthCount);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">Aucun véhicule</td></tr>`;
    return;
  }

  const sorted = list.sort((a, b) => (toDateSafe(b.createdAt)?.getTime?.() || 0) - (toDateSafe(a.createdAt)?.getTime?.() || 0));

  tbody.innerHTML = sorted.map((v) => `
    <tr>
      <td>${v.brand || "-"}</td>
      <td>${v.model || "-"}</td>
      <td>${v.category || "-"}</td>
      <td>${money(v.price)}</td>
      <td>${money(v.sellPrice)}</td>
      <td>${fmtDate(v.createdAt)}</td>
      <td style="text-align:right;">
        <button class="btn" data-edit="${v.id}">Modifier</button>
        <button class="btn btn-danger" data-del="${v.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-edit");
      const item = CACHE.find((x) => x.id === id);
      openModal({ mode: "edit", item });
    });
  });

  tbody.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-del");
      if (!confirm("Supprimer ce véhicule ?")) return;
      await deleteDoc(doc(db, "vehicles", id));
      await load();
    });
  });
}

async function save() {
  const brand = (mBrand.value || "").trim();
  const model = (mModel.value || "").trim();
  const category = (mCategory.value || "").trim();
  const price = Number(mPrice.value || 0);
  const sellPrice = Number(mSellPrice.value || 0);

  if (!brand || !model) {
    alert("Marque et modèle sont obligatoires.");
    return;
  }
  if (Number.isNaN(price) || price < 0 || Number.isNaN(sellPrice) || sellPrice < 0) {
    alert("Price / Sell price invalides.");
    return;
  }

  saveBtn.disabled = true;
  try {
    const payload = {
      brand,
      model,
      category,
      price,
      sellPrice,
      updatedAt: serverTimestamp(),
    };

    if (EDIT.mode === "create") {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "vehicles"), payload);
    } else {
      await updateDoc(doc(db, "vehicles", EDIT.id), payload);
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

if (addBtn) addBtn.addEventListener("click", () => openModal({ mode: "create" }));

if (saveBtn) saveBtn.addEventListener("click", save);

// Start
load();
