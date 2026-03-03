// gestion.js — page Gestion (ESM)
import { auth, db } from "./config.js";
import {
  $,
  escapeHtml,
  toast,
} from "./common.js";

import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/* --------------------------- DOM --------------------------- */
const els = {
  authInfoBar: $("authInfoBar"),
  authInfo: $("authInfo"),
  btnLogout: $("btnLogout"),

  filterInput: $("filterInput"),
  btnFilter: $("btnFilter"),
  btnRefresh: $("btnRefresh"),
  btnCreate: $("btnCreate"),

  statTotalUsers: $("statTotalUsers"),
  statAdmins: $("statAdmins"),
  statStaff: $("statStaff"),

  usersTbody: $("usersTbody"),

  userModal: $("userModal"),
  closeUserModal: $("closeUserModal"),
  cancelUser: $("cancelUser"),
  saveUser: $("saveUser"),

  userForm: $("userForm"),
  userUid: $("userUid"),
  userEmail: $("userEmail"),
  userName: $("userName"),
  userRole: $("userRole"),
  userActive: $("userActive"),
};

/* --------------------------- State --------------------------- */
let allUsers = [];     // raw list
let currentFilter = ""; // lowercased
let isReady = false;

/* --------------------------- Helpers --------------------------- */
function norm(v) {
  return String(v ?? "").trim();
}

function openModal() {
  els.userModal.classList.add("open");
}

function closeModal() {
  els.userModal.classList.remove("open");
}

function clearForm() {
  els.userUid.value = "";
  els.userEmail.value = "";
  els.userName.value = "";
  els.userRole.value = "staff";
  els.userActive.checked = true;
}

function fillForm(u) {
  els.userUid.value = u.uid || "";
  els.userEmail.value = u.email || "";
  els.userName.value = u.name || "";
  els.userRole.value = (u.role || "staff").toLowerCase() === "admin" ? "admin" : "staff";
  els.userActive.checked = u.active !== false;
}

function userMatchesFilter(u, f) {
  if (!f) return true;
  const hay = [
    u.uid,
    u.email,
    u.name,
    u.role,
  ].map(v => String(v ?? "").toLowerCase()).join(" | ");
  return hay.includes(f);
}

function setStats() {
  const total = allUsers.length;
  const admins = allUsers.filter(u => String(u.role || "").toLowerCase() === "admin").length;
  const staff = total - admins;

  els.statTotalUsers.textContent = String(total);
  els.statAdmins.textContent = String(admins);
  els.statStaff.textContent = String(staff);
}

function badgeRole(role) {
  const r = String(role || "staff").toLowerCase() === "admin" ? "ADMIN" : "STAFF";
  return `<span class="badge-role">${escapeHtml(r)}</span>`;
}

function badgeStatus(active) {
  const ok = active !== false;
  return `<span class="badge ${ok ? "badge-ok" : "badge-bad"}">${ok ? "● ACTIF" : "● INACTIF"}</span>`;
}

