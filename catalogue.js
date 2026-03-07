// catalogue.js (admin-only)
import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const logoutBtn = document.getElementById("logoutBtn");
const pageRoot = document.getElementById("pageRoot");
const vehiclesTableBody = document.getElementById("vehiclesTableBody");
const vehicleModal = document.getElementById("vehicleModal");
const vehicleForm = document.getElementById("vehicleForm");
const modalTitle = document.getElementById("modalTitle");
const addVehicleBtn = document.getElementById("addVehicleBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const saveVehicleBtn = document.getElementById("saveVehicleBtn");

// 1. Permissions & Auth
async function requireAdmin(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return false;
  const data = snap.data();
  const role = String(data.role || data.rank || "staff").toLowerCase();
  const admins = ["admin", "pdg", "patron", "direction"];
  return admins.includes(role);
}

function deny(){
  pageRoot.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">Accès refusé</div>
      </div>
      <p class="muted" style="padding:18px">Vous n'avez pas l'autorisation de consulter cette page. Si tu penses que c'est une erreur, contacte la direction.</p>
    </div>
  `;
}

// 2. Data Logic
async function loadVehicles() {
  if (!vehiclesTableBody) return;
  vehiclesTableBody.innerHTML = `<tr><td colspan="5" class="muted">Chargement...</td></tr>`;
  try {
    // Simplified query to avoid requiring a composite index immediately.
    const q = query(collection(db, "vehiclescatalogue"), orderBy("type"));
    const snap = await getDocs(q);
    vehiclesTableBody.innerHTML = "";

    const docs = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    // Sort by brand in memory to provide a clean list without extra Firestore indexes.
    docs.sort((a, b) => a.type.localeCompare(b.type) || a.brand.localeCompare(b.brand));

    docs.forEach(v => {
      const id = v.id;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:600">${v.brand}</div>
          <div class="muted">${v.model}</div>
        </td>
        <td>
          <div>${v.type}</div>
          <div class="badge badge-info">${v.classe || '-'}</div>
        </td>
        <td class="text-gold" style="font-weight:600">€ ${Number(v.price).toLocaleString()}</td>
        <td>
          <div>🚗 ${v.places || 0} places</div>
          <div class="muted">⚡ ${v.vitessemax || 0} km/h</div>
        </td>
        <td>
          <div class="flex-row">
            <button class="btn btn-sm btn-outline edit-btn" data-id="${id}">Éditer</button>
            <button class="btn btn-sm btn-danger delete-btn" data-id="${id}">Supprimer</button>
          </div>
        </td>
      `;
      vehiclesTableBody.appendChild(tr);
    });

    // Attach events
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.onclick = () => openModal(btn.dataset.id);
    });
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.onclick = () => deleteVehicle(btn.dataset.id);
    });

  } catch (e) {
    console.error(e);
    vehiclesTableBody.innerHTML = `<tr><td colspan="5" class="red">Erreur lors du chargement.</td></tr>`;
  }
}

async function openModal(id = null) {
  vehicleForm.reset();
  document.getElementById("vehicleId").value = id || "";
  modalTitle.textContent = id ? "Modifier le véhicule" : "Ajouter un véhicule";

  if (id) {
    const snap = await getDoc(doc(db, "vehiclescatalogue", id));
    if (snap.exists()) {
      const v = snap.data();
      document.getElementById("brand").value = v.brand || "";
      document.getElementById("model").value = v.model || "";
      document.getElementById("type").value = v.type || "";
      document.getElementById("classe").value = v.classe || "";
      document.getElementById("price").value = v.price || 0;
      document.getElementById("places").value = v.places || 0;
      document.getElementById("vitessemax").value = v.vitessemax || 0;
      document.getElementById("urlimagevehicule").value = v.urlimagevehicule || "";
    }
  }
  vehicleModal.classList.remove("hidden");
}

async function saveVehicle() {
  const id = document.getElementById("vehicleId").value;
  const data = {
    brand: document.getElementById("brand").value,
    model: document.getElementById("model").value,
    type: document.getElementById("type").value,
    classe: document.getElementById("classe").value,
    price: Number(document.getElementById("price").value),
    places: Number(document.getElementById("places").value),
    vitessemax: Number(document.getElementById("vitessemax").value),
    urlimagevehicule: document.getElementById("urlimagevehicule").value,
    updatedAt: new Date().toISOString()
  };

  try {
    if (id) {
      await updateDoc(doc(db, "vehiclescatalogue", id), data);
    } else {
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, "vehiclescatalogue"), data);
    }
    vehicleModal.classList.add("hidden");
    loadVehicles();
  } catch (e) {
    alert("Erreur lors de l'enregistrement : " + e.message);
  }
}

async function deleteVehicle(id) {
  if (!confirm("Supprimer ce véhicule du catalogue ?")) return;
  try {
    await deleteDoc(doc(db, "vehiclescatalogue", id));
    loadVehicles();
  } catch (e) {
    alert("Erreur lors de la suppression : " + e.message);
  }
}

// 3. Events
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

addVehicleBtn?.addEventListener("click", () => openModal());
closeModalBtn?.addEventListener("click", () => vehicleModal.classList.add("hidden"));
saveVehicleBtn?.addEventListener("click", saveVehicle);

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }
  try{
    const ok = await requireAdmin(user);
    if (!ok) {
      deny();
    } else {
      loadVehicles();
    }
  } catch(e){
    console.error(e);
    deny();
  }
});
