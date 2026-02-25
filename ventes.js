// ventes.js
import { db, auth } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout, formatMoney, parseMoney, toDateAny } from "./common.js";

import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const transactionsRef = collection(db, "transactions");
let cache = [];

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function render(list) {
  $("salesCount").textContent = `${list.length} ventes`;

  const tbody = $("salesTable");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucune vente</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(s => {
    const d = toDateAny(s.date || s.createdAt) || new Date();
    return `<tr>
      <td>${d.toLocaleDateString("fr-FR")}</td>
      <td>${escapeHtml(s.client || "")}</td>
      <td>${escapeHtml(s.vehicle || "")}</td>
      <td>${formatMoney(s.buyPrice || 0)} → ${formatMoney(s.sellPrice || 0)}</td>
      <td>${formatMoney(s.amount || 0)}</td>
      <td>
        <button class="btn" data-action="edit" data-id="${s.id}">✏️</button>
        <button class="btn" data-action="del" data-id="${s.id}" style="background:#ff4444">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

async function createSale() {
  const user = auth.currentUser;
  if (!user) return;

  const client = $("clientSell").value.trim();
  const vehicle = $("vehicleSell").value.trim();
  const buyPrice = parseMoney($("buyPrice").value);
  const sellPrice = parseMoney($("sellPrice").value);
  const sellerName = $("sellerName").value.trim();

  if (!vehicle) return showToast("Véhicule obligatoire", "err");

  await addDoc(transactionsRef, {
    client,
    vehicle,
    buyPrice,
    sellPrice,
    amount: sellPrice,
    sellerName,
    sellerId: user.uid,
    createdBy: user.uid,
    date: serverTimestamp(),
    createdAt: serverTimestamp()
  });

  $("clientSell").value = "";
  $("vehicleSell").value = "";
  $("buyPrice").value = "";
  $("sellPrice").value = "";
  $("sellerName").value = "";

  showToast("Vente enregistrée");
}

async function editSale(id) {
  const s = cache.find(x => x.id === id);
  if (!s) return;

  const client = prompt("Client :", s.client || "") ?? s.client;
  const vehicle = prompt("Véhicule :", s.vehicle || "") ?? s.vehicle;
  const buyPrice = parseMoney(prompt("Prix achat :", s.buyPrice ?? 0));
  const sellPrice = parseMoney(prompt("Prix vente :", s.sellPrice ?? 0));

  await updateDoc(doc(db, "transactions", id), {
    client,
    vehicle,
    buyPrice,
    sellPrice,
    amount: sellPrice,
    updatedAt: serverTimestamp()
  });

  showToast("Vente modifiée");
}

async function deleteSale(id) {
  if (!confirm("Supprimer cette vente ?")) return;
  await deleteDoc(doc(db, "transactions", id));
  showToast("Vente supprimée");
}

document.getElementById("createSaleBtn")?.addEventListener("click", () =>
  createSale().catch(() => showToast("Erreur vente", "err"))
);

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "edit") editSale(id);
  if (btn.dataset.action === "del") deleteSale(id);
});

document.getElementById("logoutBtn")?.addEventListener("click", logout);

onSnapshot(
  query(transactionsRef, orderBy("date", "desc")),
  (snap) => {
    cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render(cache);
  }
);

showToast("Ventes chargées");
