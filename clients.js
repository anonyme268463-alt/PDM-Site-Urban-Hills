import { db, auth } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const tbody = document.getElementById("clientsTable");
const search = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");

const modal = document.getElementById("clientModal");
const closeModal = document.getElementById("closeModal");
const closeBtn = document.getElementById("closeBtn");
const copyBtn = document.getElementById("copyBtn");

const mTitle = document.getElementById("mTitle");
const mSubtitle = document.getElementById("mSubtitle");
const mTotal = document.getElementById("mTotal");
const mProfit = document.getElementById("mProfit");
const mCount = document.getElementById("mCount");
const mSales = document.getElementById("mSales");

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

function money(n){
  return "$" + Number(n || 0).toLocaleString("en-US");
}

function yesNoBadge(v){
  const yes = (String(v).toLowerCase() === "oui") || v === true;
  return `<span class="badge ${yes ? "badge-yes":"badge-no"}">${yes ? "Oui":"Non"}</span>`;
}

function checkIcon(v){
  const yes = v === true;
  return yes
    ? `<span class="badge badge-yes">✓</span>`
    : `<span class="badge badge-no">✕</span>`;
}

function toDateSafe(ts){
  try{
    if(ts?.toDate) return ts.toDate();
  }catch(e){}
  return null;
}

let CACHE = { clients: [], tx: [] };

async function load(){
  tbody.innerHTML = `<tr><td colspan="9">Chargement…</td></tr>`;

  const [clientsSnap, txSnap] = await Promise.all([
    getDocs(collection(db,"clients")),
    getDocs(collection(db,"transactions"))
  ]);

  const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tx = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  CACHE = { clients, tx };

  render();
}

function render(){
  const q = (search.value || "").trim().toLowerCase();

  const filtered = CACHE.clients.filter(c => {
    const name = (c.name || "").toLowerCase();
    const phone = (c.phone || "").toLowerCase();
    return !q || name.includes(q) || phone.includes(q);
  });

  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="9">Aucun client</td></tr>`;
    return;
  }

  const rows = filtered.map(c => {
    const sales = CACHE.tx.filter(t => t.clientId === c.id);
    const count = sales.length;
    const total = sales.reduce((s,t)=> s + Number(t.sellPrice||0), 0);

    return `
      <tr>
        <td>${c.name || "-"}</td>
        <td>${c.phone || "-"}</td>
        <td>${yesNoBadge(c.license)}</td>
        <td>${checkIcon(c.car)}</td>
        <td>${checkIcon(c.moto)}</td>
        <td>${checkIcon(c.truck)}</td>
        <td>${count}</td>
        <td>${money(total)}</td>
        <td><button class="btn btn-gold" data-open="${c.id}">Voir</button></td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;

  // bind buttons
  tbody.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => openClient(btn.getAttribute("data-open")));
  });
}

function openClient(clientId){
  const c = CACHE.clients.find(x => x.id === clientId);
  if(!c) return;

  const sales = CACHE.tx
    .filter(t => t.clientId === clientId)
    .map(t => {
      const buy = Number(t.buyPrice||0);
      const sell = Number(t.sellPrice||0);
      const profit = sell - buy;
      const dt = toDateSafe(t.createdAt);
      return {
        model: t.model || "-",
        buy, sell, profit,
        date: dt ? dt.toLocaleDateString("fr-FR") : "-"
      };
    })
    .sort((a,b)=> (b.date||"").localeCompare(a.date||""));

  const totalSpent = sales.reduce((s,x)=>s+x.sell,0);
  const totalProfit = sales.reduce((s,x)=>s+x.profit,0);

  mTitle.textContent = c.name || "Client";
  mSubtitle.textContent = `${c.phone || "-"} • Permis: ${(String(c.license).toLowerCase()==="oui" || c.license===true) ? "Oui":"Non"} • Voiture:${c.car? "Oui":"Non"} • Moto:${c.moto? "Oui":"Non"} • Camion:${c.truck? "Oui":"Non"}`;

  mTotal.textContent = money(totalSpent);
  mProfit.textContent = money(totalProfit);
  mCount.textContent = String(sales.length);

  if(sales.length === 0){
    mSales.innerHTML = `<tr><td colspan="5">Aucun achat</td></tr>`;
  } else {
    mSales.innerHTML = sales.map(s => `
      <tr>
        <td>${s.date}</td>
        <td>${s.model}</td>
        <td>${money(s.buy)}</td>
        <td>${money(s.sell)}</td>
        <td>${money(s.profit)}</td>
      </tr>
    `).join("");
  }

  copyBtn.onclick = async () => {
    const text =
`PDM — Fiche client
Nom: ${c.name || "-"}
Téléphone: ${c.phone || "-"}
Achats: ${sales.length}
Total dépensé: ${money(totalSpent)}
Profit généré: ${money(totalProfit)}`;
    try{ await navigator.clipboard.writeText(text); }catch(e){}
  };

  modal.classList.remove("hidden");
}

function close(){
  modal.classList.add("hidden");
}

closeModal.addEventListener("click", close);
closeBtn.addEventListener("click", close);
modal.addEventListener("click", (e)=>{ if(e.target === modal) close(); });

search.addEventListener("input", render);
refreshBtn.addEventListener("click", load);

load();
