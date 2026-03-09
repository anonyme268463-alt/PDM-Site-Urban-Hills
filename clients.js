import { db, auth } from "./config.js";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";

const tbody = document.getElementById("clientsTable");
const search = document.getElementById("search");

// Fiche client
const modal = document.getElementById("clientModal");
const closeModal = document.getElementById("closeModal");

const mTitle = document.getElementById("mTitle");
const mTotal = document.getElementById("mTotal");
const mProfit = document.getElementById("mProfit");
const mCount = document.getElementById("mCount");
const mSales = document.getElementById("mSales");

// Ajout client
const addClientBtn = document.getElementById("addClientBtn");
const addClientModal = document.getElementById("addClientModal");
const addClientClose = document.getElementById("addClientClose");

const cName = document.getElementById("cName");
const cPhone = document.getElementById("cPhone");
const cLicense = document.getElementById("cLicense");
const cCar = document.getElementById("cCar");
const cMoto = document.getElementById("cMoto");
const cTruck = document.getElementById("cTruck");
const cSave = document.getElementById("cSave");
const cCancel = document.getElementById("cCancel");
const cError = document.getElementById("cError");

// Modification client
const editClientModal = document.getElementById("editClientModal");
const editClientClose = document.getElementById("editClientClose");
const editClientId = document.getElementById("editClientId");
const editCName = document.getElementById("editCName");
const editCPhone = document.getElementById("editCPhone");
const editCLicense = document.getElementById("editCLicense");
const editCCar = document.getElementById("editCCar");
const editCMoto = document.getElementById("editCMoto");
const editCTruck = document.getElementById("editCTruck");
const editCSave = document.getElementById("editCSave");
const editCCancel = document.getElementById("editCCancel");
const editCError = document.getElementById("editCError");

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "pdm-staff.html";
  });
}

function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-US");
}

function yesNoBadge(v) {
  const yes = (String(v).toLowerCase() === "oui") || v === true;
  return `<span class="badge ${yes ? "badge-yes" : "badge-no"}">${yes ? "Oui" : "Non"}</span>`;
}

function checkIcon(v) {
  const yes = v === true;
  return yes
    ? `<span class="badge badge-yes">✓</span>`
    : `<span class="badge badge-no">✕</span>`;
}

function toDateSafe(ts) {
  try {
    if (ts?.toDate) return ts.toDate();
  } catch (e) {}
  return null;
}

let CACHE = { clients: [], tx: [] };

async function load() {
  tbody.innerHTML = `<tr><td colspan="9">Chargement...</td></tr>`;

  const [clientsSnap, txSnap] = await Promise.all([
    getDocs(collection(db, "clients")),
    getDocs(collection(db, "transactions")),
  ]);

  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const tx = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  CACHE = { clients, tx };
  render();
}

