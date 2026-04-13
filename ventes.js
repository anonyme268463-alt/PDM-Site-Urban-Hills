import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";
import { esc, renderUserBadge, normRole, getCachedCollection, clearPdmCache } from "./common.js";

const txTable = document.getElementById("txTable");
const search = document.getElementById("search");
const addBtn = document.getElementById("addBtn");
const refreshBtn = document.getElementById("refreshBtn");
const importCsvBtn = document.getElementById("importCsvBtn");
const dedupeBtn = document.getElementById("dedupeBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAll = document.getElementById("selectAll");
const thSelect = document.getElementById("thSelect");

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

const voucherAlert = document.getElementById("voucherAlert");
const useVoucherBtn = document.getElementById("useVoucherBtn");

const modelsList = document.getElementById("modelsList");

let CACHE = {
  tx: [], clients: [], partners: [], users: [], vehicles: [], stock: [], reservations: [],
  vouchers: [],
  me: null, role: "staff",
  modelAlias: {}, modelSuffixAlias: {}
};
let editingId = null;
let voucherToDeduct = 0;
let voucherIdToUpdate = null;
let activeVoucher = null;

function money(n){
  return "$" + Number(n || 0).toLocaleString("en-US");
}
function dateFR(ts){
  if(!ts) return "-";
  const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds*1000) : new Date(ts));
  return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
}

function buildModelAlias(){
  CACHE.modelAlias = {};
  CACHE.modelSuffixAlias = {};
  CACHE.vehicles.forEach(v => {
    const brand = (v.brand || "").trim().toLowerCase();
    const model = (v.model || "").trim().toLowerCase();
    const full = `${brand} ${model}`;
    CACHE.modelAlias[full] = v;
    CACHE.modelSuffixAlias[model] = v;
  });
}

function resolveModelDisplay(str){
  const s = (str || "").trim().toLowerCase();
  if(CACHE.modelAlias[s]) return CACHE.modelAlias[s];
  const words = s.split(" ");
  const last = words[words.length - 1];
  if(CACHE.modelSuffixAlias[last]) return CACHE.modelSuffixAlias[last];
  return null;
}

function buildModelDatalist(){
  const items = CACHE.vehicles
    .map(v => `<option value="${esc(v.brand)} ${esc(v.model)}">`)
    .concat(Object.keys(CACHE.modelSuffixAlias).map(m => `<option value="${esc(m)}">`));
  modelsList.innerHTML = [...new Set(items)].join("");
}