function renderTable() {
  const f = currentFilter;

  const list = allUsers
    .filter(u => userMatchesFilter(u, f))
    // Admins first, then name
    .sort((a, b) => {
      const ra = String(a.role || "").toLowerCase() === "admin" ? 0 : 1;
      const rb = String(b.role || "").toLowerCase() === "admin" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" });
    });

  if (!list.length) {
    els.usersTbody.innerHTML = `<tr><td colspan="6" class="muted">Aucun utilisateur.</td></tr>`;
    return;
  }

  els.usersTbody.innerHTML = list.map(u => {
    const email = u.email ? escapeHtml(u.email) : "—";
    const name = u.name ? escapeHtml(u.name) : "—";
    const uid = u.uid ? escapeHtml(u.uid) : "—";
    const active = u.active !== false;

    const btnToggleLabel = active ? "Désactiver" : "Activer";
    const btnToggleClass = active ? "btn-danger" : "btn-secondary";

    return `
      <tr>
        <td class="mono">${email}</td>
        <td>${name}</td>
        <td>${badgeRole(u.role)}</td>
        <td>${badgeStatus(u.active)}</td>
        <td class="mono">${uid}</td>
        <td class="actions">
          <button class="btn ${btnToggleClass}" data-action="toggle" data-uid="${uid}">
            ${escapeHtml(btnToggleLabel)}
          </button>
          <button class="btn btn-secondary" data-action="edit" data-uid="${uid}">
            Modifier
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/* --------------------------- Firestore --------------------------- */
async function fetchUsers() {
  // users collection
  const ref = collection(db, "users");
  const qy = query(ref, orderBy("updatedAt", "desc"));

  const snap = await getDocs(qy);
  allUsers = snap.docs.map(d => {
    const data = d.data() || {};
    return {
      uid: d.id,
      email: data.email ?? "",
      name: data.name ?? "",
      role: data.role ?? "staff",
      active: data.active !== false,
      updatedAt: data.updatedAt ?? null,
    };
  });

  setStats();
  renderTable();
}

async function toggleUser(uid) {
  const cleanUid = norm(uid);
  if (!cleanUid) return;

  const ref = doc(db, "users", cleanUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    toast("Utilisateur introuvable dans Firestore.", "err");
    return;
  }
  const data = snap.data() || {};
  const nowActive = !(data.active !== false);

  await updateDoc(ref, {
    active: !nowActive,
    updatedAt: serverTimestamp(),
  });

  toast(!nowActive ? "Utilisateur activé." : "Utilisateur désactivé.", "ok");
  await fetchUsers();
}

async function saveUserFromForm() {
  const uid = norm(els.userUid.value);
  if (!uid) {
    toast("UID requis (ID du document users/{uid}).", "warn");
    return;
  }

  const payload = {
    email: norm(els.userEmail.value) || "",
    name: norm(els.userName.value) || "",
    role: (norm(els.userRole.value).toLowerCase() === "admin") ? "admin" : "staff",
    active: !!els.userActive.checked,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "users", uid), payload, { merge: true });
  toast("Utilisateur mis à jour.", "ok");

  closeModal();
  await fetchUsers();
}

async function getCurrentUserRole(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return "staff";
  const role = snap.data()?.role || "staff";
  return String(role).toLowerCase();
}

/* --------------------------- Auth / Guard --------------------------- */
function redirectToLogin() {
  // adapte si ton login est ailleurs
  window.location.href = "index.html";
}

function setAuthInfo(user) {
  els.authInfo.textContent = user?.email || user?.uid || "Connecté";
}

async function ensureAdmin(user) {
  const role = await getCurrentUserRole(user.uid);
  if (role !== "admin") {
    alert("Accès refusé (admin requis).");
    redirectToLogin();
    return false;
  }
  return true;
}

/* --------------------------- Events --------------------------- */
function bindEvents() {
  // logout
  els.btnLogout?.addEventListener("click", async () => {
    await signOut(auth);
    redirectToLogin();
  });

  // filter
  els.btnFilter?.addEventListener("click", () => {
    currentFilter = norm(els.filterInput.value).toLowerCase();
    renderTable();
  });
  els.filterInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      currentFilter = norm(els.filterInput.value).toLowerCase();
      renderTable();
    }
  });

  // refresh
  els.btnRefresh?.addEventListener("click", async () => {
    await fetchUsers();
    toast("Rafraîchi.", "ok");
  });

  // create (firestore doc only)
  els.btnCreate?.addEventListener("click", () => {
    clearForm();
    openModal();
    toast("⚠️ Crée d'abord le compte dans Firebase Console → Auth, puis complète users/{uid}.", "warn", 4200);
  });

  // modal close
  els.closeUserModal?.addEventListener("click", closeModal);
  els.cancelUser?.addEventListener("click", closeModal);
  els.userModal?.addEventListener("click", (e) => {
    if (e.target === els.userModal) closeModal();
  });

  // save
  els.userForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveUserFromForm();
  });

  // actions table (delegate)
  els.usersTbody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const uid = btn.getAttribute("data-uid");

    if (!uid || uid === "—") return;

    if (action === "toggle") {
      await toggleUser(uid);
      return;
    }

    if (action === "edit") {
      const u = allUsers.find(x => x.uid === uid);
      if (!u) {
        toast("Impossible de trouver l'utilisateur.", "err");
        return;
      }
      fillForm(u);
      openModal();
      return;
    }
  });
}

/* --------------------------- Init --------------------------- */
async function boot() {
  if (isReady) return;
  isReady = true;

  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirectToLogin();
      return;
    }

    setAuthInfo(user);

    const ok = await ensureAdmin(user);
    if (!ok) return;

    await fetchUsers();
  });
}

boot().catch((err) => {
  console.error(err);
  toast("Erreur init Gestion (console).", "err");
});
