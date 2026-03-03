// gestion.js (module)
import { auth, db } from "./config.js";
import { $, escapeHtml, badge } from "./common.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const els = {
  currentUserEmail: $("#currentUserEmail"),
  btnLogout: $("#btnLogout"),
  btnRefresh: $("#btnRefresh"),
  btnOpenCreate: $("#btnOpenCreate"),
  statTotal: $("#statTotal"),
  statAdmins: $("#statAdmins"),
  statStaff: $("#statStaff"),
  tbodyUsers: $("#tbodyUsers"),
  search: $("#search"),

  // modal
  modalBackdrop: $("#modalBackdrop"),
  modalTitle: $("#modalTitle"),
  modalClose: $("#modalClose"),
  modalCancel: $("#modalCancel"),
  modalSave: $("#modalSave"),
  mUid: $("#mUid"),
  mEmail: $("#mEmail"),
  mName: $("#mName"),
  mRole: $("#mRole"),
  mActive: $("#mActive"),
};

let me = null;
let allUsers = [];
let modalMode = "create"; // "create" | "edit"
let modalEditingUid = null;

function openModal(mode, user = null) {
  modalMode = mode;
  modalEditingUid = user?.uid || null;

  els.modalTitle.textContent = mode === "create" ? "Créer / lier un utilisateur" : "Modifier l’utilisateur";
  els.modalBackdrop.classList.add("open");
  els.modalBackdrop.setAttribute("aria-hidden", "false");

  els.mUid.value = user?.uid || "";
  els.mEmail.value = user?.email || "";
  els.mName.value = user?.name || "";
  els.mRole.value = (user?.role || "staff").toLowerCase() === "admin" ? "admin" : "staff";
  els.mActive.checked = user?.active !== false; // default true

  // uid readonly en edit (pour éviter de casser la clé doc)
  els.mUid.readOnly = mode === "edit";
}

function closeModal() {
  els.modalBackdrop.classList.remove("open");
  els.modalBackdrop.setAttribute("aria-hidden", "true");
  els.mUid.readOnly = false;
  modalEditingUid = null;
}

function normalizeRole(role) {
  const r = String(role || "").toLowerCase().trim();
  return r === "admin" ? "admin" : "staff";
}

async function requireAdmin(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  const role = snap.exists() ? normalizeRole(snap.data()?.role) : "staff";
  return role === "admin";
}

function renderStats(list) {
  const total = list.length;
  const admins = list.filter(u => normalizeRole(u.role) === "admin").length;
  const staff = total - admins;

  els.statTotal.textContent = String(total);
  els.statAdmins.textContent = String(admins);
  els.statStaff.textContent = String(staff);
}

function rowHtml(u) {
  const role = normalizeRole(u.role);
  const isActive = u.active !== false;

  const roleBadge = badge(role.toUpperCase(), role === "admin" ? "ok" : "neutral");
  const statusBadge = badge(isActive ? "• ACTIF" : "• INACTIF", isActive ? "ok" : "danger");

  return `
    <tr>
      <td>${escapeHtml(u.email || "—")}</td>
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${roleBadge}</td>
      <td>${statusBadge}</td>
      <td class="mono">${escapeHtml(u.uid || "—")}</td>
      <td class="right">
        <button class="btn btn-sm" data-action="toggle" data-uid="${escapeHtml(u.uid)}">
          ${isActive ? "Désactiver" : "Activer"}
        </button>
        <button class="btn btn-sm" data-action="edit" data-uid="${escapeHtml(u.uid)}">Modifier</button>
      </td>
    </tr>
  `;
}

function renderTable(list) {
  if (!list.length) {
    els.tbodyUsers.innerHTML = `<tr><td colspan="6" class="muted">AUCUN UTILISATEUR.</td></tr>`;
    renderStats(list);
    return;
  }
  els.tbodyUsers.innerHTML = list.map(rowHtml).join("");
  renderStats(list);
}

function applySearch() {
  const q = String(els.search.value || "").toLowerCase().trim();
  if (!q) return renderTable(allUsers);

  const filtered = allUsers.filter(u => {
    const email = String(u.email || "").toLowerCase();
    const name = String(u.name || "").toLowerCase();
    const uid = String(u.uid || "").toLowerCase();
    return email.includes(q) || name.includes(q) || uid.includes(q);
  });

  renderTable(filtered);
}

async function loadUsers() {
  els.tbodyUsers.innerHTML = `<tr><td colspan="6" class="muted">CHARGEMENT...</td></tr>`;

  const qy = query(collection(db, "users"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(qy);

  allUsers = snap.docs.map(d => {
    const data = d.data() || {};
    return {
      uid: d.id,
      email: data.email || "",
      name: data.name || "",
      role: data.role || "staff",
      active: data.active !== false,
      updatedAt: data.updatedAt || null,
      createdAt: data.createdAt || null,
    };
  });

  renderTable(allUsers);
}

async function toggleActive(uid) {
  const u = allUsers.find(x => x.uid === uid);
  if (!u) return;

  await updateDoc(doc(db, "users", uid), {
    active: !(u.active !== false),
    updatedAt: serverTimestamp(),
  });

  await loadUsers();
}

async function saveModal() {
  const uid = String(els.mUid.value || "").trim();
  const email = String(els.mEmail.value || "").trim();
  const name = String(els.mName.value || "").trim();
  const role = normalizeRole(els.mRole.value);
  const active = !!els.mActive.checked;

  if (!uid) {
    alert("UID requis.");
    return;
  }

  const ref = doc(db, "users", uid);

  if (modalMode === "create") {
    await setDoc(ref, {
      email: email || "",
      name: name || "",
      role,
      active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } else {
    await updateDoc(ref, {
      email: email || "",
      name: name || "",
      role,
      active,
      updatedAt: serverTimestamp(),
    });
  }

  closeModal();
  await loadUsers();
}

function bindEvents() {
  els.btnLogout?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "./index.html";
  });

  els.btnRefresh?.addEventListener("click", loadUsers);
  els.btnOpenCreate?.addEventListener("click", () => openModal("create"));

  els.search?.addEventListener("input", applySearch);

  els.modalClose?.addEventListener("click", closeModal);
  els.modalCancel?.addEventListener("click", closeModal);
  els.modalBackdrop?.addEventListener("click", (e) => {
    if (e.target === els.modalBackdrop) closeModal();
  });

  els.modalSave?.addEventListener("click", saveModal);

  els.tbodyUsers?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const uid = btn.getAttribute("data-uid");
    if (!uid) return;

    if (action === "toggle") {
      await toggleActive(uid);
      return;
    }

    if (action === "edit") {
      const u = allUsers.find(x => x.uid === uid);
      if (!u) return;
      openModal("edit", u);
      return;
    }
  });
}

async function init() {
  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "./index.html";
      return;
    }

    me = user;
    els.currentUserEmail.value = user.email || "—";

    const ok = await requireAdmin(user.uid);
    if (!ok) {
      alert("Accès refusé (admin requis).");
      window.location.href = "./dashboard.html";
      return;
    }

    await loadUsers();
  });
}

init().catch((err) => {
  console.error(err);
  alert("Erreur gestion: " + (err?.message || err));
});
