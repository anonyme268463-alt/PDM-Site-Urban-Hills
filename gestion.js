/* gestion.js — PDM Admin (Firestore: users)
   Compatible avec ton gestion.html (ids: usersTbody, searchInput, refreshBtn, createBtn, createDialog, etc.)
*/

import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Optionnel: si tu as déjà guard/common dans ton repo, on les utilise sans casser si absent.
let requireAdmin = null;
let setActiveNav = null;

try {
  const guard = await import("./guard.js");
  if (typeof guard.requireAdmin === "function") requireAdmin = guard.requireAdmin;
} catch (_) {}

try {
  const common = await import("./common.js");
  if (typeof common.setActiveNav === "function") setActiveNav = common.setActiveNav;
} catch (_) {}

/* ------------------ DOM ------------------ */
const el = (id) => document.getElementById(id);

const usersTbody = el("usersTbody");
const searchInput = el("searchInput");
const refreshBtn = el("refreshBtn");
const logoutBtn = el("logoutBtn");

const statTotal = el("statTotal");
const statAdmins = el("statAdmins");
const statStaff = el("statStaff");
const statusPill = el("statusPill");

const createBtn = el("createBtn");
const createDialog = el("createDialog");
const dClose = el("dClose");
const dCancel = el("dCancel");
const dCreate = el("dCreate");
const dEmail = el("dEmail");
const dName = el("dName");
const dPassword = el("dPassword");
const dRole = el("dRole");

/* ------------------ State ------------------ */
let allUsers = []; // { id, email, name, role, active, updatedAt }

/* ------------------ Utils ------------------ */
function safeText(v) {
  return (v ?? "").toString();
}
function norm(s) {
  return safeText(s).trim().toLowerCase();
}
function roleLabel(role) {
  const r = norm(role);
  if (r === "admin") return "ADMIN";
  return "STAFF";
}
function pill(status) {
  // statusPill dans ton HTML est juste un indicateur global
  if (!statusPill) return;
  statusPill.textContent = status;
}

function renderStats(list) {
  const total = list.length;
  const admins = list.filter((u) => norm(u.role) === "admin").length;
  const staff = total - admins;

  if (statTotal) statTotal.textContent = String(total);
  if (statAdmins) statAdmins.textContent = String(admins);
  if (statStaff) statStaff.textContent = String(staff);
}

function rowHTML(u) {
  const email = u.email ? safeText(u.email) : "—";
  const name = u.name ? safeText(u.name) : "—";
  const role = roleLabel(u.role);
  const active = u.active !== false; // default true
  const status = active ? "● ACTIF" : "● INACTIF";

  return `
    <tr>
      <td>${escapeHtml(email)}</td>
      <td>${escapeHtml(name)}</td>
      <td><span class="badge">${escapeHtml(role)}</span></td>
      <td>
        <span class="pill ${active ? "ok" : "ko"}">${escapeHtml(status)}</span>
      </td>
      <td class="mono">${escapeHtml(u.id)}</td>
      <td class="actions">
        <button class="btn small" data-action="toggle" data-id="${escapeHtml(u.id)}">
          ${active ? "Désactiver" : "Activer"}
        </button>
        <button class="btn small primary" data-action="edit" data-id="${escapeHtml(u.id)}">
          Modifier
        </button>
      </td>
    </tr>
  `;
}

