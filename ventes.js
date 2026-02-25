import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const txTable = document.getElementById("txTable");
const search = document.getElementById("search");
const addBtn = document.getElementById("addBtn");
const refreshBtn = document.getElementById("refreshBtn");

const kpiCA = document.getElementById("kpiCA");
const kpiProfit = document.getElementById("kpiProfit");
const kpiCount = document.getElementById("kpiCount");

const modal = document.getElementById("txModal");
const closeModal = document.getElementById("closeModal");
const cancelBtn = document.getElementById("cancelBtn");
const saveBtn = document.getElementById("saveBtn");
const mTitle = document.getElementById("mTitle");

const fDate = document.getElementById("fDate");
const fClient = document.getElementById("fClient");
const fModel = document.getElementById("fModel");
const fDetail = document.getElementById("fDetail");
const fBuy = document.getElementById("fBuy");
const fSell = document.getElementById("fSell");
const fNotes = document.getElementById("fNotes");

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

function money(n){
  return "$" + Number(n || 0).toLocaleString("en-US");
}
function dateFR(ts){
  try{ if(ts?.toDate) return ts.toDate().toLocaleDateString("fr-FR"); }catch(e){}
  return "-";
}

let CACHE = { clients: [], tx: [], me: null, role: "staff" };
let editingId = null;

async function loadMe(){
  const u = auth.currentUser;
  if(!u) return;
  const snap = await getDoc(doc(db,"users", u.uid));
  if(snap.exists()){
    CACHE.me = snap.data();
    CACHE.role = snap.data().role || "staff";
  } else {
    CACHE.me = { name: "User", role: "staff" };
    CACHE.role = "staff";
  }
}

async function load(){
  txTable.innerHTML = `<tr><td colspan="8">Chargement...</td></tr>`;

  await loadMe();

  const [clientsSnap, txSnap] = await Promise.all([
    getDocs(collection(db,"clients")),
    getDocs(collection(db,"transactions"))
  ]);

  CACHE.clients = clientsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  CACHE.tx = txSnap.docs.map(d => ({ id:d.id, ...d.data() }));

  buildClientSelect();
  render();
}

function buildClientSelect(){
  const opts = [`<option value="">-- Choisir un client --</option>`]
    .concat(
      CACHE.clients
        .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
        .map(c => `<option value="${c.id}">${c.name || c.id}</option>`)
    );
  fClient.innerHTML = opts.join("");
}

function canEdit(tx){
  const uid = auth.currentUser?.uid;
  if(!uid) return false;
  if(CACHE.role === "admin") return true;
  return (tx.sellerId === uid) || (tx.createdBy === uid);
}

function render(){
  const q = (search.value || "").trim().toLowerCase();

  const rows = CACHE.tx
    .map(t => {
      const clientName =
        t.clientName ||
        (CACHE.clients.find(c => c.id === t.clientId)?.name) ||
        "-";

      return {
        ...t,
        _clientName: clientName,
        _profit: Number(t.sellPrice||0) - Number(t.buyPrice||0),
      };
    })
    .filter(t => {
      if(!q) return true;
      return (t._clientName||"").toLowerCase().includes(q)
        || (t.model||"").toLowerCase().includes(q);
    })
    .sort((a,b)=>{
      const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const dbb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return dbb - da;
    });

  // KPI
  const totalCA = rows.reduce((s,t)=> s + Number(t.sellPrice||0), 0);
  const totalProfit = rows.reduce((s,t)=> s + (Number(t.sellPrice||0)-Number(t.buyPrice||0)), 0);

  kpiCA.textContent = money(totalCA);
  kpiProfit.textContent = money(totalProfit);
  kpiCount.textContent = String(rows.length);

  if(rows.length === 0){
    txTable.innerHTML = `<tr><td colspan="8">Aucune vente</td></tr>`;
    return;
  }

  txTable.innerHTML = rows.map(t => {
    const editBtns = canEdit(t)
      ? `<button class="btn btn-gold" data-edit="${t.id}">Edit</button>
         <button class="btn" data-del="${t.id}">Suppr</button>`
      : `<span class="badge badge-no">LOCK</span>`;

    return `
      <tr>
        <td>${dateFR(t.createdAt)}</td>
        <td>${t._clientName}</td>
        <td>${t.model || "-"}</td>
        <td>${money(t.buyPrice)}</td>
        <td>${money(t.sellPrice)}</td>
        <td>${money(t._profit)}</td>
        <td>${t.sellerName || "-"}</td>
        <td style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">${editBtns}</td>
      </tr>
    `;
  }).join("");

  txTable.querySelectorAll("[data-edit]").forEach(b=>{
    b.addEventListener("click", ()=> openEdit(b.getAttribute("data-edit")));
  });
  txTable.querySelectorAll("[data-del]").forEach(b=>{
    b.addEventListener("click", ()=> removeTx(b.getAttribute("data-del")));
  });
}

function openAdd(){
  editingId = null;
  mTitle.textContent = "Ajouter une vente";

  const today = new Date();
  fDate.value = today.toISOString().slice(0,10);

  fClient.value = "";
  fModel.value = "";
  fDetail.value = "";
  fBuy.value = "";
  fSell.value = "";
  fNotes.value = "";

  modal.classList.remove("hidden");
}

function openEdit(id){
  const t = CACHE.tx.find(x=>x.id===id);
  if(!t) return;
  if(!canEdit(t)) return;

  editingId = id;
  mTitle.textContent = "Modifier la vente";

  const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
  fDate.value = d.toISOString().slice(0,10);

  fClient.value = t.clientId || "";
  fModel.value = t.model || "";
  fDetail.value = t.detail || "";
  fBuy.value = String(t.buyPrice || "");
  fSell.value = String(t.sellPrice || "");
  fNotes.value = t.notes || "";

  modal.classList.remove("hidden");
}

function close(){
  modal.classList.add("hidden");
}

async function save(){
  const uid = auth.currentUser?.uid;
  if(!uid) return;

  const clientId = fClient.value || "";
  const clientName = (CACHE.clients.find(c=>c.id===clientId)?.name) || "";

  const buyPrice = Number(fBuy.value || 0);
  const sellPrice = Number(fSell.value || 0);

  if(!clientId){ alert("Choisis un client."); return; }
  if(!fModel.value.trim()){ alert("Entre un modele."); return; }

  const payload = {
    clientId,
    clientName,
    model: fModel.value.trim(),
    detail: (fDetail.value || "").trim(),
    notes: (fNotes.value || "").trim(),
    buyPrice,
    sellPrice,

    // droits / audit
    sellerId: uid,
    sellerName: CACHE.me?.name || "Vendeur",
    createdBy: uid,
    updatedAt: serverTimestamp(),
  };

  if(!editingId){
    payload.createdAt = serverTimestamp();
    await addDoc(collection(db,"transactions"), payload);
  } else {
    await updateDoc(doc(db,"transactions", editingId), payload);
  }

  close();
  await load();
}

async function removeTx(id){
  const t = CACHE.tx.find(x=>x.id===id);
  if(!t) return;
  if(!canEdit(t)) return;

  if(!confirm("Supprimer cette vente ?")) return;
  await deleteDoc(doc(db,"transactions", id));
  await load();
}

addBtn.addEventListener("click", openAdd);
refreshBtn.addEventListener("click", load);
search.addEventListener("input", render);

closeModal.addEventListener("click", close);
cancelBtn.addEventListener("click", close);
modal.addEventListener("click", (e)=>{ if(e.target===modal) close(); });

saveBtn.addEventListener("click", save);

load();
