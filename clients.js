import { db, auth } from "./config.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const tbody = document.getElementById("clientsTable");
const search = document.getElementById("search");

// Fiche client (existant)
const modal = document.getElementById("clientModal");
const closeModal = document.getElementById("closeModal");

const mTitle = document.getElementById("mTitle");
const mTotal = document.getElementById("mTotal");
const mProfit = document.getElementById("mProfit");
const mCount = document.getElementById("mCount");
const mSales = document.getElementById("mSales");

// Ajout client (nouveau)
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
          <td><button class="btn btn-gold" data-open="${c.id}">Voir</button></td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openClient(btn.getAttribute("data-open")));
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
        license: cLicense?.value || "Oui", // "Oui"/"Non" comme ton affichage
        car: !!cCar?.checked,
        moto: !!cMoto?.checked,
        truck: !!cTruck?.checked,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

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

load();
