import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";
import { esc, renderUserBadge } from "./common.js";

const tbody = document.getElementById("clientsTable");
const search = document.getElementById("search");
const modal = document.getElementById("clientModal");
const closeModal = document.getElementById("closeModal");
const mTitle = document.getElementById("mTitle");
const mTotal = document.getElementById("mTotal");
const mProfit = document.getElementById("mProfit");
const mCount = document.getElementById("mCount");
const mSales = document.getElementById("mSales");

const addClientBtn = document.getElementById("addClientBtn");
const upsertClientModal = document.getElementById("upsertClientModal");
const upsertClose = document.getElementById("upsertClose");
const upsertTitle = document.getElementById("upsertTitle");

const fClientId = document.getElementById("fClientId");
const fCName = document.getElementById("fCName");
const fCPhone = document.getElementById("fCPhone");
const fCLicense = document.getElementById("fCLicense");
const fCCar = document.getElementById("fCCar");
const fCMoto = document.getElementById("fCMoto");
const fCTruck = document.getElementById("fCTruck");
const upsertSave = document.getElementById("upsertSave");
const upsertCancel = document.getElementById("upsertCancel");
const upsertError = document.getElementById("upsertError");

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
  try { if (ts?.toDate) return ts.toDate(); } catch (e) {}
  return null;
}

let CACHE = { clients: [], tx: [] };

async function loadData() {
  tbody.innerHTML = `<tr><td colspan="9">Chargement...</td></tr>`;
  try {
    const [clientsSnap, txSnap] = await Promise.all([
      getDocs(collection(db, "clients")),
      getDocs(collection(db, "transactions")),
    ]);
    const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const tx = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    CACHE = { clients, tx };
    render();
  } catch(e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="9" class="red">Erreur de chargement.</td></tr>`;
  }
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
          <td>${esc(c.name || "-")}</td>
          <td>${esc(c.phone || "-")}</td>
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
    btn.addEventListener("click", () => openUpsert(btn.getAttribute("data-edit")));
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
      .map((s) => `
        <tr>
          <td>${esc(s.date)}</td>
          <td>${esc(s.model)}</td>
          <td>${money(s.buy)}</td>
          <td>${money(s.sell)}</td>
          <td>${money(s.profit)}</td>
        </tr>
      `).join("");
  }
  modal.classList.remove("hidden");
}

function closeClientModal() { modal.classList.add("hidden"); }
if (closeModal) closeModal.addEventListener("click", closeClientModal);
if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeClientModal(); });
if (search) search.addEventListener("input", render);

function showUpsertErr(msg) {
  if (!upsertError) return;
  upsertError.textContent = msg;
  upsertError.style.display = msg ? "block" : "none";
}

function openUpsert(id = null) {
  showUpsertErr("");
  if (id) {
    const c = CACHE.clients.find(x => x.id === id);
    if (!c) return;
    upsertTitle.textContent = "Modifier le client";
    fClientId.value = id;
    fCName.value = c.name || "";
    fCPhone.value = c.phone || "";
    fCLicense.value = c.license === "Non" || c.license === false ? "Non" : "Oui";
    fCCar.checked = !!c.car;
    fCMoto.checked = !!c.moto;
    fCTruck.checked = !!c.truck;
    upsertSave.textContent = "Mettre à jour";
  } else {
    upsertTitle.textContent = "Ajouter un client";
    fClientId.value = "";
    fCName.value = "";
    fCPhone.value = "";
    fCLicense.value = "Oui";
    fCCar.checked = false;
    fCMoto.checked = false;
    fCTruck.checked = false;
    upsertSave.textContent = "Enregistrer";
  }
  upsertClientModal.classList.remove("hidden");
}

function closeUpsert() { upsertClientModal.classList.add("hidden"); }

if (addClientBtn) addClientBtn.addEventListener("click", () => openUpsert());
if (upsertClose) upsertClose.addEventListener("click", closeUpsert);
if (upsertCancel) upsertCancel.addEventListener("click", closeUpsert);
if (upsertClientModal) upsertClientModal.addEventListener("click", (e) => { if (e.target === upsertClientModal) closeUpsert(); });

if (upsertSave) {
  upsertSave.addEventListener("click", async () => {
    try {
      showUpsertErr("");
      const id = fClientId.value;
      const name = fCName.value.trim();
      const phone = fCPhone.value.trim();
      if (!name) { showUpsertErr("Le nom est obligatoire."); return; }

      // Check for at least one uppercase letter
      if (!/[A-Z]/.test(name)) {
        showUpsertErr("Le nom et prénom doit contenir au moins une majuscule.");
        return;
      }

      upsertSave.disabled = true;
      const payload = {
        name, phone,
        license: fCLicense.value,
        car: !!fCCar.checked,
        moto: !!fCMoto.checked,
        truck: !!fCTruck.checked,
        updatedAt: serverTimestamp()
      };

      if (id) {
        await updateDoc(doc(db, "clients", id), payload);
        await logAction("CLIENT_MODIF", `Modif client ${id}: ${name}`);
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "clients"), payload);
        await logAction("CLIENT_AJOUT", `Ajout client: ${name}`);
      }
      closeUpsert();
      await loadData();
    } catch (e) { console.error(e); showUpsertErr("Erreur lors de l'enregistrement."); }
    finally { if (upsertSave) upsertSave.disabled = false; }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) renderUserBadge(snap.data());
  loadData();
});
