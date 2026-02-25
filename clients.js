// clients.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout, parseSimpleCSV } from "./common.js";

import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const clientsRef = collection(db, "clients");
let cache = []; // [{id, ...data}]

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function render(list) {
  $("clientCount").textContent = `${list.length} clients`;
  const tbody = $("clientsTable");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7">Aucun client</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.licence)}</td>
      <td><input type="checkbox" disabled ${c.car ? "checked" : ""}></td>
      <td><input type="checkbox" disabled ${c.moto ? "checked" : ""}></td>
      <td><input type="checkbox" disabled ${c.truck ? "checked" : ""}></td>
      <td>
        <button class="btn" data-action="edit" data-id="${c.id}" style="padding:6px 12px;font-size:12px">✏️</button>
        <button class="btn" data-action="del" data-id="${c.id}" style="padding:6px 12px;font-size:12px;background:#ff4444">🗑️</button>
      </td>
    </tr>
  `).join("");
}

function promptClient(seed = {}) {
  const name = prompt("Nom client :", seed.name || "");
  if (!name) return null;
  const phone = prompt("Téléphone :", seed.phone || "") || "";
  const permis = prompt("Permis :", seed.permis || "") || "";
  const voiture = prompt("Voiture (Oui/Non) :", seed.voiture || "Non") || "Non";
  const moto = prompt("Moto (Oui/Non) :", seed.moto || "Non") || "Non";
  const camion = prompt("Camion (Oui/Non) :", seed.camion || "Non") || "Non";
  return { name, phone, permis, voiture, moto, camion };
}

async function addClient() {
  const data = promptClient();
  if (!data) return;
  await addDoc(clientsRef, { ...data, createdAt: serverTimestamp() });
  showToast("Client ajouté !");
}

async function editClient(id) {
  const existing = cache.find(x => x.id === id);
  if (!existing) return;
  const data = promptClient(existing);
  if (!data) return;
  await updateDoc(doc(db, "clients", id), { ...data, updatedAt: serverTimestamp() });
  showToast("Client modifié !");
}

async function removeClient(id) {
  if (!confirm("Supprimer ce client ?")) return;
  await deleteDoc(doc(db, "clients", id));
  showToast("Client supprimé !");
}

async function importCSV() {
  const file = $("csvFile")?.files?.[0];
  if (!file) return showToast("Choisis un fichier CSV", "err");

  const text = await file.text();
  const rows = parseSimpleCSV(text);
  if (rows.length < 2) return showToast("CSV vide / invalide", "err");

  // Expect header: name, phone, permis, voiture, moto, camion
  const dataRows = rows.slice(1).filter(r => r.some(x => String(x||"").trim() !== ""));
  let added = 0;

  for (const r of dataRows) {
    const obj = {
      name: r[0] || "",
      phone: r[1] || "",
      permis: r[2] || "",
      voiture: r[3] || "Non",
      moto: r[4] || "Non",
      camion: r[5] || "Non",
      createdAt: serverTimestamp()
    };
    if (!obj.name) continue;
    await addDoc(clientsRef, obj);
    added++;
  }
  showToast(`${added} clients importés !`);
}

function applySearch() {
  const term = ($("searchClient")?.value || "").toLowerCase().trim();
  if (!term) return render(cache);
  const filtered = cache.filter(c =>
    String(c.name||"").toLowerCase().includes(term) ||
    String(c.phone||"").includes(term)
  );
  render(filtered);
}

document.getElementById("logoutBtn")?.addEventListener("click", () => logout());
document.getElementById("addClientBtn")?.addEventListener("click", () => addClient().catch(()=>showToast("Erreur ajout client","err")));
document.getElementById("importCsvBtn")?.addEventListener("click", () => importCSV().catch(()=>showToast("Erreur import CSV","err")));
document.getElementById("searchClient")?.addEventListener("input", applySearch);

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (action === "edit") editClient(id).catch(()=>showToast("Erreur modification","err"));
  if (action === "del") removeClient(id).catch(()=>showToast("Erreur suppression","err"));
});

onSnapshot(query(clientsRef, orderBy("createdAt", "desc")), (snap) => {
  cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  applySearch();
});

showToast("PDM Clients chargé !");
