// compta.js
import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const searchInput = document.getElementById("searchInput");
const refreshBtn  = document.getElementById("refreshBtn");
const addBtn      = document.getElementById("addBtn");

const statCA     = document.getElementById("statCA");
const statProfit = document.getElementById("statProfit");
const statCount  = document.getElementById("statCount");

const txTbody    = document.getElementById("txTable");
const logoutBtn  = document.getElementById("logoutBtn");

// dialog
const dlg     = document.getElementById("txDialog");
const dTitle  = document.getElementById("dTitle");
const dClose  = document.getElementById("dClose");
const dCancel = document.getElementById("dCancel");
const dSave   = document.getElementById("dSave");
const dClient = document.getElementById("dClient");
const dModel  = document.getElementById("dModel");
const dBuy    = document.getElementById("dBuy");
const dSell   = document.getElementById("dSell");
const dDate   = document.getElementById("dDate");

let rows = [];
let unsub = null;

const money = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString("en-US");
};
const fmt$ = (n) => `$${money(n)}`;

function fmtDate(ts){
  try{
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
    return d.toLocaleDateString("fr-FR");
  } catch { return "—"; }
}
function norm(s){ return (s ?? "").toString().trim().toLowerCase(); }

function refreshStats() {
  const ca = rows.reduce((a,r)=>a + (Number(r.sellPrice)||0), 0);
  const profit = rows.reduce((a,r)=>a + ((Number(r.sellPrice)||0)-(Number(r.buyPrice)||0)), 0);
  statCA.textContent = fmt$(ca);
  statProfit.textContent = fmt$(profit);
  statCount.textContent = `${rows.length}`;
}

function render(list) {
  if (!list.length) {
    txTbody.innerHTML = `<tr><td colspan="8" class="muted">Aucune transaction.</td></tr>`;
    return;
  }
  txTbody.innerHTML = list.map(r => {
    const buy = Number(r.buyPrice)||0;
    const sell = Number(r.sellPrice)||0;
    const profit = sell - buy;
    return `
      <tr>
        <td>${fmtDate(r.createdAt || r.date)}</td>
        <td>${r.client ?? "-"}</td>
        <td>${r.model ?? "-"}</td>
        <td>${fmt$(buy)}</td>
        <td>${fmt$(sell)}</td>
        <td>${fmt$(profit)}</td>
        <td>${r.vendorEmail ?? r.createdByEmail ?? "-"}</td>
        <td class="td-actions">
          <button class="btn btn-sm btn-danger" data-del="${r.id}">Supprimer</button>
        </td>
      </tr>
    `;
  }).join("");
}

function applyFilter(){
  const q = norm(searchInput.value);
  const list = q
    ? rows.filter(r => [r.client, r.model, r.vendorEmail, r.createdByEmail].some(x => norm(x).includes(q)))
    : rows;
  render(list);
  refreshStats();
}

function openDialog(){
  dTitle.textContent = "Ajouter une transaction";
  dClient.value = "";
  dModel.value = "";
  dBuy.value = "";
  dSell.value = "";
  dDate.value = "";
  dlg.showModal();
}
function closeDialog(){ try{ dlg.close(); }catch{} }

searchInput.addEventListener("input", applyFilter);
refreshBtn.addEventListener("click", ()=>{ applyFilter(); refreshStats(); });
addBtn.addEventListener("click", openDialog);
dClose.addEventListener("click", closeDialog);
dCancel.addEventListener("click", closeDialog);

dSave.addEventListener("click", async () => {
  const client = (dClient.value||"").trim();
  const model  = (dModel.value||"").trim(); // IMPORTANT: on garde le nom complet
  const buyPrice  = Math.max(0, Number(dBuy.value||0));
  const sellPrice = Math.max(0, Number(dSell.value||0));

  if (!client || !model) return alert("Client + Modèle requis.");
  if (!sellPrice) return alert("SELL requis.");

  const vendorEmail = auth.currentUser?.email || null;

  let dateTs = null;
  if (dDate.value) {
    const d = new Date(dDate.value + "T12:00:00");
    dateTs = Timestamp.fromDate(d);
  }

  try{
    await addDoc(collection(db, "transactions"), {
      client,
      model,
      buyPrice,
      sellPrice,
      vendorEmail,
      createdBy: auth.currentUser?.uid || null,
      createdAt: serverTimestamp(),
      ...(dateTs ? { date: dateTs } : {})
    });
    closeDialog();
  } catch(e){
    console.error(e);
    alert("Erreur lors de l'ajout.");
  }
});

txTbody.addEventListener("click", async (e) => {
  const id = e.target?.dataset?.del;
  if (!id) return;
  if (!confirm("Supprimer cette transaction ?")) return;
  try{
    await deleteDoc(doc(db, "transactions", id));
  } catch(err){
    console.error(err);
    alert("Erreur suppression.");
  }
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

function start() {
  const qTx = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
  unsub = onSnapshot(qTx, (snap) => {
    rows = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    applyFilter();
  });
}
function stop(){ try{unsub?.()}catch{} unsub=null; }

onAuthStateChanged(auth, (user) => {
  if (!user) { stop(); window.location.href = "pdm-staff.html"; return; }
  if (!unsub) start();
});
