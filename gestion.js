import { auth, db } from "./config.js";
import { requireRole } from "./guard.js";
import { $, escapeHtml, normRole, toBool } from "./common.js";

import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------------------
   DOM
--------------------------- */
const searchInput = $("#searchInput");
const refreshBtn = $("#refreshBtn");
const openCreateBtn = $("#openCreateBtn");
const logoutBtn = $("#logoutBtn");

const statTotal = $("#statTotal");
const statAdmins = $("#statAdmins");
const statStaff = $("#statStaff");

const usersTbody = $("#usersTbody");

// modal
const backdrop = $("#userModalBackdrop");
const modalTitle = $("#modalTitle");
const closeModalBtn = $("#closeModalBtn");
const cancelBtn = $("#cancelBtn");
const saveBtn = $("#saveBtn");

const f_uid = $("#f_uid");
const f_email = $("#f_email");
const f_name = $("#f_name");
const f_role = $("#f_role");
const f_active = $("#f_active");

/* ---------------------------
   State
--------------------------- */
let allUsers = []; // cached list
let editingUid = null;

/* ---------------------------
   Helpers
--------------------------- */
function showModal() {
  backdrop.classList.add("show");
}
function hideModal() {
  backdrop.classList.remove("show");
}
function setLoadingRow(msg = "CHARGEMENT...") {
  usersTbody.innerHTML = `<tr><td colspan="6" style="opacity:.7;">${escapeHtml(msg)}</td></tr>`;
}

function computeStats(list) {
  const total = list.length;
  const admins = list.filter(u => normRole(u.role) === "admin").length;
  const staff = total - admins;

  statTotal.textContent = String(total);
  statAdmins.textContent = String(admins);
  statStaff.textContent = String(staff);
}

function render(list) {
  computeStats(list);

  if (!list.length) {
    usersTbody.innerHTML = `<tr><td colspan="6" style="opacity:.7;">AUCUN UTILISATEUR.</td></tr>`;
    return;
  }

  usersTbody.innerHTML = list.map(u => {
    const active = toBool(u.active, true);
    const badge = active
      ? `<span class="badge green">● ACTIF</span>`
      : `<span class="badge red">● INACTIF</span>`;

    const role = normRole(u.role).toUpperCase();
    return `
      <tr data-uid="${escapeHtml(u.uid)}">
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(role)}</td>
        <td>${badge}</td>
        <td style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; opacity:.9;">
          ${escapeHtml(u.uid)}
        </td>
        <td>
          <div class="row-actions">
            <button class="btn btn-muted js-toggle">${active ? "Désactiver" : "Activer"}</button>
            <button class="btn btn-gold js-edit">Modifier</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // bind buttons
  usersTbody.querySelectorAll("tr").forEach(tr => {
    const uid = tr.getAttribute("data-uid");
    tr.querySelector(".js-edit")?.addEventListener("click", () => openEdit(uid));
    tr.querySelector(".js-toggle")?.addEventListener("click", () => toggleActive(uid));
  });
}

function applyFilter() {
  const q = (searchInput.value || "").trim().toLowerCase();
  if (!q) return render(allUsers);

  const filtered = allUsers.filter(u => {
    return (
      String(u.uid || "").toLowerCase().includes(q) ||
      String(u.email || "").toLowerCase().includes(q) ||
      String(u.name || "").toLowerCase().includes(q) ||
      String(u.role || "").toLowerCase().includes(q)
    );
  });
  render(filtered);
}

/* ---------------------------
   Firestore
--------------------------- */
async function fetchUsers() {
  setLoadingRow("CHARGEMENT...");
  try {
    // (Optionnel) garde si tu utilises guard.js
    await requireRole("admin");

    const q = query(collection(db, "users"), orderBy("updatedAt", "desc"), limit(500));
    const snap = await getDocs(q);

    allUsers = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        uid: d.id,
        email: data.email || "",
        name: data.name || "",
        role: data.role || "staff",
        active: toBool(data.active, true),
        updatedAt: data.updatedAt || null,
      };
    });

    applyFilter();
  } catch (e) {
    console.error(e);
    setLoadingRow("Erreur de chargement (vérifie tes règles Firestore).");
    // on garde l'UI stable
    statTotal.textContent = "0";
    statAdmins.textContent = "0";
    statStaff.textContent = "0";
  }
}

async function openEdit(uid) {
  const u = allUsers.find(x => x.uid === uid);
  if (!u) return;

  editingUid = uid;
  modalTitle.textContent = "Modifier un utilisateur";

  f_uid.value = u.uid;
  f_uid.disabled = true;

  f_email.value = u.email || "";
  f_name.value = u.name || "";
  f_role.value = normRole(u.role);
  f_active.checked = toBool(u.active, true);

  showModal();
}

function openCreate() {
  editingUid = null;
  modalTitle.textContent = "Créer / Ajouter un utilisateur (Firestore)";

  f_uid.value = "";
  f_uid.disabled = false;

  f_email.value = "";
  f_name.value = "";
  f_role.value = "staff";
  f_active.checked = true;

  showModal();
}

async function saveUser() {
  const uid = (f_uid.value || "").trim();
  if (!uid) {
    alert("UID requis.");
    return;
  }

  const payload = {
    email: (f_email.value || "").trim() || "",
    name: (f_name.value || "").trim() || "",
    role: normRole(f_role.value),
    active: !!f_active.checked,
    updatedAt: serverTimestamp(),
  };

  try {
    await requireRole("admin");
    await setDoc(doc(db, "users", uid), payload, { merge: true });
    hideModal();
    await fetchUsers();
  } catch (e) {
    console.error(e);
    alert("Erreur enregistrement (vérifie règles Firestore).");
  }
}

async function toggleActive(uid) {
  const u = allUsers.find(x => x.uid === uid);
  if (!u) return;

  try {
    await requireRole("admin");
    await updateDoc(doc(db, "users", uid), {
      active: !toBool(u.active, true),
      updatedAt: serverTimestamp(),
    });
    await fetchUsers();
  } catch (e) {
    console.error(e);
    alert("Impossible de modifier (vérifie règles Firestore).");
  }
}

/* ---------------------------
   Auth + boot
--------------------------- */
logoutBtn?.addEventListener("click", async () => {
  try { await signOut(auth); } catch {}
  window.location.href = "index.html";
});

refreshBtn?.addEventListener("click", fetchUsers);
openCreateBtn?.addEventListener("click", openCreate);

searchInput?.addEventListener("input", applyFilter);

closeModalBtn?.addEventListener("click", hideModal);
cancelBtn?.addEventListener("click", hideModal);
backdrop?.addEventListener("click", (e) => {
  if (e.target === backdrop) hideModal();
});
saveBtn?.addEventListener("click", saveUser);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // Vérif admin via Firestore (simple & fiable)
  try {
    const me = await getDoc(doc(db, "users", user.uid));
    const role = normRole(me.exists() ? me.data()?.role : "staff");
    if (role !== "admin") {
      alert("Accès refusé (admin requis).");
      window.location.href = "dashboard.html";
      return;
    }
  } catch (e) {
    console.error(e);
    // Si la règle Firestore bloque, tu verras ici
    alert("Impossible de vérifier le rôle (règles Firestore ?).");
    window.location.href = "dashboard.html";
    return;
  }

  await fetchUsers();
});
