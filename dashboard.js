import { db } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { auth } from "./config.js";

const caTotalEl = document.getElementById("caTotal");
const profitTotalEl = document.getElementById("profitTotal");
const salesCountEl = document.getElementById("salesCount");
const lastSalesEl = document.getElementById("lastSales");

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

function formatMoney(n) {
  return "$" + Number(n).toLocaleString("en-US");
}

async function loadDashboard() {

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
      <td>${s.client}</td>
      <td>${s.model}</td>
      <td>${formatMoney(s.sell)}</td>
      <td>${formatMoney(s.profit)}</td>
    </tr>
  `).join("");
}

loadDashboard();
