import { auth, db } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, query,
  setDoc, updateDoc, deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  search: $("#searchInput"),
  btnRefresh: $("#btnRefresh"),
  btnNew: $("#btnNew"),
  btnLogout: $("#btnLogout"),

  statTotal: $("#statTotal"),
  statAdmins: $("#statAdmins"),
  statStaff: $("#statStaff"),

  tbody: $("#tbodyUsers"),

  dlg: $("#dlgUser"),
  dlgTitle: $("#dlgTitle"),
  dlgClose: $("#dlgClose"),
  form: $("#userForm"),
  fUid: $("#fUid"),
  fEmail: $("#fEmail"),
  fName: $("#fName"),
  fRole: $("#fRole"),
  fActive: $("#fActive"),
  fNote: $("#fNote"),
  btnSave: $("#btnSave"),
  btnCancel: $("#btnCancel"),
  btnDelete: $("#btnDelete"),
};

let currentUser = null;
let isAdmin = false;

let allUsers = [];     // liste brute
let filtered = [];     // liste filtrée (recherche)
let editingUid = null; // null => création

function deny() {
  alert("Accès refusé (admin uniquement).");
  window.location.href = "dashboard.html";
}

async function requireAdmin(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? String(snap.data().role || "staff").toLowerCase() : "staff";
  return role === "admin";
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

function badgeActive(active) {
  if (active) return `<span class="pill pill-ok">● actif</span>`;
  return `<span class="pill pill-off">● inactif</span>`;
}

function normalize(str) {
  return String(str ?? "").toLowerCase().trim();
}

function render() {
  const q = normalize(els.search.value);
  filtered = !q
    ? allUsers.slice()
    : allUsers.filter(u => {
        const hay = [
          u.uid, u.email, u.name, u.role, String(u.active)
        ].map(normalize).join(" ");
        return hay.includes(q);
      });

  // Stats
  const total = filtered.length;
  const admins = filtered.filter(u => String(u.role).toLowerCase() === "admin").length;
  const staff = filtered.filter(u => String(u.role).toLowerCase() !== "admin").length;

  els.statTotal.textContent = total;
  els.statAdmins.textContent = admins;
  els.statStaff.textContent = staff;

  // Table
  if (!filtered.length) {
    els.tbody.innerHTML = `<tr><td colspan="6" style="opacity:.7;">Aucun utilisateur.</td></tr>`;
    return;
  }

  els.tbody.innerHTML = filtered.map(u => {
    const role = String(u.role || "staff").toLowerCase();
    const active = !!u.active;

    return `
      <tr>
        <td>${esc(u.email || "—")}</td>
        <td>${esc(u.name || "—")}</td>
        <td><b>${esc(role)}</b></td>
        <td>${badgeActive(active)}</td>
        <td style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px;">
          ${esc(u.uid)}
        </td>
        <td style="text-align:right;">
          <div class="table-actions">
            <button class="btn btn-xs" data-act="toggle" data-uid="${esc(u.uid)}">${active ? "Désactiver" : "Activer"}</button>
            <button class="btn btn-xs" data-act="edit" data-uid="${esc(u.uid)}">Modifier</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadUsers() {
  try {
    els.tbody.innerHTML = `<tr><td colspan="6" style="opacity:.7;">Chargement…</td></tr>`;

    // Simple: on lit la collection "users"
    const snap = await getDocs(query(collection(db, "users")));
    const arr = [];
    snap.forEach(d => {
      const data = d.data() || {};
      arr.push({
        uid: d.id,
        email: data.email || "",
        name: data.name || "",
        role: data.role || "staff",
        active: data.active !== false, // true par défaut
        note: data.note || "",
      });
    });

    // Tri: admin d'abord, puis actif, puis nom
    arr.sort((a,b) => {
      const ra = String(a.role).toLowerCase() === "admin" ? 0 : 1;
      const rb = String(b.role).toLowerCase() === "admin" ? 0 : 1;
      if (ra !== rb) return ra - rb;

      const aa = a.active ? 0 : 1;
      const ab = b.active ? 0 : 1;
      if (aa !== ab) return aa - ab;

      return normalize(a.name).localeCompare(normalize(b.name));
    });

    allUsers = arr;
    render();
  } catch (e) {
    console.error(e);
    els.tbody.innerHTML = `
      <tr>
        <td colspan="6" style="color:#ffb4b4;">
          Erreur de lecture Firestore. Ouvre la console (F12) pour voir le détail.
          (Probable: règles Firestore qui empêchent le "list" sur users)
        </td>
      </tr>
    `;
    els.statTotal.textContent = "—";
    els.statAdmins.textContent = "—";
    els.statStaff.textContent = "—";
  }
}

function openModal(user = null) {
  if (user) {
    editingUid = user.uid;
    els.dlgTitle.textContent = "Modifier utilisateur";
    els.fUid.value = user.uid;
    els.fUid.disabled = true;

    els.fEmail.value = user.email || "";
    els.fName.value = user.name || "";
    els.fRole.value = String(user.role || "staff").toLowerCase() === "admin" ? "admin" : "staff";
    els.fActive.value = user.active ? "true" : "false";
    els.fNote.value = user.note || "";

    els.btnDelete.style.display = "inline-block";
  } else {
    editingUid = null;
    els.dlgTitle.textContent = "Créer fiche utilisateur";
    els.fUid.disabled = false;

    els.fUid.value = "";
    els.fEmail.value = "";
    els.fName.value = "";
    els.fRole.value = "staff";
    els.fActive.value = "true";
    els.fNote.value = "";

    els.btnDelete.style.display = "none";
  }

  els.dlg.showModal();
}

function closeModal() {
  els.dlg.close();
}

async function saveUser() {
  const uid = els.fUid.value.trim();
  if (!uid) return alert("UID obligatoire.");

  const payload = {
    email: els.fEmail.value.trim() || "",
    name: els.fName.value.trim() || "",
    role: (els.fRole.value || "staff").trim(),
    active: els.fActive.value === "true",
    note: els.fNote.value.trim() || "",
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, "users", uid);

    // Si création, on pose createdAt une fois
    if (!editingUid) {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true });
    } else {
      await setDoc(ref, payload, { merge: true });
    }

    closeModal();
    await loadUsers();
  } catch (e) {
    console.error(e);
    alert("Erreur enregistrement (voir console).");
  }
}

async function toggleActive(uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const current = snap.data().active !== false;
    await updateDoc(ref, { active: !current, updatedAt: serverTimestamp() });
    await loadUsers();
  } catch (e) {
    console.error(e);
    alert("Erreur toggle (voir console).");
  }
}

async function deleteUserDoc() {
  const uid = editingUid;
  if (!uid) return;

  const ok = confirm("Supprimer la fiche Firestore (users/" + uid + ") ?\n⚠️ Ça ne supprime PAS le compte dans Firebase Auth.");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "users", uid));
    closeModal();
    await loadUsers();
  } catch (e) {
    console.error(e);
    alert("Erreur suppression (voir console).");
  }
}

/* Events */
els.search.addEventListener("input", render);

els.btnRefresh.addEventListener("click", loadUsers);
els.btnNew.addEventListener("click", () => openModal(null));

els.dlgClose.addEventListener("click", closeModal);
els.btnCancel.addEventListener("click", closeModal);
els.btnSave.addEventListener("click", saveUser);
els.btnDelete.addEventListener("click", deleteUserDoc);

els.tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const uid = btn.dataset.uid;

  if (act === "edit") {
    const u = allUsers.find(x => x.uid === uid);
    if (!u) return;
    openModal(u);
  } else if (act === "toggle") {
    await toggleActive(uid);
  }
});

els.btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

/* Auth guard */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "pdm-staff.html";
    return;
  }
  currentUser = user;

  try {
    isAdmin = await requireAdmin(user);
    if (!isAdmin) return deny();
    await loadUsers();
  } catch (e) {
    console.error(e);
    deny();
  }
});
