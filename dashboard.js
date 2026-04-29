import { db, auth } from "./config.js";
import {
  doc, getDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { esc, renderUserBadge, handleSignOut } from "./common.js";

const caTotalEl = document.getElementById("caTotal");
const profitTotalEl = document.getElementById("profitTotal");
const salesCountEl = document.getElementById("salesCount");
const lastSalesEl = document.getElementById("lastSales");

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await handleSignOut(auth);
    window.location.href = "pdm-staff.html";
  });
}

function formatMoney(n) {
  return "$" + Number(n || 0).toLocaleString("en-US");
}

async function loadDashboard() {
  lastSalesEl.innerHTML = `<tr><td colspan="5" class="muted">Chargement...</td></tr>`;
  try {
    const snapshot = await getDocs(collection(db, "transactions"));
    let caTotal = 0;
    let profitTotal = 0;
    let sales = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const buy = Number(data.buyPrice || 0);
      const sell = Number(data.sellPrice || 0);
      const profit = sell - buy;
      caTotal += sell;
      profitTotal += profit;
      sales.push({
        date: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        client: data.clientName || "-",
        model: data.model || "-",
        sell,
        profit
      });
    });

    sales.sort((a,b) => b.date - a.date);
    caTotalEl.textContent = formatMoney(caTotal);
    profitTotalEl.textContent = formatMoney(profitTotal);
    salesCountEl.textContent = sales.length;

    if (sales.length === 0) {
      lastSalesEl.innerHTML = `<tr><td colspan="5">Aucune vente</td></tr>`;
      return;
    }

    lastSalesEl.innerHTML = sales.slice(0,5).map(s => `
      <tr>
        <td>${s.date.toLocaleDateString()}</td>
        <td>${esc(s.client)}</td>
        <td>${esc(s.model)}</td>
        <td>${formatMoney(s.sell)}</td>
        <td>${formatMoney(s.profit)}</td>
      </tr>
    `).join("");
  } catch(e) {
    console.error(e);
    lastSalesEl.innerHTML = `<tr><td colspan="5" class="red">Erreur de chargement.</td></tr>`;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) renderUserBadge(snap.data());
  } catch(e) { console.error("Error loading user badge:", e); }
  loadDashboard();
});
