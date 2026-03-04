import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);

const rows = $("rows");
const search = $("search");
const refreshBtn = $("refreshBtn");
const addBtn = $("addBtn");
const logoutBtn = $("logoutBtn");

const statTotal = $("statTotal");
const statCats = $("statCats");
const statMonth = $("statMonth");

const vehModal = $("vehModal");
const vmTitle = $("vmTitle");
const vmClose = $("vmClose");
const vmCancel = $("vmCancel");
const vmSave = $("vmSave");
const vmDelete = $("vmDelete");
const vmId = $("vmId");

const vmBrand = $("vmBrand");
const vmModel = $("vmModel");
const vmCategory = $("vmCategory"); // FIX
const vmPrice = $("vmPrice");
const vmSellPrice = $("vmSellPrice");

let VEHICLES = [];
let OPEN_ID = null;

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function fmtDate(ts){
  try { return ts?.toDate?.().toLocaleDateString("fr-FR") || "-"; }
  catch { return "-"; }
}

function openModal(){ vehModal.classList.remove("hidden"); }
function closeModal(){ vehModal.classList.add("hidden"); }

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

vmClose?.addEventListener("click", closeModal);
vmCancel?.addEventListener("click", closeModal);

vehModal?.addEventListener("click", (e)=>{
  if(e.target === vehModal) closeModal();
});

refreshBtn?.addEventListener("click", loadVehicles);
search?.addEventListener("input", render);

addBtn?.addEventListener("click", () => {

  OPEN_ID = null;

  vmTitle.textContent = "Ajouter un véhicule";
  vmId.textContent = "-";

  vmBrand.value = "";
  vmModel.value = "";
  vmCategory.value = "";
  vmPrice.value = 0;
  vmSellPrice.value = 0;

  vmDelete.style.display = "none";

  openModal();
});

vmSave?.addEventListener("click", async () => {

  const brand = (vmBrand.value || "").trim();
  const model = (vmModel.value || "").trim();
  const type = (vmCategory.value || "").trim();

  const price = Number(vmPrice.value || 0);
  const sellPrice = Number(vmSellPrice.value || 0);

  if(!brand || !model)
    return alert("Marque et modèle obligatoires.");

  if(Number.isNaN(price) || price < 0)
    return alert("Price invalide.");

  if(Number.isNaN(sellPrice) || sellPrice < 0)
    return alert("Sell price invalide.");

  const payload = {
    brand,
    model,
    type,
    price,
    sellPrice,
    brandKey: brand.toLowerCase(),
    modelKey: model.toLowerCase(),
    typeKey: type.toLowerCase(),
    updatedAt: serverTimestamp()
  };

  if(!OPEN_ID){

    payload.createdAt = serverTimestamp();

    await addDoc(collection(db, "vehicles"), payload);

  } else {

    await updateDoc(doc(db, "vehicles", OPEN_ID), payload);

  }

  closeModal();
  await loadVehicles();
});

vmDelete?.addEventListener("click", async () => {

  if(!OPEN_ID) return;

  if(!confirm("Supprimer ce véhicule ?"))
    return;

  await deleteDoc(doc(db, "vehicles", OPEN_ID));

  closeModal();
  await loadVehicles();
});

async function loadVehicles(){

  rows.innerHTML = `<tr><td colspan="7">Chargement...</td></tr>`;

  const snap = await getDocs(collection(db, "vehicles"));

  VEHICLES = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  render();
}

function render(){

  const q = (search.value || "").trim().toLowerCase();

  const list = VEHICLES
  .filter(v => {

    if(!q) return true;

    const a = (v.brand || "").toLowerCase();
    const b = (v.model || "").toLowerCase();
    const c = (v.type || "").toLowerCase();

    return a.includes(q) || b.includes(q) || c.includes(q);

  })
  .sort((a,b)=>{

    const da = a.createdAt?.toDate?.()?.getTime?.() || 0;
    const db = b.createdAt?.toDate?.()?.getTime?.() || 0;

    return db - da;
  });

  statTotal.textContent = String(list.length);

  const catSet = new Set(
    list.map(v => (v.type || "").trim()).filter(Boolean)
  );

  statCats.textContent = String(catSet.size);

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const monthCount = list.filter(v => {

    const d = v.createdAt?.toDate?.();

    return d && d.getMonth() === month && d.getFullYear() === year;

  }).length;

  statMonth.textContent = String(monthCount);

  if(!list.length){

    rows.innerHTML = `<tr><td colspan="7">Aucun véhicule</td></tr>`;
    return;

  }

  rows.innerHTML = list.map(v => `
  <tr>
    <td>${esc(v.brand || "-")}</td>
    <td>${esc(v.model || "-")}</td>
    <td>${esc(v.type || "-")}</td>
    <td>$${Number(v.price || 0).toLocaleString("en-US")}</td>
    <td>$${Number(v.sellPrice || 0).toLocaleString("en-US")}</td>
    <td>${fmtDate(v.createdAt)}</td>
    <td style="text-align:right;">
      <button class="btn" data-edit="${v.id}">Modifier</button>
      <button class="btn btn-danger" data-del="${v.id}">Supprimer</button>
    </td>
  </tr>
  `).join("");

  rows.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> openEdit(btn.dataset.edit));
  });

  rows.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.del;
      if(!confirm("Supprimer ce véhicule ?")) return;
      await deleteDoc(doc(db, "vehicles", id));
      await loadVehicles();
    });
  });

}

function openEdit(id){

  const v = VEHICLES.find(x => x.id === id);
  if(!v) return;

  OPEN_ID = id;

  vmTitle.textContent = "Modifier un véhicule";
  vmId.textContent = id;

  vmBrand.value = v.brand || "";
  vmModel.value = v.model || "";
  vmCategory.value = v.type || "";
  vmPrice.value = Number(v.price || 0);
  vmSellPrice.value = Number(v.sellPrice || 0);

  vmDelete.style.display = "";

  openModal();
}

loadVehicles();
