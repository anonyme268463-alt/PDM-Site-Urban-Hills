import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, updateDoc, getDoc, getDocs,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { esc, renderUserBadge } from "./common.js";

const searchInput = document.getElementById("searchInput");
const refreshBtn  = document.getElementById("refreshBtn");
const addStockBtn = document.getElementById("addStockBtn");
const addResBtn   = document.getElementById("addResBtn");

const statStockQty   = document.getElementById("statStockQty");
const statStockLines = document.getElementById("statStockLines");
const statResActive  = document.getElementById("statResActive");

const stockTbody = document.getElementById("stockTable");
const resTbody   = document.getElementById("resTable");
const logoutBtn  = document.getElementById("logoutBtn");

const dlg         = document.getElementById("stockDialogBackdrop");
const dTitle      = document.getElementById("dTitle");
const dClose      = document.getElementById("dClose");
const dCancel     = document.getElementById("dCancel");
const dSave       = document.getElementById("dSave");
const dBrand      = document.getElementById("dBrand");
const dModel      = document.getElementById("dModel");
const dQty        = document.getElementById("dQty");
const dClientWrap = document.getElementById("dClientWrap");
const dClient     = document.getElementById("dClient");

let rowsStock = [];
let rowsRes = [];
let editTarget = null;
let mode = "stock";

function fmtDate(ts) {
  try {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
    return d.toLocaleDateString("fr-FR");
  } catch { return "—"; }
}

function norm(s){ return (s ?? "").toString().trim().toLowerCase(); }

function openDialog(kind, row=null) {
  mode = kind;
  editTarget = row?.id ? { kind, id: row.id } : null;
  dTitle.textContent = row?.id ? "Modifier" : "Ajouter";
  dBrand.value = row?.brand ?? "";
  dModel.value = row?.model ?? "";
  dQty.value   = (row?.qty ?? 1);

  if (kind === "res") {
    dClientWrap.style.display = "block";
    dClient.value = row?.client ?? "";
  } else {
    dClientWrap.style.display = "none";
    dClient.value = "";
  }
  dlg.classList.remove("hidden");
}

function closeDialog() {
  dlg.classList.add("hidden");
  editTarget = null;
}

function refreshStats() {
  const totalQty = rowsStock.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  statStockQty.textContent = `${totalQty}`;
  statStockLines.textContent = `${rowsStock.length}`;
  statResActive.textContent = `${rowsRes.length}`;
}

function renderStock(list) {
  if (!list.length) {
    stockTbody.innerHTML = `<tr><td colspan="5" class="muted">Aucune ligne.</td></tr>`;
    return;
  }
  stockTbody.innerHTML = list.map(r => `
    <tr>
      <td>${esc(r.brand || "-")}</td>
      <td>${esc(r.model || "-")}</td>
      <td>${r.qty ?? 0}</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td style="text-align: right;">
        <button class="btn btn-sm btn-outline btn-edit" data-kind="stock" data-id="${r.id}">Modifier</button>
        <button class="btn btn-sm btn-danger btn-del" data-kind="stock" data-id="${r.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

function renderRes(list) {
  if (!list.length) {
    resTbody.innerHTML = `<tr><td colspan="7" class="muted">Aucune ligne.</td></tr>`;
    return;
  }
  resTbody.innerHTML = list.map(r => `
    <tr>
      <td>${esc(r.brand || "-")}</td>
      <td>${esc(r.model || "-")}</td>
      <td>${esc(r.client || "-")}</td>
      <td>${r.qty ?? 0}</td>
      <td><span class="badge badge-info">${esc(r.status || "RÉSERVÉ")}</span></td>
      <td>${fmtDate(r.createdAt)}</td>
      <td style="text-align: right;">
        <button class="btn btn-sm btn-outline btn-edit" data-kind="res" data-id="${r.id}">Modifier</button>
        <button class="btn btn-sm btn-danger btn-del" data-kind="res" data-id="${r.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

function applyFilter() {
  const q = norm(searchInput.value);
  const s = q ? rowsStock.filter(r => [r.brand, r.model].some(x => norm(x).includes(q))) : rowsStock;
  const r = q ? rowsRes.filter(r => [r.brand, r.model, r.client].some(x => norm(x).includes(q))) : rowsRes;
  renderStock(s);
  renderRes(r);
}

async function loadData() {
  stockTbody.innerHTML = `<tr><td colspan="5" class="muted">Chargement...</td></tr>`;
  resTbody.innerHTML = `<tr><td colspan="7" class="muted">Chargement...</td></tr>`;
  try {
    const qStock = query(collection(db, "stock"), orderBy("createdAt", "desc"));
    const qRes   = query(collection(db, "reservations"), orderBy("createdAt", "desc"));
    const [sSnap, rSnap] = await Promise.all([getDocs(qStock), getDocs(qRes)]);
    rowsStock = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rowsRes = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilter(); refreshStats();
  } catch (err) {
    console.error("Load error:", err);
  }
}

searchInput.addEventListener("input", applyFilter);
refreshBtn.addEventListener("click", () => loadData());
addStockBtn.addEventListener("click", () => openDialog("stock"));
addResBtn.addEventListener("click", () => openDialog("res"));
dClose.addEventListener("click", closeDialog);
dCancel.addEventListener("click", closeDialog);

dSave.addEventListener("click", async () => {
  const brand = (dBrand.value||"").trim();
  const model = (dModel.value||"").trim();
  const qty   = Math.max(0, Number(dQty.value||0));
  const client= (dClient.value||"").trim();
  if (!brand || !model) return alert("Marque et modèle sont requis.");

  try {
    if (editTarget) {
      const col = editTarget.kind === "res" ? "reservations" : "stock";
      const ref = doc(db, col, editTarget.id);
      const payload = { brand, model, qty, updatedAt: serverTimestamp() };
      if (editTarget.kind === "res") {
        payload.client = client || "-";
        payload.status = "RÉSERVÉ";
      }
      await updateDoc(ref, payload);
    } else {
      if (mode === "res") {
        if (!client) return alert("Client requis pour une réservation.");
        await addDoc(collection(db, "reservations"), {
          brand, model, qty, client,
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
    closeDialog();
    await loadData();
  } catch (e) { console.error(e); alert("Erreur lors de l'enregistrement."); }
});

async function onTableClick(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const id = b.dataset.id;
  const kind = b.dataset.kind;
  const list = kind === "res" ? rowsRes : rowsStock;
  const row = list.find(x => x.id === id);
  if (!row) return;

  if (b.classList.contains("btn-edit")) openDialog(kind, row);
  if (b.classList.contains("btn-del")) {
    if (!confirm("Supprimer ?")) return;
    const col = kind === "res" ? "reservations" : "stock";
    try {
      await deleteDoc(doc(db, col, id));
      await loadData();
    } catch (err) { console.error(err); alert("Erreur suppression."); }
  }
}
stockTbody.addEventListener("click", onTableClick);
resTbody.addEventListener("click", onTableClick);

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "pdm-staff.html";
    return;
  }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) renderUserBadge(snap.data());
  } catch(e) { console.error("Error loading user badge:", e); }

  await loadData();
});
