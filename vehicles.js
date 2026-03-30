import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { VEHICLE_MAPPING } from "./vehicle_mapping.js";
import { runBulkEnrichment } from "./vehicles_migration.js";
import { mergeCatalogueToVehicles } from "./merge_collections.js";
import { checkIsAdmin, showDenyScreen } from "./common.js";

const $ = (id) => document.getElementById(id);

const rows = $("rows");
const search = $("search");
const refreshBtn = $("refreshBtn");
const addBtn = $("addBtn");
const enrichBtn = $("enrichBtn");
const dedupeBtn = $("dedupeBtn");
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
const vmCategory = $("vmCategory");
const vmClasse = $("vmClasse");
const vmPlaces = $("vmPlaces");
const vmVitesse = $("vmVitesse");
const vmUrl = $("vmUrl");
const vmFile = $("vmFile");
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

vmSellPrice?.addEventListener("input", () => {
  const sell = Number(vmSellPrice.value || 0);
  vmPrice.value = Math.floor(sell / 2);
});

[vmBrand, vmModel].forEach(el => {
  el?.addEventListener("change", () => {
    const b = (vmBrand.value || "").trim().toLowerCase();
    const m = (vmModel.value || "").trim().toLowerCase();
    if (VEHICLE_MAPPING[b] && VEHICLE_MAPPING[b][m]) {
      const stats = VEHICLE_MAPPING[b][m];
      if (!vmCategory.value) vmCategory.value = stats.type || "";
      if (!vmClasse.value) vmClasse.value = stats.classe || "";
      if (!vmPlaces.value || vmPlaces.value == 0) vmPlaces.value = stats.places || 0;
      if (!vmVitesse.value || vmVitesse.value == 0) vmVitesse.value = stats.vitessemax || 0;
    }
  });
});

vehModal?.addEventListener("click", (e)=>{
  if(e.target === vehModal) closeModal();
});

refreshBtn?.addEventListener("click", loadVehicles);
search?.addEventListener("input", render);

