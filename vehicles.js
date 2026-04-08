import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc,
  serverTimestamp, query, where, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";
import { esc, fmtDate, checkIsAdmin, showDenyScreen, renderUserBadge, normRole } from "./common.js";
import { VEHICLE_MAPPING } from "./vehicle_mapping.js";
import { mergeCatalogueToVehicles } from "./merge_collections.js";

const elements = {
  rows: document.getElementById("vehicleRows"),
  search: document.getElementById("search"),
  addBtn: document.getElementById("addBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  enrichBtn: document.getElementById("enrichBtn"),
  dedupeBtn: document.getElementById("dedupeBtn"),
  statTotal: document.getElementById("statTotal"),
  statCats: document.getElementById("statCats"),
  statMonth: document.getElementById("statMonth"),
  modal: document.getElementById("vehicleModal"),
  mTitle: document.getElementById("modalTitle"),
  vmClose: document.getElementById("closeModal"),
  vmCancel: document.getElementById("cancelVm"),
  vmSave: document.getElementById("saveVm"),
  vmDelete: document.getElementById("deleteVm"),
  vmId: document.getElementById("vmId"),
  vmBrand: document.getElementById("vmBrand"),
  vmModel: document.getElementById("vmModel"),
  vmCategory: document.getElementById("vmCategory"),
  vmClasse: document.getElementById("vmClasse"),
  vmPlaces: document.getElementById("vmPlaces"),
  vmVitesse: document.getElementById("vmVitesse"),
  vmPrice: document.getElementById("vmPrice"),
  vmSellPrice: document.getElementById("vmSellPrice"),
  vmUrl: document.getElementById("vmUrl"),
  vmFile: document.getElementById("vmFile"),
  logoutBtn: document.getElementById("logoutBtn")
};

let ALL_VEHICLES = [];
let OPEN_ID = null;
let USER_ROLE = "staff";

async function initData() {
  elements.rows.innerHTML = '<tr><td colspan="7" class="muted">Chargement...</td></tr>';
  try {
    const q = collection(db, "vehicles");
    const snap = await getDocs(q);
    ALL_VEHICLES = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error("Firestore error:", err);
    elements.rows.innerHTML = '<tr><td colspan="7" class="red">Erreur de connexion Firestore. Vérifiez vos permissions.</td></tr>';
  }
}

function render() {
  const searchTerm = (elements.search.value || "").trim().toLowerCase();

  const filtered = ALL_VEHICLES.filter(v => {
    if (!searchTerm) return true;
    return (v.brand || "").toLowerCase().includes(searchTerm) ||
           (v.model || "").toLowerCase().includes(searchTerm) || (v.type || "").toLowerCase().includes(searchTerm);
  });

  elements.statTotal.textContent = filtered.length;
  const categories = new Set(filtered.map(v => (v.type || "").trim().toLowerCase()).filter(Boolean));
  elements.statCats.textContent = categories.size;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCount = filtered.filter(v => {
    const d = v.createdAt?.toDate ? v.createdAt.toDate() : (v.createdAt ? new Date(v.createdAt) : null);
    return d && d >= startOfMonth;
  }).length;
  elements.statMonth.textContent = monthCount;

  if (filtered.length === 0) {
    elements.rows.innerHTML = '<tr><td colspan="7" class="muted">Aucun véhicule trouvé.</td></tr>';
    return;
  }

  elements.rows.innerHTML = filtered.map(v => {
    const editBtn = USER_ROLE === "admin"
      ? `<button class="btn btn-gold btn-sm" data-id="${v.id}" data-action="edit">Éditer</button>`
      : `<span class="badge badge-no">LECTURE</span>`;

    return `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${v.urlimagevehicule || ""}"
               style="width:48px; height:28px; object-fit:cover; border-radius:4px; background:#111;"
               onerror="this.src='https://via.placeholder.com/48x28?text=?'">
          <div>
            <div style="font-weight:600; color:#fff;">${esc(v.brand)}</div>
            <div class="muted" style="font-size:11px;">${esc(v.model)}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-size:13px;">${esc(v.type)}</div>
        <span class="badge badge-info" style="font-size:10px;">${esc(v.classe)}</span>
      </td>
      <td>
        <div style="font-size:13px;">👥 ${v.places || 0} places</div>
        <div class="muted" style="font-size:11px;">⚡ ${v.vitessemax || 0} km/h</div>
      </td>
      <td style="font-family:monospace; color:var(--accent-gold-soft); font-weight:600;">$${(v.buyPrice || v.price || 0).toLocaleString()}</td>
      <td style="font-family:monospace; color:var(--accent-gold); font-weight:600;">$${(v.sellPrice || v.price || 0).toLocaleString()}</td>
      <td class="muted" style="font-size:12px;">${fmtDate(v.createdAt)}</td>
      <td style="text-align:right;">
        ${editBtn}
      </td>
    </tr>
  `}).join("");

  elements.rows.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = ALL_VEHICLES.find(x => x.id === btn.dataset.id);
      if (!v) return;
      OPEN_ID = v.id;
      elements.vmId.textContent = v.id;
      elements.vmBrand.value = v.brand || "";
      elements.vmModel.value = v.model || "";
      elements.vmCategory.value = v.type || "";
      elements.vmClasse.value = v.classe || "";
      elements.vmPlaces.value = v.places || 0;
      elements.vmVitesse.value = v.vitessemax || 0;
      elements.vmPrice.value = v.buyPrice || v.price || 0;
      elements.vmSellPrice.value = v.sellPrice || v.price || 0;
      elements.vmUrl.value = v.urlimagevehicule || "";
      elements.vmFile.value = "";
      elements.vmDelete.style.display = "block";
      openModal("Modifier Véhicule");
    });
  });
}

