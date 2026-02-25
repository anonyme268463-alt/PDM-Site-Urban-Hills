// ventes.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout, formatMoney, parseMoney, toDateAny } from "./common.js";

import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const salesRef = collection(db, "sales");
let cache = [];

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function detectType(buy, sell) {
  if (!buy || !sell) return "—";
  const margin = sell - buy;
  if (margin <= 0) return "Vente sans bénéfice";
  if (margin < 5000) return "Petite marge";
  if (margin < 20000) return "Bonne marge";
  return "Grosse marge";
}

function render(list) {
  $("salesCount").textContent = `${list.length} ventes`;

  const tbody = $("salesTable");
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">Aucune vente</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(s => {
    const d = toDateAny(s.date) || toDateAny(s.createdAt) || new Date();
    return `<tr>
      <td>${d.toLocaleDateString("fr-FR")}</td>
      <td>${escapeHtml(s.client || "")}</td>
      <td>${escapeHtml(s.vehicle || "")}</td>
      <td>${formatMoney(s.buyPrice || 0)} → ${formatMoney(s.sellPrice || 0)}</td>
      <td>${formatMoney((Number(s.sellPrice||0) - Number(s.buyPrice||0)))}</td>
      <td>
        <button class="btn" data-action="edit" data-id="${s.id}" style="padding:6px 12px;font-size:12px">✏️</button>
        <button class="btn" data-action="del" data-id="${s.id}" style="padding:6px 12px;font-size:12px;background:#ff4444">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

async function createSale() {
  const client = ($("clientSell")?.value || "").trim();
  const vehicle = ($("vehicleSell")?.value || "").trim();
  const buyPrice = parseMoney(String($("buyPrice")?.value || "0"));
  const sellPrice = parseMoney(String($("sellPrice")?.value || "0"));
  const seller = ($("sellerName")?.value || "").trim();

  if (!vehicle) return showToast("Véhicule obligatoire", "err");

  await addDoc(salesRef, {
    client,
    vehicle,
    buyPrice,
    sellPrice,
    amount: sellPrice, // compat dashboard
    seller,
    date: serverTimestamp(),
    createdAt: serverTimestamp()
  });

  $("clientSell").value = "";
  $("vehicleSell").value = "";
  $("buyPrice").value = "";
  $("sellPrice").value = "";
  $("sellerName").value = "";

  showToast("Vente enregistrée !");
}

async function editSale(id) {
  const s = cache.find(x => x.id === id);
  if (!s) return;
  const client = prompt("Client :", s.client || "") ?? (s.client || "");
  const vehicle = prompt("Véhicule :", s.vehicle || "") ?? (s.vehicle || "");
  const buyPrice = parseMoney(prompt("Prix achat ($) :", String(s.buyPrice ?? 0)) || String(s.buyPrice ?? 0));
  const sellPrice = parseMoney(prompt("Prix vente ($) :", String(s.sellPrice ?? 0)) || String(s.sellPrice ?? 0));
  const seller = prompt("Vendeur :", s.seller || "") ?? (s.seller || "");
  await updateDoc(doc(db, "sales", id), { client, vehicle, buyPrice, sellPrice, amount: sellPrice, seller, updatedAt: serverTimestamp() });
  showToast("Vente modifiée !");
}

async function deleteSale(id) {
  if (!confirm("Supprimer cette vente ?")) return;
  await deleteDoc(doc(db, "sales", id));
  showToast("Vente supprimée !");
}

function updateTypeLabel() {
  const buy = parseMoney(String($("buyPrice")?.value || "0"));
  const sell = parseMoney(String($("sellPrice")?.value || "0"));
  const t = detectType(buy, sell);
  const el = $("saleType");
  if (el) el.textContent = `Type détecté : ${t}`;
}

$("buyPrice")?.addEventListener("input", updateTypeLabel);
$("sellPrice")?.addEventListener("input", updateTypeLabel);

document.getElementById("logoutBtn")?.addEventListener("click", () => logout());
document.getElementById("createSaleBtn")?.addEventListener("click", () => createSale().catch(()=>showToast("Erreur vente","err")));

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (action === "edit") editSale(id).catch(()=>showToast("Erreur modification","err"));
  if (action === "del") deleteSale(id).catch(()=>showToast("Erreur suppression","err"));
});

onSnapshot(query(salesRef, orderBy("date", "desc")), (snap) => {
  cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render(cache);
});

showToast("PDM Ventes chargé !");
updateTypeLabel();