function render() {
  const q = (search?.value || "").trim().toLowerCase();

  const filtered = CACHE.clients.filter((c) => {
    const name = (c.name || "").toLowerCase();
    const phone = (c.phone || "").toLowerCase();
    return !q || name.includes(q) || phone.includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9">Aucun client</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((c) => {
      const sales = CACHE.tx.filter((t) => t.clientId === c.id);
      const count = sales.length;
      const total = sales.reduce((s, t) => s + Number(t.sellPrice || 0), 0);

      return `
        <tr>
          <td>${c.name || "-"}</td>
          <td>${c.phone || "-"}</td>
          <td>${yesNoBadge(c.license)}</td>
          <td>${checkIcon(c.car)}</td>
          <td>${checkIcon(c.moto)}</td>
          <td>${checkIcon(c.truck)}</td>
          <td>${count}</td>
          <td>${money(total)}</td>
          <td style="text-align: right;">
            <button class="btn btn-gold btn-sm" data-open="${c.id}">Voir</button>
            <button class="btn btn-outline btn-sm" data-edit="${c.id}">Modifier</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openClient(btn.getAttribute("data-open")));
  });

  tbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEditClient(btn.getAttribute("data-edit")));
  });
}

function openClient(clientId) {
  const c = CACHE.clients.find((x) => x.id === clientId);
  if (!c) return;

  const sales = CACHE.tx
    .filter((t) => t.clientId === clientId)
    .map((t) => {
      const buy = Number(t.buyPrice || 0);
      const sell = Number(t.sellPrice || 0);
      const profit = sell - buy;
      const dt = toDateSafe(t.createdAt);
      return {
        model: t.model || "-",
        buy,
        sell,
        profit,
        date: dt ? dt.toLocaleDateString("fr-FR") : "-",
      };
    });

  const totalSpent = sales.reduce((s, x) => s + x.sell, 0);
  const totalProfit = sales.reduce((s, x) => s + x.profit, 0);

  mTitle.textContent = c.name || "Client";
  mTotal.textContent = money(totalSpent);
  mProfit.textContent = money(totalProfit);
  mCount.textContent = String(sales.length);

  if (sales.length === 0) {
    mSales.innerHTML = `<tr><td colspan="5">Aucun achat</td></tr>`;
  } else {
    mSales.innerHTML = sales
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map(
        (s) => `
        <tr>
          <td>${s.date}</td>
          <td>${s.model}</td>
          <td>${money(s.buy)}</td>
          <td>${money(s.sell)}</td>
          <td>${money(s.profit)}</td>
        </tr>
      `
      )
      .join("");
  }

  modal.classList.remove("hidden");
}

function closeClientModal() {
  modal.classList.add("hidden");
}

if (closeModal) closeModal.addEventListener("click", closeClientModal);
if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeClientModal(); });

if (search) search.addEventListener("input", render);

/* ---------- AJOUT CLIENT ---------- */

function showErr(msg) {
  if (!cError) return;
  cError.textContent = msg;
  cError.style.display = msg ? "block" : "none";
}

function resetAddForm() {
  if (cName) cName.value = "";
  if (cPhone) cPhone.value = "";
  if (cLicense) cLicense.value = "Oui";
  if (cCar) cCar.checked = false;
  if (cMoto) cMoto.checked = false;
  if (cTruck) cTruck.checked = false;
  showErr("");
}

function openAddClient() {
  resetAddForm();
  addClientModal?.classList.remove("hidden");
  setTimeout(() => cName?.focus(), 50);
}

function closeAddClient() {
  addClientModal?.classList.add("hidden");
}

if (addClientBtn) addClientBtn.addEventListener("click", openAddClient);
if (addClientClose) addClientClose.addEventListener("click", closeAddClient);
if (cCancel) cCancel.addEventListener("click", closeAddClient);
if (addClientModal) {
  addClientModal.addEventListener("click", (e) => {
    if (e.target === addClientModal) closeAddClient();
  });
}

if (cSave) {
  cSave.addEventListener("click", async () => {
    try {
      showErr("");

      const name = (cName?.value || "").trim();
      const phone = (cPhone?.value || "").trim();

      if (!name) {
        showErr("Le nom est obligatoire.");
        return;
      }

      cSave.disabled = true;
      cSave.textContent = "Enregistrement...";

      await addDoc(collection(db, "clients"), {
        name,
        phone,
        license: cLicense?.value || "Oui",
        car: !!cCar?.checked,
        moto: !!cMoto?.checked,
        truck: !!cTruck?.checked,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAction("CLIENT_AJOUT", `Ajout client: ${name}`);

      closeAddClient();
      await load();
    } catch (e) {
      console.error(e);
      showErr("Erreur lors de l'ajout (voir console).");
    } finally {
      if (cSave) {
        cSave.disabled = false;
        cSave.textContent = "Enregistrer";
      }
    }
  });
}

/* ---------- MODIFICATION CLIENT ---------- */

function showEditErr(msg) {
  if (!editCError) return;
  editCError.textContent = msg;
  editCError.style.display = msg ? "block" : "none";
}

function openEditClient(id) {
  const c = CACHE.clients.find(x => x.id === id);
  if (!c) return;

  editClientId.value = id;
  editCName.value = c.name || "";
  editCPhone.value = c.phone || "";
  editCLicense.value = c.license === false ? "Non" : "Oui";
  editCCar.checked = !!c.car;
  editCMoto.checked = !!c.moto;
  editCTruck.checked = !!c.truck;

  showEditErr("");
  editClientModal.classList.remove("hidden");
}

function closeEditClient() {
  editClientModal.classList.add("hidden");
}

if (editClientClose) editClientClose.addEventListener("click", closeEditClient);
if (editCCancel) editCCancel.addEventListener("click", closeEditClient);
if (editClientModal) {
  editClientModal.addEventListener("click", (e) => {
    if (e.target === editClientModal) closeEditClient();
  });
}

if (editCSave) {
  editCSave.addEventListener("click", async () => {
    try {
      showEditErr("");
      const id = editClientId.value;
      const name = editCName.value.trim();
      const phone = editCPhone.value.trim();

      if (!name) {
        showEditErr("Le nom est obligatoire.");
        return;
      }

      editCSave.disabled = true;
      editCSave.textContent = "Mise à jour...";

      await updateDoc(doc(db, "clients", id), {
        name,
        phone,
        license: editCLicense.value,
        car: !!editCCar.checked,
        moto: !!editCMoto.checked,
        truck: !!editCTruck.checked,
        updatedAt: serverTimestamp(),
      });
      await logAction("CLIENT_MODIF", `Modif client ${id}: ${name}`);

      closeEditClient();
      await load();
    } catch (e) {
      console.error(e);
      showEditErr("Erreur lors de la modification.");
    } finally {
      if (editCSave) {
        editCSave.disabled = false;
        editCSave.textContent = "Mettre à jour";
      }
    }
  });
}

load();