function openModal(title) {
  elements.mTitle.textContent = title;
  elements.modal.classList.remove("hidden");
}

function closeModal() {
  elements.modal.classList.add("hidden");
}

elements.refreshBtn?.addEventListener("click", () => initData());
elements.search?.addEventListener("input", render);

elements.addBtn?.addEventListener("click", () => {
  OPEN_ID = null;
  elements.vmId.textContent = "-";
  elements.vmBrand.value = "";
  elements.vmModel.value = "";
  elements.vmCategory.value = "";
  elements.vmClasse.value = "";
  elements.vmPlaces.value = "";
  elements.vmVitesse.value = "";
  elements.vmPrice.value = "";
  elements.vmSellPrice.value = "";
  elements.vmUrl.value = "";
  elements.vmFile.value = "";
  elements.vmDelete.style.display = "none";
  openModal("Nouveau Véhicule");
});

elements.vmClose?.addEventListener("click", closeModal);
elements.vmCancel?.addEventListener("click", closeModal);

elements.vmSellPrice?.addEventListener("input", () => {
  const sell = Number(elements.vmSellPrice.value || 0);
  elements.vmPrice.value = Math.floor(sell / 2);
});

[elements.vmBrand, elements.vmModel].forEach(el => {
  el?.addEventListener("change", () => {
    const brand = elements.vmBrand.value.trim().toLowerCase();
    const model = elements.vmModel.value.trim().toLowerCase();
    if (VEHICLE_MAPPING[brand] && VEHICLE_MAPPING[brand][model]) {
      const data = VEHICLE_MAPPING[brand][model];
      if (!elements.vmCategory.value) elements.vmCategory.value = data.type || "";
      if (!elements.vmClasse.value) elements.vmClasse.value = data.classe || "";
      if (!elements.vmPlaces.value) elements.vmPlaces.value = data.places || 0;
      if (!elements.vmVitesse.value) elements.vmVitesse.value = data.vitessemax || 0;
    }
  });
});

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

elements.vmSave?.addEventListener("click", async () => {
  if (USER_ROLE !== "admin") return alert("Accès refusé. Seul un administrateur peut modifier les véhicules.");
  const brand = elements.vmBrand.value.trim();
  const model = elements.vmModel.value.trim();
  if (!brand || !model) return alert("Marque et Modèle sont requis.");

  elements.vmSave.disabled = true;
  elements.vmSave.textContent = "Enregistrement...";

  try {
    let url = elements.vmUrl.value.trim();
    if (elements.vmFile.files && elements.vmFile.files[0]) {
      url = await fileToBase64(elements.vmFile.files[0]);
    }

    const data = {
      brand,
      model,
      type: elements.vmCategory.value.trim(),
      classe: elements.vmClasse.value.trim(),
      places: Number(elements.vmPlaces.value || 0),
      vitessemax: Number(elements.vmVitesse.value || 0),
      buyPrice: Number(elements.vmPrice.value || 0),
      sellPrice: Number(elements.vmSellPrice.value || 0),
      urlimagevehicule: url,
      updatedAt: serverTimestamp(),
      brandKey: brand.toLowerCase(),
      modelKey: model.toLowerCase()
    };

    if (OPEN_ID) {
      await updateDoc(doc(db, "vehicles", OPEN_ID), data);
      await logAction("VEHICLE_UPDATE", `Modifié: ${brand} ${model}`);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "vehicles"), data);
      await logAction("VEHICLE_ADD", `Ajouté: ${brand} ${model}`);
    }
    closeModal();
    await initData();
  } catch (err) {
    console.error("Save error:", err);
    alert("Erreur lors de l'enregistrement.");
  } finally {
    elements.vmSave.disabled = false;
    elements.vmSave.textContent = "Enregistrer";
  }
});

