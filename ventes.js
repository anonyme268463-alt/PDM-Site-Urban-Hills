// ventes.js
import { db, auth } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout, formatMoney, parseMoney, toDateAny } from "./common.js";

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const transactionsRef = collection(db, "transactions");
let cache = [];

const $ = (id) => document.getElementById(id);

function render(list) {
  document.getElementById("salesCount").textContent = `${list.length} ventes`;

  const tbody = document.getElementById("salesTable");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = "<tr><td colspan='6'>Aucune vente</td></tr>";
    return;
  }

  tbody.innerHTML = list.map(s => {
    const d = toDateAny(s.date || s.createdAt) || new Date();
    return `
<tr>
<td>${d.toLocaleDateString("fr-FR")}</td>
<td>${s.client || ""}</td>
<td>${s.vehicle || ""}</td>
<td>${formatMoney(s.buyPrice || 0)} → ${formatMoney(s.sellPrice || 0)}</td>
<td>${formatMoney(s.amount || 0)}</td>
<td>
<button data-action="edit" data-id="${s.id}">✏️</button>
<button data-action="del" data-id="${s.id}">🗑️</button>
</td>
</tr>`;
  }).join("");
}

async function createSale() {
  const user = auth.currentUser;
  if (!user) return;

  const client = $("clientSell").value;
  const vehicle = $("vehicleSell").value;
  const buyPrice = parseMoney($("buyPrice").value);
  const sellPrice = parseMoney($("sellPrice").value);

  await addDoc(transactionsRef, {
    client,
    vehicle,
    buyPrice,
    sellPrice,
    amount: sellPrice,
    sellerId: user.uid,
    createdBy: user.uid,
    date: serverTimestamp(),
    createdAt: serverTimestamp()
  });

  showToast("Vente ajoutée");
}

async function editSale(id) {
  const s = cache.find(x => x.id === id);
  if (!s) return;

  const sellPrice = parseMoney(prompt("Nouveau prix :", s.sellPrice || 0));
  await updateDoc(doc(db, "transactions", id), {
    sellPrice,
    amount: sellPrice
  });

  showToast("Vente modifiée");
}

async function deleteSale(id) {
  if (!confirm("Supprimer cette vente ?")) return;
  await deleteDoc(doc(db, "transactions", id));
  showToast("Vente supprimée");
}

document.getElementById("createSaleBtn")?.addEventListener("click", createSale);

document.addEventListener("click", e => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "edit") editSale(btn.dataset.id);
  if (btn.dataset.action === "del") deleteSale(btn.dataset.id);
});

document.getElementById("logoutBtn")?.addEventListener("click", logout);

onSnapshot(query(transactionsRef, orderBy("date", "desc")), snap => {
  cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(cache);
});
