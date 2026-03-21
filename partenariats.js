import { db, auth } from "./config.js";
import {
  collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";
import { escapeHtml, checkIsAdmin, showDenyScreen } from "./common.js";

const $ = (id) => document.getElementById(id);

const partnersTable = $("partnersTable");
const membersTable = $("membersTable");
const search = $("search");

const statPartners = $("statPartners");
const statMembers = $("statMembers");
const statActive = $("statActive");

const refreshBtn = $("refreshBtn");
const addPartnerBtn = $("addPartnerBtn");
const logoutBtn = $("logoutBtn");

// Modals
const partnerModal = $("partnerModal");
const addPartnerModal = $("addPartnerModal");
const memberModal = $("memberModal");

// Partner Modal (View/Edit)
const pmTitle = $("pmTitle");
const pmClose = $("pmClose");
const pmCancel = $("pmCancel");
const pmSave = $("pmSave");
const pmDelete = $("pmDelete");
const pmName = $("pmName");
const pmActive = $("pmActive");
const pmId = $("pmId");
const addMemberBtn = $("addMemberBtn");

// Add Partner Modal
const apmClose = $("apmClose");
const apmCancel = $("apmCancel");
const apmSave = $("apmSave");
const apmName = $("apmName");

// Member Modal (Add/Edit)
const mmTitle = $("mmTitle");
const mmClose = $("mmClose");
const mmCancel = $("mmCancel");
const mmSave = $("mmSave");
const mmFullName = $("mmFullName");
const mmClientId = $("mmClientId");
const mmRate = $("mmRate");
const mmId = $("mmId");

let PARTNERS = [];
let OPEN_PARTNER_ID = null;
let OPEN_MEMBERS = [];

function fmtDate(ts){
  try { return ts?.toDate?.().toLocaleDateString("fr-FR") || "-"; } catch { return "-"; }
}

function esc(s){
  return escapeHtml(s);
}

const hideAllModals = () => {
  [partnerModal, addPartnerModal, memberModal].forEach(m => m.classList.add("hidden"));
};

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

// Modal Event Listeners
[pmClose, pmCancel, apmClose, apmCancel, mmClose, mmCancel].forEach(btn => {
  btn?.addEventListener("click", hideAllModals);
});

[partnerModal, addPartnerModal, memberModal].forEach(m => {
  m?.addEventListener("click", (e) => { if(e.target === m) hideAllModals(); });
});

// Admin-only Access Check

}