elements.vmDelete?.addEventListener("click", async () => {
  if (USER_ROLE !== "admin") return alert("Accès refusé.");
  if (!OPEN_ID) return;
  if (!confirm("Supprimer ce véhicule définitivement ?")) return;
  try {
    const v = ALL_VEHICLES.find(x => x.id === OPEN_ID);
    await deleteDoc(doc(db, "vehicles", OPEN_ID));
    await logAction("VEHICLE_DELETE", `Supprimé: ${v?.brand} ${v?.model}`);
    closeModal();
    await initData();
  } catch (err) {
    console.error("Delete error:", err);
    alert("Erreur lors de la suppression.");
  }
});

elements.enrichBtn?.addEventListener("click", async () => {
  if (USER_ROLE !== "admin") return alert("Accès refusé.");
  if (!confirm("Importer les véhicules du catalogue vers la base de données ?")) return;
  elements.enrichBtn.disabled = true;
  elements.enrichBtn.textContent = "Fusion en cours...";
  try {
    const res = await mergeCatalogueToVehicles();
    alert(`Migration terminée : ${res.createdCount} créés, ${res.updatedCount} mis à jour.`);
    await initData();
  } catch (err) {
    console.error("Enrich error:", err);
    alert("Erreur lors de la fusion.");
  } finally {
    elements.enrichBtn.disabled = false;
    elements.enrichBtn.textContent = "Fusionner Catalogue";
  }
});

elements.dedupeBtn?.addEventListener("click", async () => {
  if (USER_ROLE !== "admin") return alert("Accès refusé.");
  if (!confirm("Supprimer les doublons ? Seule la version la plus récente sera conservée.")) return;
  elements.dedupeBtn.disabled = true;
  elements.dedupeBtn.textContent = "Nettoyage...";
  try {
    const groups = {};
    ALL_VEHICLES.forEach(v => {
      const key = `${v.brand?.toLowerCase()}|${v.model?.toLowerCase()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(v);
    });
    let deleted = 0;
    const batch = writeBatch(db);
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
          batch.delete(doc(db, "vehicles", list[i].id));
          deleted++;
          batchCount++;
          // Firestore batch limit is 500
          if (batchCount >= 400) {
            await batch.commit();
            batchCount = 0;
          }
        }
      }
    }
    if (batchCount > 0) await batch.commit();
    alert(`Nettoyage terminé : ${deleted} doublons supprimés.`);
    await initData();
  } catch (err) {
    console.error("Dedupe error:", err);
    alert("Erreur lors du nettoyage.");
  } finally {
    elements.dedupeBtn.disabled = false;
    elements.dedupeBtn.textContent = "Supprimer les doublons";
  }
});

elements.logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "pdm-staff.html";
    return;
  }
  try {
    const uSnap = await getDoc(doc(db, "users", user.uid));
    if (uSnap.exists()) {
      const userData = uSnap.data();
      renderUserBadge(userData);
      USER_ROLE = normRole(userData.role || userData.rank);
    } else {
      USER_ROLE = "staff";
    }

    if (USER_ROLE === "admin") {
      elements.addBtn?.classList.remove("hidden");
      elements.enrichBtn?.classList.remove("hidden");
      elements.dedupeBtn?.classList.remove("hidden");
    } else {
      elements.addBtn?.classList.add("hidden");
      elements.enrichBtn?.classList.add("hidden");
      elements.dedupeBtn?.classList.add("hidden");
    }

    initData();
  } catch (err) {
    console.error("Auth init error:", err);
    initData();
  }
});
