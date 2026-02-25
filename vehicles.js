// vehicles.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout, formatMoney, parseMoney } from "./common.js";

import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const ref = collection(db, "vehicles");
let cache = [];

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function render(list) {
  $("vehicleCount").textContent = `${list.length} véhicules`;
  const tbody = $("vehiclesTable");
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucun véhicule</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(v => `
    <tr>
      <td>${escapeHtml(v.brand || "")}</td>
      <td>${escapeHtml(v.model || "")}</td>
      <td>${escapeHtml(v.type || "")}</td>
      <td>${formatMoney(v.buyPrice || 0)}</td>
      <td>${formatMoney(v.sellPrice || 0)}</td>
      <td>
        <button class="btn" data-action="edit" data-id="${v.id}" style="padding:6px 12px;font-size:12px">✏️</button>
        <button class="btn" data-action="del" data-id="${v.id}" style="padding:6px 12px;font-size:12px;background:#ff4444">🗑️</button>
      </td>
    </tr>
  `).join("");
}

async function addVehicle() {
  const brand = ($("brandInput")?.value || "").trim();
  const model = ($("modelInput")?.value || "").trim();
  const type  = ($("typeInput")?.value || "").trim();
  const buyPrice  = parseMoney(String($("buyInput")?.value || "0"));
  const sellPrice = parseMoney(String($("sellInput")?.value || "0"));
  if (!brand || !model) return showToast("Marque + Modèle obligatoires", "err");

  await addDoc(ref, { brand, model, type, buyPrice, sellPrice, createdAt: serverTimestamp() });

  $("brandInput").value = "";
  $("modelInput").value = "";
  $("typeInput").value = "";
  $("buyInput").value = "";
  $("sellInput").value = "";

  showToast("Véhicule ajouté !");
}

async function editVehicle(id) {
  const v = cache.find(x => x.id === id);
  if (!v) return;
  const brand = prompt("Marque :", v.brand || "") ?? (v.brand || "");
  const model = prompt("Modèle :", v.model || "") ?? (v.model || "");
  const type  = prompt("Type :", v.type || "") ?? (v.type || "");
  const buyPrice  = parseMoney(prompt("Prix achat ($) :", String(v.buyPrice ?? 0)) || String(v.buyPrice ?? 0));
  const sellPrice = parseMoney(prompt("Prix vente ($) :", String(v.sellPrice ?? 0)) || String(v.sellPrice ?? 0));
  await updateDoc(doc(db, "vehicles", id), { brand, model, type, buyPrice, sellPrice, updatedAt: serverTimestamp() });
  showToast("Véhicule modifié !");
}

async function deleteVehicle(id) {
  if (!confirm("Supprimer ce véhicule ?")) return;
  await deleteDoc(doc(db, "vehicles", id));
  showToast("Véhicule supprimé !");
}

document.getElementById("logoutBtn")?.addEventListener("click", () => logout());
document.getElementById("addVehicleBtn")?.addEventListener("click", () => addVehicle().catch(()=>showToast("Erreur ajout","err")));

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (action === "edit") editVehicle(id).catch(()=>showToast("Erreur modification","err"));
  if (action === "del") deleteVehicle(id).catch(()=>showToast("Erreur suppression","err"));
});

onSnapshot(query(ref, orderBy("brand")), (snap) => {
  cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(cache);
});

showToast("PDM Véhicules chargé !");