// Data Loading
async function loadPartners(){
  if (!partnersTable) return;
  partnersTable.innerHTML = `<tr><td colspan="6" class="muted">Chargement...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "partners"));
    const base = snap.docs.map(d => ({ id: d.id, ...d.data(), membersCount: 0 }));

    for (const p of base){
      try {
        const ms = await getDocs(collection(db, "partners", p.id, "members"));
        p.membersCount = ms.size;
      } catch {
        p.membersCount = 0;
      }
    }

    PARTNERS = base;
    renderPartners();
  } catch (e) {
    console.error(e);
    partnersTable.innerHTML = `<tr><td colspan="6" class="red">Erreur de chargement.</td></tr>`;
  }
}

function renderPartners(){
  const q = (search?.value || "").trim().toLowerCase();

  const list = PARTNERS
    .filter(p => !q || (p.name || "").toLowerCase().includes(q))
    .sort((a,b)=>{
      const da = a.createdAt?.toDate?.()?.getTime?.() || 0;
      const dbb = b.createdAt?.toDate?.()?.getTime?.() || 0;
      return dbb - da;
    });

  statPartners.textContent = String(list.length);
  statMembers.textContent = String(list.reduce((s,p)=>s + (p.membersCount||0), 0));
  statActive.textContent = String(list.filter(p=>p.active===true).length);

  if(!list.length){
    partnersTable.innerHTML = `<tr><td colspan="6" class="muted">Aucun partenaire trouvé.</td></tr>`;
    return;
  }

  partnersTable.innerHTML = list.map(p => `
    <tr>
      <td>${esc(p.name || "-")}</td>
      <td><span class="badge ${p.active ? "badge-success" : "badge-danger"}">${p.active ? "Oui" : "Non"}</span></td>
      <td>${p.membersCount || 0}</td>
      <td>${fmtDate(p.createdAt)}</td>
      <td>${fmtDate(p.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn btn-gold" data-open="${p.id}">Voir / Éditer</button>
      </td>
    `).join("");

  partnersTable.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=> openPartner(btn.getAttribute("data-open")));
  });
}

async function openPartner(partnerId){
  OPEN_PARTNER_ID = partnerId;
  const p = PARTNERS.find(x => x.id === partnerId);

  pmTitle.textContent = p?.name ? `Partenaire : ${p.name}` : "Partenaire";
  pmId.textContent = partnerId;
  pmName.value = p?.name || "";
  pmActive.checked = p?.active === true;

  await loadMembers(partnerId);
  partnerModal.classList.remove("hidden");
}

async function loadMembers(partnerId){
  membersTable.innerHTML = `<tr><td colspan="6" class="muted">Chargement...</td></tr>`;
  try {
    const snap = await getDocs(collection(db, "partners", partnerId, "members"));
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    for (const m of members){
      let displayName = m.fullName || "-";
      if (m.clientId){
        try {
          const c = await getDoc(doc(db, "clients", m.clientId));
          if (c.exists()){
            const cd = c.data();
            displayName = cd.name || cd.fullName || displayName;
          }
        } catch {}
      }
      m.displayName = displayName;
    }

    OPEN_MEMBERS = members.sort((a,b)=>{
      const da = a.createdAt?.toDate?.()?.getTime?.() || 0;
      const dbb = b.createdAt?.toDate?.()?.getTime?.() || 0;
      return dbb - da;
    });

    renderMembers();
  } catch (e) {
    console.error(e);
    membersTable.innerHTML = `<tr><td colspan="6" class="red">Erreur.</td></tr>`;
  }
}

function renderMembers(){
  if(!OPEN_MEMBERS.length){
    membersTable.innerHTML = `<tr><td colspan="6" class="muted">Aucun client partenaire</td></tr>`;
    return;
  }

  membersTable.innerHTML = OPEN_MEMBERS.map(m => `
    <tr>
      <td>${esc(m.displayName || "-")}</td>
      <td><span style="font-family: monospace; color: var(--accent-gold-soft);">${esc(m.clientId || "-")}</span></td>
      <td>${esc(m.rate ?? 0)}%</td>
      <td>${fmtDate(m.createdAt)}</td>
      <td>${fmtDate(m.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn btn-outline btn-sm" data-edit="${m.id}">Modifier</button>
        <button class="btn btn-danger btn-sm" data-del="${m.id}">Supprimer</button>
      </td>
    `).join("");

  membersTable.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> openMemberModal(btn.getAttribute("data-edit")));
  });
  membersTable.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=> deleteMember(btn.getAttribute("data-del")));
  });
}

// Partner Actions
pmSave?.addEventListener("click", async ()=>{
  if(!OPEN_PARTNER_ID) return;
  const name = (pmName.value || "").trim();
  if(!name) return alert("Nom obligatoire.");

  try {
    await updateDoc(doc(db, "partners", OPEN_PARTNER_ID), {
      name,
      nameKey: name.toLowerCase(),
      active: pmActive.checked,
      updatedAt: serverTimestamp(),
    });
    await logAction("PARTENAIRE_MODIF", `Modif partenaire ${OPEN_PARTNER_ID}`);
    await loadPartners();
    hideAllModals();
  } catch (e) {
    console.error(e);
    alert("Erreur lors de la sauvegarde.");
  }
});

pmDelete?.addEventListener("click", async ()=>{
  if(!OPEN_PARTNER_ID) return;
  if(!confirm("Supprimer ce partenaire ?")) return;
  try {
    await deleteDoc(doc(db, "partners", OPEN_PARTNER_ID));
    await logAction("PARTENAIRE_SUPPR", `Suppression partenaire ${OPEN_PARTNER_ID}`);
    hideAllModals();
    await loadPartners();
  } catch (e) {
    console.error(e);
    alert("Erreur lors de la suppression.");
  }
});

addPartnerBtn?.addEventListener("click", () => {
  apmName.value = "";
  addPartnerModal.classList.remove("hidden");
});

apmSave?.addEventListener("click", async () => {
  const name = apmName.value.trim();
  if (!name) return alert("Le nom est obligatoire.");

  try {
    await addDoc(collection(db, "partners"), {
      name,
      nameKey: name.toLowerCase(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logAction("PARTENAIRE_AJOUT", `Ajout partenaire: ${name}`);
    hideAllModals();
    await loadPartners();
  } catch (e) {
    console.error(e);
    alert("Erreur lors de la création.");
  }
});

// Member Actions
function openMemberModal(memberId = null) {
  if (memberId) {
    const m = OPEN_MEMBERS.find(x => x.id === memberId);
    if (!m) return;
    mmTitle.textContent = "Modifier Membre";
    mmId.textContent = m.id;
    mmFullName.value = m.fullName || "";
    mmClientId.value = m.clientId || "";
    mmRate.value = m.rate || 0;
  } else {
    mmTitle.textContent = "Ajouter Membre";
    mmId.textContent = "";
    mmFullName.value = "";
    mmClientId.value = "";
    mmRate.value = 0;
  }
  memberModal.classList.remove("hidden");
}

addMemberBtn?.addEventListener("click", () => openMemberModal());

mmSave?.addEventListener("click", async () => {
  if (!OPEN_PARTNER_ID) return;
  const fullName = mmFullName.value.trim();
  const clientId = mmClientId.value.trim();
  const rate = Number(mmRate.value);
  const mId = mmId.textContent;

  if (!fullName && !clientId) return alert("Nom ou ID Client requis.");
  if (isNaN(rate) || rate < 0) return alert("Taux invalide.");

  try {
    const data = {
      fullName,
      clientId: clientId || null,
      rate,
      updatedAt: serverTimestamp(),
    };

    if (mId) {
      await updateDoc(doc(db, "partners", OPEN_PARTNER_ID, "members", mId), data);
      await logAction("PARTENAIRE_MEMBRE_MODIF", `Modif membre ${mId} (Partenaire ${OPEN_PARTNER_ID})`);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "partners", OPEN_PARTNER_ID, "members"), data);
      await logAction("PARTENAIRE_MEMBRE_AJOUT", `Ajout membre (Partenaire ${OPEN_PARTNER_ID})`);
    }

    hideAllModals();
    await loadPartners(); // for counters
    await loadMembers(OPEN_PARTNER_ID);
    partnerModal.classList.remove("hidden"); // stay on partner view
  } catch (e) {
    console.error(e);
    alert("Erreur de sauvegarde du membre.");
  }
});

async function deleteMember(memberId){
  if(!confirm("Supprimer ce client du partenaire ?")) return;
  try {
    await deleteDoc(doc(db, "partners", OPEN_PARTNER_ID, "members", memberId));
    await logAction("PARTENAIRE_MEMBRE_SUPPR", `Suppression membre ${memberId} (Partenaire ${OPEN_PARTNER_ID})`);
    await loadPartners();
    await loadMembers(OPEN_PARTNER_ID);
  } catch (e) {
    console.error(e);
    alert("Erreur de suppression du membre.");
  }
}

// Initialization & Auth
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "pdm-staff.html";
    return;
  }
  try {
    const ok = await checkIsAdmin(user.uid);
    if (!ok) {
      showDenyScreen();
    } else {
      loadPartners();
    }
  } catch (e) {
    console.error(e);
    showDenyScreen();
  }
});

search?.addEventListener("input", renderPartners);
refreshBtn?.addEventListener("click", loadPartners);