async function loadMe(){
  try {
    const user = auth.currentUser;
    if(!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    if(snap.exists()){
      CACHE.me = snap.data();
      CACHE.role = normRole(CACHE.me.role || CACHE.me.rank || "staff");
      renderUserBadge(CACHE.me);
    } else {
      CACHE.me = { name: "User", role: "staff" };
      CACHE.role = "staff";
    }

    if(CACHE.role === "admin") {
      importCsvBtn?.classList.remove("hidden");
      dedupeBtn?.classList.remove("hidden");
      deleteSelectedBtn?.classList.remove("hidden");
      thSelect?.classList.remove("hidden");
    } else {
      importCsvBtn?.classList.add("hidden");
      dedupeBtn?.classList.add("hidden");
      deleteSelectedBtn?.classList.add("hidden");
      thSelect?.classList.add("hidden");
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

async function load(force = false){
  await loadMe();
  const colSpan = CACHE.role === "admin" ? 9 : 8;
  txTable.innerHTML = `<tr><td colspan="${colSpan}">Chargement...</td></tr>`;
  try {
    const [txData, clientsData, partnersData, usersData, vehiclesData, stockData, resData, voucherSnap] = await Promise.all([
      getDocs(query(collection(db,"transactions"), orderBy("createdAt","desc"))).then(s => s.docs.map(d => ({id:d.id, ...d.data()}))),
      getCachedCollection("clients", force),
      getCachedCollection("partners", force),
      getCachedCollection("users", force),
      getCachedCollection("vehicles", force),
      getCachedCollection("stock", force),
      getCachedCollection("reservations", force),
      getDocs(collection(db, "vouchers"))
    ]);

    CACHE.tx = txData;
    CACHE.clients = clientsData;
    CACHE.partners = partnersData;
    CACHE.users = usersData;
    CACHE.vehicles = vehiclesData;
    CACHE.stock = stockData;
    CACHE.reservations = resData;
    CACHE.vouchers = voucherSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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
    txTable.innerHTML = `<tr><td colspan="${colSpan}" class="red">Erreur de chargement.</td></tr>`;
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
    txTable.innerHTML = `<tr><td colspan="${CACHE.role === 'admin' ? 9 : 8}">Aucune vente</td></tr>`;
    return;
  }

  txTable.innerHTML = rows.map(t => {
    const editBtns = canEdit(t)
      ? `<button class="btn btn-gold" data-edit="${t.id}">Edit</button>
         <button class="btn" data-del="${t.id}">Suppr</button>`
      : `<span class="badge badge-no">LOCK</span>`;

    const checkbox = CACHE.role === "admin"
      ? `<td><input type="checkbox" class="row-select" data-id="${t.id}"></td>`
      : "";

    return `
      <tr>
        ${checkbox}
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

  if(selectAll) selectAll.checked = false;
}

if(selectAll) {
  selectAll.addEventListener("change", () => {
    const checkboxes = txTable.querySelectorAll(".row-select");
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
  });
}

function checkVoucher() {
  const clientId = fClient.value;
  voucherAlert?.classList.add("hidden");
  activeVoucher = null;
  voucherToDeduct = 0;
  voucherIdToUpdate = null;

  if (!clientId) return;

  const v = CACHE.vouchers.find(x => x.clientId === clientId && x.active && (x.currentValue || 0) > 0);
  if (v) {
    activeVoucher = v;
    if (voucherAlert) {
      voucherAlert.classList.remove("hidden");
      voucherAlert.querySelector("span").textContent = `Bon d'achat de ${money(v.currentValue)} disponible !`;
    }
  }
}

if (useVoucherBtn) {
  useVoucherBtn.addEventListener("click", () => {
    if (!activeVoucher) return;
    const currentSell = Number(fSell.value || 0);
    const vVal = Number(activeVoucher.currentValue || 0);

    const deduction = Math.min(vVal, currentSell);
    fSell.value = currentSell - deduction;
    fNotes.value += `\nBon d'achat utilisé: -${money(deduction)}`;

    voucherToDeduct = deduction;
    voucherIdToUpdate = activeVoucher.id;

    voucherAlert?.classList.add("hidden");
  });
}

function openAdd(){
  editingId = null;
  voucherToDeduct = 0;
  voucherIdToUpdate = null;
  activeVoucher = null;
  voucherAlert?.classList.add("hidden");

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
  const indicator = document.getElementById("saleTypeIndicator");
  if(indicator) indicator.style.display = "none";
  modal.classList.remove("hidden");
}

function openEdit(id){
  const t = CACHE.tx.find(x=>x.id===id);
  if(!t || !canEdit(t)) return;
  editingId = id;
  voucherToDeduct = 0;
  voucherIdToUpdate = null;
  activeVoucher = null;
  voucherAlert?.classList.add("hidden");

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
  const indicator = document.getElementById("saleTypeIndicator");
  if(indicator) indicator.style.display = "none";
  modal.classList.remove("hidden");
}

function close(){ modal.classList.add("hidden"); }
if(closeModal) closeModal.addEventListener("click", close);
if(cancelBtn) cancelBtn.addEventListener("click", close);
if(addBtn) addBtn.addEventListener("click", openAdd);
if(refreshBtn) refreshBtn.addEventListener("click", () => load(true));

async function autoPrice() {
  const modelStr = fModel.value.trim();
  const clientId = fClient.value;
  const clientObj = CACHE.clients.find(c => c.id === clientId);
  const clientName = (clientObj?.name || "").trim().toLowerCase();
  const indicator = document.getElementById("saleTypeIndicator");

  if (!modelStr) {
    fCatalogPrice.value = "";
    fDiscountRate.value = "";
    if (indicator) indicator.style.display = "none";
    return;
  }

  const vInfo = resolveModelDisplay(modelStr);
  if (!vInfo) {
    fCatalogPrice.value = "";
    fDiscountRate.value = "";
    if (indicator) indicator.style.display = "none";
    return;
  }

  const cataloguePrice = Number(vInfo.sellPrice ?? vInfo.price ?? 0);
  let buyPrice = Number(vInfo.buyPrice ?? (vInfo.sellPrice != null ? vInfo.price : Math.floor(cataloguePrice * 0.5)));
  const discountRate = await getClientDiscount(clientId);
  const sellPrice = Math.floor(cataloguePrice * (1 - (discountRate / 100)));

  let saleType = "Vente directe";
  const normModel = modelStr.toLowerCase();

  // Check reservations first
  const res = CACHE.reservations.find(r =>
    (r.client || "").trim().toLowerCase() === clientName &&
    ((r.model || "").toLowerCase().includes(normModel) || normModel.includes((r.model || "").toLowerCase()))
  );

  if (res) {
    saleType = "Vente d'une réservation";
    buyPrice = 0;
  } else {
    // Check stock
    const stock = CACHE.stock.find(s =>
      ((s.model || "").toLowerCase().includes(normModel) || normModel.includes((s.model || "").toLowerCase())) &&
      (Number(s.qty) || 0) > 0
    );
    if (stock) {
      saleType = "Vente depuis le stock";
      buyPrice = 0;
    }
  }

  fCatalogPrice.value = cataloguePrice;
  fDiscountRate.value = discountRate;
  fBuy.value = buyPrice;
  fSell.value = sellPrice;
  fDetail.value = saleType;

  if (indicator) {
    indicator.textContent = saleType;
    indicator.style.display = "block";
    if (saleType !== "Vente directe") {
      indicator.style.background = "rgba(46, 204, 113, 0.1)";
      indicator.style.color = "#2ecc71";
      indicator.style.borderColor = "#2ecc71";
    } else {
      indicator.style.background = "rgba(212, 175, 55, 0.1)";
      indicator.style.color = "var(--accent-gold)";
      indicator.style.borderColor = "var(--accent-gold)";
    }
  }

  if (discountRate > 0) fNotes.value = `Remise partenaire appliquée : ${discountRate}%`;
}
fModel.addEventListener("change", autoPrice);
fClient.addEventListener("change", () => {
  autoPrice();
  checkVoucher();
});

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
  let selectedDate = fDate.value ? new Date(fDate.value) : new Date();
  if (selectedDate > new Date()) selectedDate = new Date();
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
      const docRef = await addDoc(collection(db,"transactions"), payload);
      await logAction("VENTE_AJOUT", `Ajout vente: ${payload.model} pour ${payload.clientName} ($${payload.sellPrice})`);

      // Voucher management
      if (voucherIdToUpdate && voucherToDeduct > 0) {
        const vRef = doc(db, "vouchers", voucherIdToUpdate);
        const vSnap = await getDoc(vRef);
        if (vSnap.exists()) {
          const vData = vSnap.data();
          const newVal = Math.max(0, (vData.currentValue || 0) - voucherToDeduct);
          await updateDoc(vRef, {
            currentValue: newVal,
            active: newVal > 0,
            updatedAt: serverTimestamp()
          });
        }
      }

      // Automatic Inventory Management
      const detail = payload.detail;
      const normModel = payload.model.toLowerCase();
      const normClient = payload.clientName.toLowerCase();

      if (detail === "Vente depuis le stock") {
        const stockSnap = await getDocs(collection(db, "stock"));
        const stockItem = stockSnap.docs.find(d => {
          const s = d.data();
          const sModel = (s.brand + " " + s.model).toLowerCase();
          return sModel.includes(normModel) || normModel.includes(sModel) || (s.model.toLowerCase() === normModel);
        });
        if (stockItem) {
          const currentQty = Number(stockItem.data().qty || 0);
          if (currentQty <= 1) {
            await deleteDoc(doc(db, "stock", stockItem.id));
          } else {
            await updateDoc(doc(db, "stock", stockItem.id), { qty: currentQty - 1 });
          }
        }
      } else if (detail === "Vente d'une réservation") {
        const resSnap = await getDocs(collection(db, "reservations"));
        const resItem = resSnap.docs.find(d => {
          const r = d.data();
          const rModel = (r.brand + " " + r.model).toLowerCase();
          const rClient = (r.client || "").toLowerCase();
          const modelMatch = rModel.includes(normModel) || normModel.includes(rModel) || (r.model.toLowerCase() === normModel);
          const clientMatch = rClient.includes(normClient) || normClient.includes(rClient);
          return modelMatch && clientMatch;
        });
        if (resItem) {
          await deleteDoc(doc(db, "reservations", resItem.id));
        }
      }
    } else {
      await updateDoc(doc(db,"transactions", editingId), payload);
      await logAction("VENTE_MODIF", `Modif vente ${editingId}: ${payload.model} pour ${payload.clientName}`);
    }
    close();
    await load(true);
  } catch(e) { console.error(e); alert("Erreur lors de l'enregistrement."); }
}
if(saveBtn) saveBtn.addEventListener("click", save);

async function removeTx(id){
  if(!confirm("Supprimer cette vente ?")) return;
  try {
    await deleteDoc(doc(db,"transactions",id));
    await logAction("VENTE_SUPPR", `Suppression vente ${id}`);
    await load(true);
  } catch(e) { console.error(e); alert("Erreur lors de la suppression."); }
}

async function dedupeSales() {
  if (CACHE.role !== "admin") {
    alert("Accès refusé : Seul un administrateur peut supprimer les doublons.");
    return;
  }
  if (!confirm("Supprimer les doublons ? Seule la version la plus récente sera conservée.")) return;

  dedupeBtn.disabled = true;
  dedupeBtn.textContent = "Nettoyage...";

  try {
    const groups = {};
    CACHE.tx.forEach(t => {
      const d = t.createdAt?.toDate ? t.createdAt.toDate() : (t.createdAt?.seconds ? new Date(t.createdAt.seconds*1000) : new Date(t.createdAt));
      const dateKey = d ? d.toISOString().split('T')[0] : "no-date";
      const client = (t.clientId || "").trim().toLowerCase();
      const model = (t.model || "").trim().toLowerCase();
      const key = `${client}|${model}|${t.buyPrice}|${t.sellPrice}|${dateKey}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    let deleted = 0;
    let currentBatch = writeBatch(db);
    let batchCount = 0;

    for (const key in groups) {
      const list = groups[key];
      if (list.length > 1) {
        list.sort((a, b) => {
          const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
          const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
          return tb - ta;
        });
        for (let i = 1; i < list.length; i++) {
          currentBatch.delete(doc(db, "transactions", list[i].id));
          deleted++;
          batchCount++;
          if (batchCount >= 400) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchCount = 0;
          }
        }
      }
    }
    if (batchCount > 0) await currentBatch.commit();
    alert(`Nettoyage terminé : ${deleted} doublons supprimés.`);
    await load(true);
  } catch (err) {
    console.error("Dedupe error:", err);
    alert("Erreur lors du nettoyage.");
  } finally {
    dedupeBtn.disabled = false;
    dedupeBtn.textContent = "Supprimer Doublons";
  }
}
if(dedupeBtn) dedupeBtn.addEventListener("click", dedupeSales);

async function deleteSelected() {
  if (CACHE.role !== "admin") {
    alert("Accès refusé : Seul un administrateur peut supprimer plusieurs ventes.");
    return;
  }
  const selected = Array.from(txTable.querySelectorAll(".row-select:checked")).map(cb => cb.dataset.id);
  if (selected.length === 0) { alert("Aucune vente sélectionnée."); return; }
  if (!confirm(`Supprimer les ${selected.length} ventes sélectionnées ?`)) return;

  deleteSelectedBtn.disabled = true;
  deleteSelectedBtn.textContent = "Suppression...";

  try {
    let currentBatch = writeBatch(db);
    let count = 0;
    for (const id of selected) {
      currentBatch.delete(doc(db, "transactions", id));
      count++;
      if (count >= 400) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await currentBatch.commit();
    await logAction("VENTE_BATCH_SUPPR", `Suppression de ${selected.length} ventes`);
    alert(`Success: ${selected.length} ventes supprimées.`);
    await load(true);
  } catch (e) {
    console.error(e);
    alert("Erreur lors de la suppression groupée.");
  } finally {
    deleteSelectedBtn.disabled = false;
    deleteSelectedBtn.textContent = "Supprimer Sélection";
  }
}
if(deleteSelectedBtn) deleteSelectedBtn.addEventListener("click", deleteSelected);

onAuthStateChanged(auth, u => { if(u) load(); else window.location.href = "pdm-staff.html"; });

if (search) {
  search.addEventListener("input", () => {
    render();
  });
}

// --- CSV Import ---
const csvInput = document.getElementById("csvInput");

if (importCsvBtn && csvInput) {
  importCsvBtn.addEventListener("click", () => {
    if (CACHE.role !== "admin") {
      alert("Accès refusé : Action réservée aux administrateurs.");
      return;
    }
    csvInput.click();
  });
  csvInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) handleCSV(file);
    e.target.value = "";
  });
}

async function handleCSV(file) {
  if (CACHE.role !== "admin") {
    alert("Accès refusé : Seul un administrateur peut importer des ventes.");
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return alert("Fichier CSV vide ou invalide.");

    const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = lines[i].split(",").map(c => c.trim());
        if (cols.length < headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => row[h] = cols[idx]);

        const clientName = (row.client || row.nom || row["nom client"] || "").trim();
        const model = (row.modele || row.model || row["modèle"] || row["véhicule"] || "").trim();
        const buyPrice = Number(row.buy || row.achat || row["prix achat"] || row["achat ($)"] || 0);
        const sellPrice = Number(row.sell || row.vente || row["prix vente"] || row["vente ($)"] || 0);
        const dateStr = (row.date || row["date de vente"] || "").trim();
        const detail = (row.detail || row.détail || row["détails"] || "Import CSV").trim();

        if (!clientName || !model) continue;

        const client = CACHE.clients.find(c => (c.name || "").toLowerCase() === clientName.toLowerCase());
        if (!client) { console.warn("Client non trouvé:", clientName); continue; }

        let createdAt = new Date();
        if (dateStr) {
          const now = new Date();
          let parts = dateStr.split(/[\/\-\s]/);
          if (parts.length >= 3) {
            // Check for YYYY-MM-DD first
            if (parts[0].length === 4) {
              let y = parseInt(parts[0]);
              let m = parseInt(parts[1]) - 1;
              let d = parseInt(parts[2]);
              let t = new Date(y, m, d, 12, 0, 0);
              if (!isNaN(t.getTime())) createdAt = t;
            } else {
              let p0 = parseInt(parts[0]);
              let p1 = parseInt(parts[1]);
              let p2 = parseInt(parts[2]);
              if (p2 < 100) p2 += 2000;

              // Heuristic: DD/MM vs MM/DD. Prefer past date.
              let dateA = new Date(p2, p1 - 1, p0, 12, 0, 0); // DD/MM/YYYY
              let dateB = (p0 <= 12) ? new Date(p2, p0 - 1, p1, 12, 0, 0) : null; // MM/DD/YYYY

              const validA = !isNaN(dateA.getTime());
              const validB = dateB && !isNaN(dateB.getTime());

              if (validA && validB) {
                // If one is in the future and the other is in the past, pick the past one.
                if (dateA > now && dateB <= now) {
                  createdAt = dateB;
                } else if (dateB > now && dateA <= now) {
                  createdAt = dateA;
                } else {
                  // Both past or both future, default to dateA (DD/MM)
                  createdAt = dateA;
                }
              } else if (validA) {
                createdAt = dateA;
              } else if (validB) {
                createdAt = dateB;
              }
            }
          }
        }
        if (createdAt > new Date()) createdAt = new Date(); // Safety cap

        await addDoc(collection(db, "transactions"), {
          clientId: client.id, clientName: client.name,
          model, buyPrice, sellPrice, detail,
          sellerId: auth.currentUser?.uid,
          sellerName: CACHE.me?.name || "Vendeur",
          createdBy: auth.currentUser?.uid,
          createdAt: Timestamp.fromDate(createdAt),
          updatedAt: serverTimestamp()
        });
        count++;
      } catch (err) { console.error("Row error:", err); }
    }
    alert(`Import terminé : ${count} ventes ajoutées.`);
    await load(true);
  };
  reader.readAsText(file);
}