function escapeHtml(str) {
  return safeText(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ------------------ Firestore ------------------ */
async function fetchUsers() {
  pill("Chargement…");
  if (usersTbody) usersTbody.innerHTML = `<tr><td colspan="6">Chargement…</td></tr>`;

  const q = query(collection(db, "users"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);

  const list = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    list.push({
      id: d.id,
      email: data.email ?? null,
      name: data.name ?? null,
      role: data.role ?? "staff",
      active: data.active !== false,
      updatedAt: data.updatedAt ?? null,
    });
  });

  allUsers = list;
  pill("OK");
  applyFilterAndRender();
}

function applyFilterAndRender() {
  const q = norm(searchInput?.value);
  let list = allUsers;

  if (q) {
    list = allUsers.filter((u) => {
      const hay = [
        u.id,
        u.email,
        u.name,
        u.role,
        u.active ? "actif" : "inactif",
      ]
        .map(norm)
        .join(" | ");
      return hay.includes(q);
    });
  }

  renderStats(list);

  if (!usersTbody) return;
  if (list.length === 0) {
    usersTbody.innerHTML = `<tr><td colspan="6">Aucun utilisateur.</td></tr>`;
    return;
  }

  usersTbody.innerHTML = list.map(rowHTML).join("");
}

async function toggleActive(uid) {
  const u = allUsers.find((x) => x.id === uid);
  if (!u) return;

  const next = !(u.active !== false);
  await updateDoc(doc(db, "users", uid), {
    active: next,
    updatedAt: serverTimestamp(),
  });

  // Optimistic update
  u.active = next;
  applyFilterAndRender();
}

async function editUser(uid) {
  const u = allUsers.find((x) => x.id === uid);
  if (!u) return;

  const nextName = prompt("Nom (ex: PDG - Hundo) :", u.name ?? "");
  if (nextName === null) return;

  const nextRoleRaw = prompt('Rôle ("admin" ou "staff") :', u.role ?? "staff");
  if (nextRoleRaw === null) return;

  const nextRole = norm(nextRoleRaw) === "admin" ? "admin" : "staff";

  await updateDoc(doc(db, "users", uid), {
    name: nextName.trim(),
    role: nextRole,
    updatedAt: serverTimestamp(),
  });

  u.name = nextName.trim();
  u.role = nextRole;
  applyFilterAndRender();
}

/* ------------------ Create user (info only) ------------------ */
function openCreateDialog() {
  if (!createDialog) {
    alert(
      "Créer un utilisateur: fais-le dans Firebase Console > Auth, puis ajoute/édite sa fiche dans Firestore (collection users/{uid})."
    );
    return;
  }
  // reset
  if (dEmail) dEmail.value = "";
  if (dName) dName.value = "";
  if (dPassword) dPassword.value = "";
  if (dRole) dRole.value = "staff";
  createDialog.showModal();
}

function closeCreateDialog() {
  try {
    createDialog?.close();
  } catch (_) {}
}

function explainCreateLimitation() {
  alert(
    "⚠️ Création d'un compte Auth depuis le site : impossible sans Cloud Functions déployées.\n\n" +
      "✅ Fais plutôt :\n" +
      "1) Firebase Console → Authentication → Ajouter un utilisateur\n" +
      "2) Récupère son UID\n" +
      "3) Firestore → collection users → doc {UID} avec :\n" +
      "   { active:true, name:'...', role:'staff' }\n\n" +
      "Ensuite tu reviens ici et tu peux Modifier / Activer / Désactiver."
  );
}

/* ------------------ Events ------------------ */
function bindEvents() {
  refreshBtn?.addEventListener("click", fetchUsers);
  searchInput?.addEventListener("input", applyFilterAndRender);

  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "./index.html";
  });

  createBtn?.addEventListener("click", openCreateDialog);
  dClose?.addEventListener("click", closeCreateDialog);
  dCancel?.addEventListener("click", closeCreateDialog);
  dCreate?.addEventListener("click", (e) => {
    e.preventDefault();
    closeCreateDialog();
    explainCreateLimitation();
  });

  // Delegation actions table
  usersTbody?.addEventListener("click", async (e) => {
    const btn = e.target?.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!id) return;

    try {
      if (action === "toggle") await toggleActive(id);
      if (action === "edit") await editUser(id);
    } catch (err) {
      console.error(err);
      alert("Erreur: " + (err?.message || err));
    }
  });
}

/* ------------------ Init ------------------ */
async function init() {
  setActiveNav?.("gestion"); // si tu l'as dans common.js

  // Auth / Guard
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "./index.html";
      return;
    }

    try {
      // Si tu as un guard admin, on l'utilise.
      if (requireAdmin) await requireAdmin();
      await fetchUsers();
    } catch (err) {
      console.error(err);
      alert("Accès refusé (admin requis).");
      window.location.href = "./dashboard.html";
    }
  });

  bindEvents();
}

init();
