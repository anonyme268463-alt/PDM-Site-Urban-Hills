// stock.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout } from "./common.js";

import {
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const stockRef = collection(db, "stock");            // {brand, model, qty, createdAt, updatedAt}
const resaRef  = collection(db, "reservations");     // {client, brand, model, qty, createdAt}

let stock = []; // {id,...}
let reservations = [];

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function slugId(brand, model) {
  return `${brand}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function render() {
  $("stockCount").textContent = `${stock.length} items`;
  $("resaCount").textContent = `${reservations.length} rsa`;

  const stockT = $("stockTable");
  stockT.innerHTML = stock.map(item => `
    <tr>
      <td>${escapeHtml(item.brand)}</td>
      <td>${escapeHtml(item.model)}</td>
      <td><span class="tag ${item.qty > 1 ? 'ok' : item.qty === 1 ? 'warn' : 'danger'}">${Number(item.qty||0)}</span></td>
      <td>
        <button class="btn" data-action="edit-stock" data-id="${item.id}" style="padding:6px 12px;font-size:12px">✏️</button>
        <button class="btn danger" data-action="del-stock" data-id="${item.id}" style="padding:6px 12px;font-size:12px">🗑️</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="4">Aucun stock</td></tr>';

  const resaT = $("resaTable");
  resaT.innerHTML = reservations.map(item => `
    <tr>
      <td>${escapeHtml(item.client)}</td>
      <td>${escapeHtml(item.brand)}</td>
      <td>${escapeHtml(item.model)}</td>
      <td><span class="tag warn">${Number(item.qty||0)}</span></td>
      <td>
        <button class="btn ok" data-action="sell-resa" data-id="${item.id}" style="padding:6px 12px;font-size:12px">💰 Vente</button>
        <button class="btn" data-action="edit-resa" data-id="${item.id}" style="padding:6px 12px;font-size:12px">✏️</button>
        <button class="btn danger" data-action="del-resa" data-id="${item.id}" style="padding:6px 12px;font-size:12px">🗑️</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="5">Aucune réservation</td></tr>';
}

async function addItem() {
  const brand = ($("brandInput")?.value || "").trim();
  const model = ($("modelInput")?.value || "").trim();
  const qty = Math.max(1, Number($("qtyInput")?.value || 1) || 1);
  const client = ($("clientInput")?.value || "").trim();

  if (!brand || !model) return showToast("Marque + Modèle obligatoires", "err");

  if (client) {
    await addDoc(resaRef, { client, brand, model, qty, createdAt: serverTimestamp() });
    showToast("Réservation ajoutée !");
  } else {
    // Merge by doc id (same brand/model = same doc)
    const id = slugId(brand, model);
    const ref = doc(db, "stock", id);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? Number(snap.data().qty || 0) : 0;
    await setDoc(ref, { brand, model, qty: prev + qty, updatedAt: serverTimestamp(), createdAt: snap.exists() ? snap.data().createdAt : serverTimestamp() }, { merge: true });
    showToast("Stock ajouté !");
  }

  $("clientInput").value = "";
  $("qtyInput").value = "1";
}

async function editStock(id) {
  const item = stock.find(x => x.id === id);
  if (!item) return;
  const brand = prompt("Marque :", item.brand) || item.brand;
  const model = prompt("Modèle :", item.model) || item.model;
  const qty = Number(prompt("Qté :", String(item.qty ?? 0)) || item.qty) || 0;

  // If brand/model changed, move doc
  const newId = slugId(brand, model);
  if (newId !== id) {
    // create new doc then delete old
    await setDoc(doc(db, "stock", newId), { ...item, brand, model, qty, updatedAt: serverTimestamp() }, { merge: true });
    await deleteDoc(doc(db, "stock", id));
  } else {
    await updateDoc(doc(db, "stock", id), { brand, model, qty, updatedAt: serverTimestamp() });
  }
  showToast("Stock modifié !");
}

async function deleteStock(id) {
  if (!confirm("Supprimer du stock ?")) return;
  await deleteDoc(doc(db, "stock", id));
  showToast("Stock supprimé !");
}

async function editResa(id) {
  const item = reservations.find(x => x.id === id);
  if (!item) return;
  const client = prompt("Client :", item.client) || item.client;
  const brand = prompt("Marque :", item.brand) || item.brand;
  const model = prompt("Modèle :", item.model) || item.model;
  const qty = Number(prompt("Qté :", String(item.qty ?? 1)) || item.qty) || 1;
  await updateDoc(doc(db, "reservations", id), { client, brand, model, qty, updatedAt: serverTimestamp() });
  showToast("Réservation modifiée !");
}

async function deleteResa(id) {
  if (!confirm("Annuler réservation ?")) return;
  await deleteDoc(doc(db, "reservations", id));
  showToast("Réservation annulée !");
}

async function sellReservation(id) {
  const item = reservations.find(x => x.id === id);
  if (!item) return;
  if (!confirm("Convertir en vente ?")) return;

  // Create a sale doc (simple)
  await addDoc(collection(db, "sales"), {
    date: serverTimestamp(),
    client: item.client,
    vehicle: `${item.brand} ${item.model}`.trim(),
    amount: 0, // tu peux l'éditer ensuite dans Ventes
    createdAt: serverTimestamp()
  });

  // Delete reservation
  await deleteDoc(doc(db, "reservations", id));

  // Optional: decrement stock if exists
  const sid = slugId(item.brand, item.model);
  const sref = doc(db, "stock", sid);
  const ss = await getDoc(sref);
  if (ss.exists()) {
    const prev = Number(ss.data().qty || 0);
    const next = Math.max(0, prev - Number(item.qty || 0));
    await updateDoc(sref, { qty: next, updatedAt: serverTimestamp() });
  }

  showToast("Réservation convertie en vente !");
}

document.getElementById("logoutBtn")?.addEventListener("click", () => logout());
document.getElementById("addItemBtn")?.addEventListener("click", () => addItem().catch(()=>showToast("Erreur ajout","err")));

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  const safe = (fn) => fn(id).catch(()=>showToast("Erreur Firestore","err"));

  if (action === "edit-stock") safe(editStock);
  if (action === "del-stock") safe(deleteStock);
  if (action === "sell-resa") safe(sellReservation);
  if (action === "edit-resa") safe(editResa);
  if (action === "del-resa") safe(deleteResa);
});

onSnapshot(query(stockRef, orderBy("brand")), (snap) => {
  stock = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
});
onSnapshot(query(resaRef, orderBy("createdAt", "desc")), (snap) => {
  reservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
});

showToast("PDM Stock chargé !");
