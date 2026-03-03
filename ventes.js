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

// (optionnel) si tu as un <datalist id="modelsList"></datalist> dans ventes.html
const modelsList = document.getElementById("modelsList");

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

let CACHE = {
  clients: [],
  tx: [],
  vehicles: [],
  modelAlias: new Map(), // "R/A" -> "Brioso R/A"
  me: null,
  role: "staff"
};

let editingId = null;

function normKey(s){
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

// construit une table d’alias depuis vehicles
function buildModelAlias(){
  CACHE.modelAlias = new Map();

  for(const v of CACHE.vehicles){
    const full = (v.model || "").trim();
    if(!full) continue;

    // clé full
    CACHE.modelAlias.set(normKey(full), full);

    // alias = dernier “mot” après espace (ex: "Brioso R/A" -> "R/A")
    const parts = full.split(" ");
    if(parts.length >= 2){
      const last = parts[parts.length - 1];
      if(last && last.length >= 2){
        CACHE.modelAlias.set(normKey(last), full);
      }
    }

    // alias supplémentaire : si le modèle contient " / " ou "/" on garde aussi la partie après espace
    // (ex: "Brioso R/A" déjà couvert)
  }
}

function resolveModelDisplay(inputModel){
  const key = normKey(inputModel);
  if(!key) return "-";
  // 1) match direct
  if(CACHE.modelAlias.has(key)) return CACHE.modelAlias.get(key);
  // 2) fallback : essayer “contient”
  // (utile si tx.model="RA" ou variantes)
  for(const [k, full] of CACHE.modelAlias.entries()){
    if(k.includes(key) || key.includes(k)) return full;
  }
  return inputModel || "-";
}

// (optionnel) propose les modèles en auto-complétion
function buildModelDatalist(){
  if(!modelsList) return;
  const uniq = Array.from(new Set(
    CACHE.vehicles
      .map(v => (v.model || "").trim())
      .filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b, "fr"));
  modelsList.innerHTML = uniq.map(m => `<option value="${m}"></option>`).join("");
}

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

  const [clientsSnap, txSnap, vehiclesSnap] = await Promise.all([
    getDocs(collection(db,"clients")),
    getDocs(collection(db,"transactions")),
    getDocs(collection(db,"vehicles"))
  ]);

  CACHE.clients = clientsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  CACHE.tx = txSnap.docs.map(d => ({ id:d.id, ...d.data() }));
  CACHE.vehicles = vehiclesSnap.docs.map(d => ({ id:d.id, ...d.data() }));

  buildModelAlias();
  buildModelDatalist();

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
        _modelDisplay: resolveModelDisplay(t.model)
      };
    })
    .filter(t => {
      if(!q) return true;
      return (t._clientName||"").toLowerCase().includes(q)
        || (t._modelDisplay||"").toLowerCase().includes(q);
    })
    .sort((a,b)=>{
      const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const dbb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return dbb - da;
    });

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
        <td title="${t._modelDisplay}">${t._modelDisplay}</td>
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

  const modelRaw = fModel.value.trim();
  const modelNormalized = resolveModelDisplay(modelRaw); // <-- stocke le nom complet si possible

  const payload = {
    clientId,
    clientName,
    model: modelNormalized,
    detail: (fDetail.value || "").trim(),
    notes: (fNotes.value || "").trim(),
    buyPrice,
    sellPrice,
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