enrichBtn?.addEventListener("click", async () => {
  if(!confirm("Voulez-vous fusionner la collection catalogue vers la collection véhicules ?")) return;
  enrichBtn.disabled = true;
  enrichBtn.textContent = "Fusion en cours...";
  try {
    const res = await mergeCatalogueToVehicles();
    alert(`Fusion terminée ! ${res.createdCount} créés, ${res.updatedCount} mis à jour.`);
  } catch (err) {
    console.error(err);
    alert("Erreur lors de la fusion: " + err.message);
  }
  enrichBtn.disabled = false;
  enrichBtn.textContent = "Fusionner Catalogue";
  await loadVehicles();
});
dedupeBtn?.addEventListener("click", async () => {
  if(!confirm("Voulez-vous supprimer les doublons (même marque et même modèle) ? Seule la version la plus récente sera conservée.")) return;
  dedupeBtn.disabled = true;
  dedupeBtn.textContent = "Nettoyage...";

  try {
    const snap = await getDocs(collection(db, "vehicles"));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Group by Brand + Model (normalized)
    const groups = {};
    all.forEach(v => {
      const b = (v.brand || "").trim().toLowerCase();
      const m = (v.model || "").trim().toLowerCase();
      if (!b && !m) return; // skip empty entries
      const key = `${b}|${m}`;
      if(!groups[key]) groups[key] = [];
      groups[key].push(v);
    });

    let deletedCount = 0;
    let details = "";
    for(const key in groups) {
      const list = groups[key];
      if(list.length > 1) {
        // Sort by updatedAt or createdAt desc
        list.sort((a,b) => {
          const ta = (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0);
          const tb = (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0);
          return tb - ta;
        });

        // Keep the first (newest), delete others
        const toDelete = list.slice(1);
        for(const target of toDelete) {
          await deleteDoc(doc(db, "vehicles", target.id));
          deletedCount++;
        }
        details += `\n- ${key} (${list.length} -> 1)`;
      }
    }
    alert(`Nettoyage terminé ! ${deletedCount} doublons supprimés.${details ? '\n\nDétails :' + details : ''}`);
    await loadVehicles();
  } catch (err) {
    console.error(err);
    alert("Erreur lors du nettoyage: " + err.message);
  } finally {
    dedupeBtn.disabled = false;
    dedupeBtn.textContent = "Supprimer les doublons";
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

vmSave?.addEventListener("click", async () => {
  const brand = (vmBrand.value || "").trim();
  const model = (vmModel.value || "").trim();
  const type = (vmCategory.value || "").trim();
  const classe = (vmClasse.value || "").trim();
  const places = Number(vmPlaces.value || 0);
  const vitessemax = Number(vmVitesse.value || 0);
  let urlimagevehicule = (vmUrl.value || "").trim();

  const buyPrice = Number(vmPrice.value || 0);
  const sellPrice = Number(vmSellPrice.value || 0);

  if(!brand || !model) return alert("Marque et modèle obligatoires.");

  // Handle local file upload
  if (vmFile.files && vmFile.files[0]) {
    try {
      urlimagevehicule = await fileToBase64(vmFile.files[0]);
    } catch (e) {
      console.error("Error converting file:", e);
      return alert("Erreur lors de la lecture du fichier image.");
    }
  }

  const payload = {
    brand,
    model,
    type,
    classe,
    places,
    vitessemax,
    urlimagevehicule,
    buyPrice,
    sellPrice,
    brandKey: brand.toLowerCase(),
    modelKey: model.toLowerCase(),
    typeKey: type.toLowerCase(),
    updatedAt: serverTimestamp()
  };

  vmSave.disabled = true;
  vmSave.textContent = "Enregistrement...";

  try {
    if(!OPEN_ID){
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "vehicles"), payload);
    } else {
      await updateDoc(doc(db, "vehicles", OPEN_ID), payload);
    }
    closeModal();
    await loadVehicles();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'enregistrement.");
  } finally {
    vmSave.disabled = false;
    vmSave.textContent = "Enregistrer";
  }
});

vmDelete?.addEventListener("click", async () => {
  if(!OPEN_ID) return;
  if(!confirm("Supprimer ce véhicule ?")) return;
  await deleteDoc(doc(db, "vehicles", OPEN_ID));
  closeModal();
  await loadVehicles();
});

async function loadVehicles(){
  rows.innerHTML = `<tr><td colspan="7" class="muted">Chargement...</td></tr>`;
  try {
    const snap = await getDocs(collection(db, "vehicles"));
    VEHICLES = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    render();
  } catch (e) {
    console.error(e);
    rows.innerHTML = `<tr><td colspan="7" class="red">Erreur de chargement.</td></tr>`;
  }
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
  const catSet = new Set(list.map(v => (v.type || "").trim()).filter(Boolean));
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
    rows.innerHTML = `<tr><td colspan="7" class="muted">Aucun véhicule</td></tr>`;
    return;
  }

  rows.innerHTML = list.map(v => `
  <tr>
    <td>
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${v.urlimagevehicule}" style="width:40px; height:25px; object-fit:cover; border-radius:4px; background:#222;" onerror="this.src='https://via.placeholder.com/40x25?text=?'">
        <div>
          <div style="font-weight:600">${esc(v.brand || "-")}</div>
          <div class="muted" style="font-size:0.8em">${esc(v.model || "-")}</div>
        </div>
      </div>
    </td>
    <td>
      <div>${esc(v.type || "-")}</div>
      <div class="badge badge-info">${esc(v.classe || "-")}</div>
    </td>
    <td>
      <div>🚗 ${v.places || 0} pl.</div>
      <div class="muted" style="font-size:0.8em">⚡ ${v.vitessemax || 0} km/h</div>
    </td>
    <td>$${Number(v.buyPrice ?? v.price ?? 0).toLocaleString("en-US")}</td>
    <td>$${Number(v.sellPrice || 0).toLocaleString("en-US")}</td>
    <td>${fmtDate(v.createdAt)}</td>
    <td style="text-align:right;">
      <button class="btn btn-sm" data-edit="${v.id}">Modifier</button>
      <button class="btn btn-danger btn-sm" data-del="${v.id}">Supprimer</button>
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
  vmClasse.value = v.classe || "";
  vmPlaces.value = v.places || 0;
  vmVitesse.value = v.vitessemax || 0;
  vmUrl.value = v.urlimagevehicule || "";
  vmFile.value = "";
  vmPrice.value = Number(v.buyPrice ?? v.price ?? 0);
  vmSellPrice.value = Number(v.sellPrice || 0);
  vmDelete.style.display = "";
  openModal();
}

onAuthStateChanged(auth, async (u) => {
  if (!u) { window.location.href = "pdm-staff.html"; return; }
  const isAdmin = await checkIsAdmin(u.uid);
  if (!isAdmin) {
    showDenyScreen();
  } else {
    loadVehicles();
  }
});
