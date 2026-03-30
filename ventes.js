import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";
import { esc, renderUserBadge } from "./common.js";

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
const fDiscountRate = document.getElementById("fDiscountRate");
const fCatalogPrice = document.getElementById("fCatalogPrice");
const fSeller = document.getElementById("fSeller");
const sellerGroup = document.getElementById("sellerGroup");
const fNotes = document.getElementById("fNotes");

const modelsList = document.getElementById("modelsList");

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "pdm-staff.html";
  });
}

function money(n){
  return "$" + Number(n || 0).toLocaleString("en-US");
}
function dateFR(ts){
  try{ if(ts?.toDate) return ts.toDate().toLocaleDateString("fr-FR"); }catch(e){}
  return "-";
}

let CACHE = { tx:[], clients:[], partners:[], users:[], vehicles:[], me:null, role:"staff", modelAlias:new Map() };
let editingId = null;

function normKey(s){
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function buildModelAlias(){
  CACHE.modelAlias = new Map();
  const list = CACHE.vehicles;
  for(const v of list){
    const brand = (v.brand || "").trim();
    const model = (v.model || "").trim();
    if(!model) continue;
    const kModel = normKey(model);
    if(!CACHE.modelAlias.has(kModel)) CACHE.modelAlias.set(kModel, v);
    const kFull = normKey(`${brand} ${model}`);
    if(!CACHE.modelAlias.has(kFull)) CACHE.modelAlias.set(kFull, v);
  }
}

function resolveModelDisplay(inputModel){
  const key = normKey(inputModel);
  if(!key) return null;
  if(CACHE.modelAlias.has(key)) return CACHE.modelAlias.get(key);
  return null;
}

function buildModelDatalist(){
  if(!modelsList) return;
  const list = CACHE.vehicles;
  const uniq = Array.from(new Set(
    list.map(v => (v.model || "").trim()).filter(Boolean)
  )).sort((a,b)=>a.localeCompare(b, "fr"));
  modelsList.innerHTML = uniq.map(m => `<option value="${esc(m)}"></option>`).join("");
}

async function loadMe(){
  const u = auth.currentUser;
  if(!u) return;
  try {
    const snap = await getDoc(doc(db,"users", u.uid));
    if(snap.exists()){
      CACHE.me = snap.data();
      CACHE.role = snap.data().role || "staff";
      renderUserBadge(CACHE.me);
    } else {
      CACHE.me = { name: "User", role: "staff" };
      CACHE.role = "staff";
    }
  } catch(e) { console.error("Error loading user info:", e); }
}

async function getClientDiscount(clientId) {
  if (!clientId) return 0;
  const client = CACHE.clients.find(c => c.id === clientId);
  if (!client) return 0;
  const clientNameNorm = (client.name || "").trim().toLowerCase();
  for (const p of CACHE.partners) {
    if (p.members && p.members.some(m => (m.name || "").trim().toLowerCase() === clientNameNorm)) {
      return Number(p.discount || 0);
    }
  }
  return 0;
}

async function load(){
  await loadMe();
  txTable.innerHTML = `<tr><td colspan="8">Chargement...</td></tr>`;
  try {
    const [txSnap, clientsSnap, partnersSnap, usersSnap, vehiclesSnap] = await Promise.all([
      getDocs(query(collection(db,"transactions"), orderBy("createdAt","desc"))),
      getDocs(collection(db,"clients")),
      getDocs(collection(db,"partners")),
      getDocs(collection(db,"users")),
      getDocs(collection(db,"vehicles"))
    ]);

    CACHE.tx = txSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    CACHE.clients = clientsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    CACHE.partners = partnersSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    CACHE.users = usersSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    CACHE.vehicles = vehiclesSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    for (const p of CACHE.partners) {
      const ms = await getDocs(collection(db, "partners", p.id, "members"));
      p.members = ms.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    buildModelAlias();
    buildModelDatalist();
    buildClientSelect();
    buildSellerSelect();
    render();
  } catch(e) {
    console.error(e);
    txTable.innerHTML = `<tr><td colspan="8" class="red">Erreur de chargement.</td></tr>`;
  }
}

function buildSellerSelect(){
  if(!fSeller) return;
  const opts = CACHE.users
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .map(u => `<option value="${u.id}">${esc(u.name || u.email || u.id)}</option>`);
  fSeller.innerHTML = opts.join("");
}

function buildClientSelect(){
  const opts = [`<option value="">-- Choisir un client --</option>`]
    .concat(
      CACHE.clients
        .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
        .map(c => `<option value="${c.id}">${esc(c.name || c.id)}</option>`)
    );
  fClient.innerHTML = opts.join("");
}

function canEdit(tx){
  if(CACHE.role === "admin") return true;
  const uid = auth.currentUser?.uid;
  return (tx.sellerId === uid) || (tx.createdBy === uid);
}

function render(){
  const q = (search.value || "").trim().toLowerCase();
  const rows = CACHE.tx
    .map(t => {
      const clientName = t.clientName || (CACHE.clients.find(c => c.id === t.clientId)?.name) || "-";
      const vInfo = resolveModelDisplay(t.model);
      return {
        ...t,
        _clientName: clientName,
        _profit: Number(t.sellPrice||0) - Number(t.buyPrice||0),
        _modelDisplay: vInfo ? `${vInfo.brand} ${vInfo.model}` : t.model
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
        <td>${esc(t._clientName)}</td>
        <td title="${esc(t._modelDisplay)}">${esc(t._modelDisplay)}</td>
        <td>${money(t.buyPrice)}</td>
        <td>${money(t.sellPrice)}</td>
        <td>${money(t._profit)}</td>
        <td>${esc(t.sellerName || "-")}</td>
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
  fDiscountRate.value = "";
  fCatalogPrice.value = "";
  fNotes.value = "";
  if(CACHE.role === "admin"){
    sellerGroup.classList.remove("hidden");
    fSeller.value = auth.currentUser?.uid || "";
  } else {
    sellerGroup.classList.add("hidden");
  }
  modal.classList.remove("hidden");
}

function openEdit(id){
  const t = CACHE.tx.find(x=>x.id===id);
  if(!t || !canEdit(t)) return;
  editingId = id;
  mTitle.textContent = "Modifier la vente";
  const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
  fDate.value = d.toISOString().slice(0,10);
  fClient.value = t.clientId || "";
  fModel.value = t.model || "";
  fDetail.value = t.detail || "";
  fBuy.value = String(t.buyPrice || "");
  fSell.value = String(t.sellPrice || "");
  if(CACHE.role === "admin"){
    sellerGroup.classList.remove("hidden");
    fSeller.value = t.sellerId || "";
  } else {
    sellerGroup.classList.add("hidden");
  }
  const vInfo = resolveModelDisplay(t.model);
  if (vInfo) {
    const cataloguePrice = Number(vInfo.sellPrice ?? vInfo.price ?? 0);
    fCatalogPrice.value = cataloguePrice;
    let rate = 0;
    if (t.sellPrice && cataloguePrice) {
      rate = Math.round((1 - (t.sellPrice / cataloguePrice)) * 100);
      if (rate < 0) rate = 0;
    }
    fDiscountRate.value = rate;
  } else {
    fCatalogPrice.value = "";
    fDiscountRate.value = "";
  }
  fNotes.value = t.notes || "";
  modal.classList.remove("hidden");
}

function close(){ modal.classList.add("hidden"); }
if(closeModal) closeModal.addEventListener("click", close);
if(cancelBtn) cancelBtn.addEventListener("click", close);
if(addBtn) addBtn.addEventListener("click", openAdd);
if(refreshBtn) refreshBtn.addEventListener("click", load);

async function autoPrice() {
  const modelStr = fModel.value.trim();
  const clientId = fClient.value;
  if (!modelStr) { fCatalogPrice.value = ""; fDiscountRate.value = ""; return; }
  const vInfo = resolveModelDisplay(modelStr);
  if (!vInfo) { fCatalogPrice.value = ""; fDiscountRate.value = ""; return; }
  const cataloguePrice = Number(vInfo.sellPrice ?? vInfo.price ?? 0);
  const buyPrice = Number(vInfo.buyPrice ?? (vInfo.sellPrice != null ? vInfo.price : Math.floor(cataloguePrice * 0.5)));
  const discountRate = await getClientDiscount(clientId);
  const sellPrice = Math.floor(cataloguePrice * (1 - (discountRate / 100)));
  fCatalogPrice.value = cataloguePrice;
  fDiscountRate.value = discountRate;
  fBuy.value = buyPrice;
  fSell.value = sellPrice;
  if (discountRate > 0) fNotes.value = `Remise partenaire appliquée : ${discountRate}%`;
}
fModel.addEventListener("change", autoPrice);
fClient.addEventListener("change", autoPrice);

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
  const vInfo = resolveModelDisplay(modelRaw);
  const modelNormalized = vInfo ? `${vInfo.brand} ${vInfo.model}` : modelRaw;
  const selectedDate = fDate.value ? new Date(fDate.value) : new Date();
  const createdAt = Timestamp.fromDate(selectedDate);

  let sellerId = uid;
  let sellerName = CACHE.me?.name || "Vendeur";
  if(CACHE.role === "admin" && fSeller.value){
    sellerId = fSeller.value;
    const sUser = CACHE.users.find(u => u.id === sellerId);
    if(sUser) sellerName = sUser.name || sUser.email || "Vendeur";
  }

  const payload = {
    clientId, clientName, model: modelNormalized,
    detail: (fDetail.value || "").trim(), notes: (fNotes.value || "").trim(),
    buyPrice, sellPrice, sellerId, sellerName, createdBy: uid,
    updatedAt: serverTimestamp(), createdAt
  };

  try {
    if(!editingId){
      await addDoc(collection(db,"transactions"), payload);
      await logAction("VENTE_AJOUT", `Ajout vente: ${payload.model} pour ${payload.clientName} ($${payload.sellPrice})`);
    } else {
      await updateDoc(doc(db,"transactions", editingId), payload);
      await logAction("VENTE_MODIF", `Modif vente ${editingId}: ${payload.model} pour ${payload.clientName}`);
    }
    close();
    await load();
  } catch(e) { console.error(e); alert("Erreur lors de l'enregistrement."); }
}
if(saveBtn) saveBtn.addEventListener("click", save);

async function removeTx(id){
  if(!confirm("Supprimer cette vente ?")) return;
  try {
    await deleteDoc(doc(db,"transactions",id));
    await logAction("VENTE_SUPPR", `Suppression vente ${id}`);
    await load();
  } catch(e) { console.error(e); alert("Erreur lors de la suppression."); }
}

onAuthStateChanged(auth, u => { if(u) load(); else window.location.href = "pdm-staff.html"; });
