// catalogue.js (admin-only)
import { auth, db, storage } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-storage.js";

const logoutBtn = document.getElementById("logoutBtn");
const pageRoot = document.getElementById("pageRoot");
const vehiclesTableBody = document.getElementById("vehiclesTableBody");
const vehicleModal = document.getElementById("vehicleModal");
const vehicleForm = document.getElementById("vehicleForm");
const modalTitle = document.getElementById("modalTitle");
const addVehicleBtn = document.getElementById("addVehicleBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const saveVehicleBtn = document.getElementById("saveVehicleBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const importCsvBtn = document.getElementById("importCsvBtn");
const importCsvInput = document.getElementById("importCsvInput");
const imageSourceType = document.getElementById("imageSourceType");
const urlInput = document.getElementById("urlimagevehicule");
const fileInput = document.getElementById("fileimagevehicule");
const uploadStatus = document.getElementById("uploadStatus");

let currentVehicles = [];

// 1. Permissions & Auth
async function requireAdmin(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return false;
  const data = snap.data();
  const role = String(data.role || "staff").toLowerCase();
  const rank = String(data.rank || "staff").toLowerCase();
  const admins = ["admin", "pdg", "patron", "direction"];
  return admins.includes(role) || admins.includes(rank);
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

    currentVehicles = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    // Sort by brand in memory to provide a clean list without extra Firestore indexes.
    currentVehicles.sort((a, b) => a.type.localeCompare(b.type) || a.brand.localeCompare(b.brand));

    currentVehicles.forEach(v => {
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

  // Reset image toggles
  imageSourceType.value = "url";
  urlInput.classList.remove("hidden");
  fileInput.classList.add("hidden");
  urlInput.required = true;
  fileInput.required = false;
  uploadStatus.textContent = "";

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
  let imageUrl = urlInput.value;

  if (imageSourceType.value === "file" && fileInput.files.length > 0) {
    try {
      uploadStatus.textContent = "Téléchargement de l'image...";
      const file = fileInput.files[0];
      const storageRef = ref(storage, `vehicles/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      imageUrl = await getDownloadURL(snapshot.ref);
      uploadStatus.textContent = "Image téléchargée avec succès !";
    } catch (e) {
      alert("Erreur lors du téléchargement de l'image : " + e.message);
      return;
    }
  }

  const data = {
    brand: document.getElementById("brand").value,
    model: document.getElementById("model").value,
    type: document.getElementById("type").value,
    classe: document.getElementById("classe").value,
    price: Number(document.getElementById("price").value),
    places: Number(document.getElementById("places").value),
    vitessemax: Number(document.getElementById("vitessemax").value),
    urlimagevehicule: imageUrl,
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

function exportToCSV() {
  if (currentVehicles.length === 0) {
    alert("Aucune donnée à exporter.");
    return;
  }

  const headers = ["Marque", "Modèle", "Type", "Classe", "Prix", "Places", "Vitesse Max", "URL Image"];
  const rows = currentVehicles.map(v => [
    v.brand,
    v.model,
    v.type,
    v.classe || "",
    v.price,
    v.places,
    v.vitessemax,
    v.urlimagevehicule
  ]);

  let csvContent = "data:text/csv;charset=utf-8,"
    + headers.join(",") + "\n"
    + rows.map(e => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `pdm_catalogue_${new Date().toLocaleDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function importCSV(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split("\n");
    // Skip header
    const dataRows = lines.slice(1);

    let count = 0;
    for (const row of dataRows) {
      if (!row.trim()) continue;
      // Basic CSV splitting (doesn't handle commas in quotes)
      const cols = row.split(",");
      if (cols.length < 8) continue;

      const vehicle = {
        brand: cols[0].trim(),
        model: cols[1].trim(),
        type: cols[2].trim(),
        classe: cols[3].trim(),
        price: Number(cols[4].trim()),
        places: Number(cols[5].trim()),
        vitessemax: Number(cols[6].trim()),
        urlimagevehicule: cols[7].trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        await addDoc(collection(db, "vehiclescatalogue"), vehicle);
        count++;
      } catch (err) {
        console.error("Error importing vehicle:", vehicle.model, err);
      }
    }
    alert(`${count} véhicules importés avec succès.`);
    loadVehicles();
  };
  reader.readAsText(file);
}

// 3. Events
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

imageSourceType?.addEventListener("change", (e) => {
  if (e.target.value === "url") {
    urlInput.classList.remove("hidden");
    fileInput.classList.add("hidden");
    urlInput.required = true;
    fileInput.required = false;
  } else {
    urlInput.classList.add("hidden");
    fileInput.classList.remove("hidden");
    urlInput.required = false;
    fileInput.required = true;
  }
});

addVehicleBtn?.addEventListener("click", () => openModal());
closeModalBtn?.addEventListener("click", () => vehicleModal.classList.add("hidden"));
saveVehicleBtn?.addEventListener("click", saveVehicle);
exportCsvBtn?.addEventListener("click", exportToCSV);
importCsvBtn?.addEventListener("click", () => importCsvInput.click());
importCsvInput?.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    importCSV(e.target.files[0]);
  }
});

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
