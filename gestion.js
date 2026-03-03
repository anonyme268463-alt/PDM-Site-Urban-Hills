import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs,
  query, orderBy,
  updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const pageRoot = document.getElementById("pageRoot");
const logoutBtn = document.getElementById("logoutBtn");

const searchInput = document.getElementById("searchInput");
const refreshBtn = document.getElementById("refreshBtn");
const createBtn = document.getElementById("createBtn");
const statusPill = document.getElementById("statusPill");

const statTotal = document.getElementById("statTotal");
const statAdmins = document.getElementById("statAdmins");
const statStaff = document.getElementById("statStaff");

const usersTbody = document.getElementById("usersTbody");

// dialog
const dlg = document.getElementById("createDialog");
const dClose = document.getElementById("dClose");
const dCancel = document.getElementById("dCancel");
const dCreate = document.getElementById("dCreate");
const dEmail = document.getElementById("dEmail");
const dPassword = document.getElementById("dPassword");
const dName = document.getElementById("dName");
const dRole = document.getElementById("dRole");

let currentUser = null;
let isAdmin = false;
let users = [];

function norm(v){ return (v ?? "").toString().trim().toLowerCase(); }

function setPill(text, kind=""){
  statusPill.textContent = text;
  statusPill.className = "pill" + (kind ? ` ${kind}` : "");
}

function deny(){
  pageRoot.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Accès refusé</div>
          <div class="card-sub">Vous n'avez pas l'autorisation de consulter cette page.</div>
        </div>
      </div>
      <div style="padding:18px" class="muted">Si tu penses que c'est une erreur, contacte le PDG.</div>
    </div>
  `;
}

async function requireAdmin(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const role = snap.exists() ? (snap.data().role || "staff") : "staff";
  return String(role).toLowerCase() === "admin";
}

function renderStats(){
  const total = users.length;
  const admins = users.filter(u => (u.role||"staff").toLowerCase()==="admin").length;
  const staff = total - admins;
  statTotal.textContent = `${total}`;
  statAdmins.textContent = `${admins}`;
  statStaff.textContent = `${staff}`;
}

function renderTable(list){
  if (!list.length){
    usersTbody.innerHTML = `<tr><td colspan="6" class="muted">Aucun utilisateur.</td></tr>`;
    return;
  }

  usersTbody.innerHTML = list.map(u => {
    const role = (u.role || "staff").toLowerCase();
    const disabled = !!u.disabled;
    const statusHtml = disabled
      ? `<span class="pill bad">Désactivé</span>`
      : `<span class="pill ok">Actif</span>`;

    return `
      <tr>
        <td>${u.email ?? "-"}</td>
        <td>${u.name ?? "-"}</td>
        <td><b>${role}</b></td>
        <td>${statusHtml}</td>
        <td class="muted" style="font-size:12px">${u.uid}</td>
        <td class="td-actions">
          <div class="mini-actions">
            <button class="btn btn-sm btn-ghost" data-role="${u.uid}" data-next="${role === "admin" ? "staff" : "admin"}">
              Mettre ${role === "admin" ? "staff" : "admin"}
            </button>
            <button class="btn btn-sm ${disabled ? "btn-ghost" : "btn-danger"}" data-toggle="${u.uid}" data-next="${disabled ? "0" : "1"}">
              ${disabled ? "Réactiver" : "Désactiver"}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function applyFilter(){
  const q = norm(searchInput.value);
  const list = q
    ? users.filter(u => [u.email, u.name, u.uid].some(v => norm(v).includes(q)))
    : users;
  renderTable(list);
  renderStats();
}

async function loadUsers(){
  setPill("Chargement…");
  usersTbody.innerHTML = `<tr><td colspan="6" class="muted">Chargement…</td></tr>`;

  const qUsers = query(collection(db, "users"), orderBy("email", "asc"));
  const snap = await getDocs(qUsers);

  users = snap.docs.map(d => {
    const data = d.data() || {};
    return {
      uid: d.id,
      email: data.email || null,
      name: data.name || null,
      role: data.role || "staff",
      disabled: !!data.disabled,
    };
  });

  setPill("OK", "ok");
  applyFilter();
}

function openCreate(){
  dEmail.value = "";
  dPassword.value = "";
  dName.value = "";
  dRole.value = "staff";
  dlg.showModal();
}
function closeCreate(){ try{ dlg.close(); }catch{} }

async function callCreateUser(email, password, role, name){
  // IMPORTANT: remplace l’URL après déploiement de ta Function
  // Exemple: https://europe-west1-TON_PROJECT.cloudfunctions.net/adminCreateUser
  const FN_URL = window.PDM_ADMIN_CREATE_USER_URL || ""; // tu peux mettre la vraie URL ici

  if (!FN_URL) {
    alert("⚠️ Cloud Function non configurée. Mets l'URL dans gestion.js (FN_URL).");
    return;
  }

  const token = await auth.currentUser.getIdToken();

  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ email, password, role, name }),
  });

  const json = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(json?.error || "Erreur Cloud Function");
  return json;
}

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

searchInput.addEventListener("input", applyFilter);
refreshBtn.addEventListener("click", () => loadUsers().catch(e => (console.error(e), setPill("Erreur", "bad"))));
createBtn.addEventListener("click", openCreate);
dClose.addEventListener("click", closeCreate);
dCancel.addEventListener("click", closeCreate);

dCreate.addEventListener("click", async () => {
  const email = (dEmail.value||"").trim();
  const password = (dPassword.value||"").trim();
  const role = (dRole.value||"staff").trim();
  const name = (dName.value||"").trim();

  if (!email || !password) return alert("Email + mot de passe requis.");
  if (password.length < 6) return alert("Mot de passe: minimum 6 caractères.");
  if (!["admin","staff"].includes(role)) return alert("Rôle invalide.");

  try{
    dCreate.disabled = true;
    dCreate.textContent = "Création…";
    await callCreateUser(email, password, role, name);
    closeCreate();
    await loadUsers();
    alert("✅ Utilisateur créé !");
  } catch(e){
    console.error(e);
    alert("❌ " + (e?.message || "Erreur création"));
  } finally {
    dCreate.disabled = false;
    dCreate.textContent = "Créer";
  }
});

usersTbody.addEventListener("click", async (e) => {
  const roleBtn = e.target.closest("[data-role]");
  const toggleBtn = e.target.closest("[data-toggle]");

  if (roleBtn){
    const uid = roleBtn.dataset.role;
    const next = roleBtn.dataset.next;
    if (!confirm(`Changer le rôle en "${next}" ?`)) return;

    try{
      await updateDoc(doc(db, "users", uid), { role: next, updatedAt: serverTimestamp() });
      await loadUsers();
    } catch(err){
      console.error(err);
      alert("Erreur changement rôle");
    }
  }

  if (toggleBtn){
    const uid = toggleBtn.dataset.toggle;
    const next = toggleBtn.dataset.next === "1";
    if (!confirm(next ? "Désactiver cet utilisateur ?" : "Réactiver cet utilisateur ?")) return;

    try{
      await updateDoc(doc(db, "users", uid), { disabled: next, updatedAt: serverTimestamp() });
      await loadUsers();
    } catch(err){
      console.error(err);
      alert("Erreur statut");
    }
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }
  currentUser = user;

  try{
    isAdmin = await requireAdmin(user);
    if (!isAdmin) { deny(); return; }
    await loadUsers();
  } catch(e){
    console.error(e);
    deny();
  }
});
