// gestion.js (MODULE)
import { auth, db } from "./config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { $, toast, fmtDate } from "./common.js";

/** ---------------------------
 *  Guard admin (users/{uid}.role === "admin")
 *  --------------------------*/
async function requireAdminOrRedirect() {
  const user = auth.currentUser;
  if (!user) return false;

  const snap = await getDoc(doc(db, "users", user.uid));
  const role = (snap.exists() ? snap.data()?.role : "") || "";
  const ok = String(role).toLowerCase() === "admin";

  if (!ok) {
    alert("Accès refusé (admin requis).");
    // Option: redirect vers dashboard
    window.location.href = "./dashboard.html";
    return false;
  }
  return true;
}

/** ---------------------------
 *  Helpers UI
 *  --------------------------*/
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badgeRole(role) {
  const r = String(role || "").toLowerCase();
  const label = r === "admin" ? "ADMIN" : "STAFF";
  const cls = r === "admin" ? "badge ok" : "badge";
  return `<span class="${cls}">${label}</span>`;
}

function badgeActive(active) {
  const ok = !!active;
  return `<span class="pill ${ok ? "ok" : "bad"}">${ok ? "• ACTIF" : "• INACTIF"}</span>`;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

/** ---------------------------
 *  DOM refs (IDs attendus)
 *  --------------------------*/
const els = {
  emailBox: $("adminEmail"),
  btnRefresh: $("btnRefresh"),
  btnCreate: $("btnCreate"),
  tblBody: $("usersTbody"),
  countTotal: $("countTotal"),
  countAdmins: $("countAdmins"),
  countStaff: $("countStaff"),
  note: $("usersNote"),
  // Modal
  modal: $("userModal"),
  modalTitle: $("userModalTitle"),
  modalClose: $("userModalClose"),
  inputUid: $("m_uid"),
  inputEmail: $("m_email"),
  inputName: $("m_name"),
  inputRole: $("m_role"),
  inputActive: $("m_active"),
  btnCancel: $("m_cancel"),
  btnSave: $("m_save"),
};

function hasRequiredDom() {
  // On évite de crash si un ID manque
  return !!(els.tblBody && els.countTotal && els.countAdmins && els.countStaff);
}

/** ---------------------------
 *  Modal
 *  --------------------------*/
function openModal(data = {}) {
  if (!els.modal) return;

  els.modal.classList.add("open");

  if (els.modalTitle) els.modalTitle.textContent = data._mode === "create" ? "Créer / Ajouter un utilisateur" : "Modifier utilisateur";

  if (els.inputUid) els.inputUid.value = data.uid || "";
  if (els.inputEmail) els.inputEmail.value = data.email || "";
  if (els.inputName) els.inputName.value = data.name || "";
  if (els.inputRole) els.inputRole.value = (data.role || "staff").toLowerCase() === "admin" ? "admin" : "staff";
  if (els.inputActive) els.inputActive.checked = data.active !== false;

  // Email/UID non modifiables si edit (sauf si tu veux)
  if (els.inputEmail) els.inputEmail.disabled = data._mode !== "create"; // en create tu peux saisir
  if (els.inputUid) els.inputUid.disabled = data._mode !== "create";
}

function closeModal() {
  if (!els.modal) return;
  els.modal.classList.remove("open");
}

function wireModal() {
  if (els.modalClose) els.modalClose.addEventListener("click", closeModal);
  if (els.btnCancel) els.btnCancel.addEventListener("click", closeModal);

  // click backdrop -> close
  if (els.modal) {
    els.modal.addEventListener("click", (e) => {
      if (e.target === els.modal) closeModal();
    });
  }

  if (els.btnSave) {
    els.btnSave.addEventListener("click", async () => {
      const uid = (els.inputUid?.value || "").trim();
      const email = (els.inputEmail?.value || "").trim();
      const name = (els.inputName?.value || "").trim();
      const role = (els.inputRole?.value || "staff").trim().toLowerCase();
      const active = !!els.inputActive?.checked;

      if (!uid) return toast("UID requis (users/{uid})", "bad");
      if (!name) return toast("Nom requis", "bad");

      // email optionnel côté Firestore, mais pratique
      const payload = {
        name,
        role: role === "admin" ? "admin" : "staff",
        active,
        updatedAt: serverTimestamp(),
      };

      if (email) payload.email = email;

      try {
        // si doc existe -> update, sinon set
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, payload);
          toast("Utilisateur mis à jour ✅", "ok");
        } else {
          await setDoc(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true });
          toast("Utilisateur ajouté ✅", "ok");
        }
        closeModal();
      } catch (err) {
        console.error(err);
        toast("Erreur sauvegarde utilisateur", "bad");
      }
    });
  }
}

/** ---------------------------
 *  Users table
 *  --------------------------*/
function renderUsers(users) {
  let total = users.length;
  let admins = users.filter((u) => String(u.role || "").toLowerCase() === "admin").length;
  let staff = total - admins;

  setText("countTotal", String(total));
  setText("countAdmins", String(admins));
  setText("countStaff", String(staff));

  if (!els.tblBody) return;
  if (!users.length) {
    els.tblBody.innerHTML = `<tr><td colspan="6" class="muted">Aucun utilisateur.</td></tr>`;
    return;
  }

  els.tblBody.innerHTML = users
    .map((u) => {
      const email = escapeHtml(u.email || "—");
      const name = escapeHtml(u.name || "—");
      const role = u.role || "staff";
      const uid = escapeHtml(u.uid || "—");
      const active = !!u.active;

      return `
        <tr>
          <td>${email}</td>
          <td>${name}</td>
          <td>${badgeRole(role)}</td>
          <td>${badgeActive(active)}</td>
          <td class="mono">${uid}</td>
          <td class="actions">
            <button class="btn small" data-action="toggle" data-uid="${uid}" data-active="${active ? "1" : "0"}">
              ${active ? "Désactiver" : "Activer"}
            </button>
            <button class="btn gold small" data-action="edit" data-uid="${uid}">
              Modifier
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function toggleActive(uid, nextActive) {
  try {
    await updateDoc(doc(db, "users", uid), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
    toast(nextActive ? "Activé ✅" : "Désactivé ✅", "ok");
  } catch (e) {
    console.error(e);
    toast("Erreur changement statut", "bad");
  }
}

async function editUser(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return toast("Utilisateur introuvable", "bad");
    openModal({ uid, ...snap.data(), _mode: "edit" });
  } catch (e) {
    console.error(e);
    toast("Erreur chargement utilisateur", "bad");
  }
}

/** ---------------------------
 *  Live subscription
 *  --------------------------*/
let unsubUsers = null;

function subscribeUsers() {
  if (unsubUsers) unsubUsers();

  const q = query(collection(db, "users"), orderBy("updatedAt", "desc"));
  unsubUsers = onSnapshot(
    q,
    (snap) => {
      const users = [];
      snap.forEach((d) => {
        users.push({ uid: d.id, ...d.data() });
      });
      renderUsers(users);
    },
    (err) => {
      console.error(err);
      toast("Erreur lecture users", "bad");
      if (els.tblBody) els.tblBody.innerHTML = `<tr><td colspan="6" class="muted">Erreur chargement.</td></tr>`;
    }
  );
}

async function refreshOnce() {
  const q = query(collection(db, "users"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  const users = [];
  snap.forEach((d) => users.push({ uid: d.id, ...d.data() }));
  renderUsers(users);
}

/** ---------------------------
 *  Init
 *  --------------------------*/
function wireActions() {
  // Refresh
  if (els.btnRefresh) els.btnRefresh.addEventListener("click", refreshOnce);

  // Create (Firestore doc only)
  if (els.btnCreate) {
    els.btnCreate.addEventListener("click", () => {
      // IMPORTANT: ici on ne crée pas le compte AUTH (tu le fais dans Firebase Console > Auth)
      openModal({ _mode: "create", active: true, role: "staff" });
    });
  }

  // Table delegation
  document.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const uid = btn.dataset.uid;
    if (!uid) return;

    if (action === "toggle") {
      const current = btn.dataset.active === "1";
      await toggleActive(uid, !current);
    } else if (action === "edit") {
      await editUser(uid);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  // Affiche email en haut si tu as l’input
  if (els.emailBox) els.emailBox.value = user.email || "";

  // Guard admin
  const ok = await requireAdminOrRedirect();
  if (!ok) return;

  if (!hasRequiredDom()) {
    console.warn("DOM manquant: vérifie les IDs dans gestion.html");
    return;
  }

  wireActions();
  wireModal();
  subscribeUsers();
});
