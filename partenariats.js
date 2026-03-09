import { db, auth } from "./config.js";
import {
  collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";

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

const partnerModal = $("partnerModal");
const pmTitle = $("pmTitle");
const pmClose = $("pmClose");
const pmCancel = $("pmCancel");
const pmSave = $("pmSave");
const pmDelete = $("pmDelete");
const pmName = $("pmName");
const pmActive = $("pmActive");
const pmId = $("pmId");
const addMemberBtn = $("addMemberBtn");

let PARTNERS = [];          // {id, name, active, createdAt, updatedAt, membersCount}
let OPEN_PARTNER_ID = null; // partnerId ouvert dans le modal
let OPEN_MEMBERS = [];      // members du partner ouvert

function fmtDate(ts){
  try { return ts?.toDate?.().toLocaleDateString("fr-FR") || "-"; } catch { return "-"; }
}
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function openModal(){ partnerModal.classList.remove("hidden"); }
function closeModal(){ partnerModal.classList.add("hidden"); }

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

pmClose?.addEventListener("click", closeModal);
pmCancel?.addEventListener("click", closeModal);
partnerModal?.addEventListener("click", (e)=>{ if(e.target === partnerModal) closeModal(); });

async function loadPartners(){
  partnersTable.innerHTML = `<tr><td colspan="6">Chargement...</td></tr>`;

  const snap = await getDocs(collection(db, "partners"));
  const base = snap.docs.map(d => ({ id: d.id, ...d.data(), membersCount: 0 }));

  // ✅ Fix compteur clients: on compte la sous-collection /members
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
    partnersTable.innerHTML = `<tr><td colspan="6">Aucun partenaire</td></tr>`;
    return;
  }

  partnersTable.innerHTML = list.map(p => `
    <tr>
      <td>${esc(p.name || "-")}</td>
      <td>${p.active ? "Oui" : "Non"}</td>
      <td>${p.membersCount || 0}</td>
      <td>${fmtDate(p.createdAt)}</td>
      <td>${fmtDate(p.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn btn-gold" data-open="${p.id}">Voir</button>
      </td>
    </tr>
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
  openModal();
}

async function loadMembers(partnerId){
  membersTable.innerHTML = `<tr><td colspan="6">Chargement...</td></tr>`;
  const snap = await getDocs(collection(db, "partners", partnerId, "members"));
  const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ✅ Fix “nom client ne s’affiche pas”:
  // - si member.clientId existe: on lit clients/{clientId} et on prend name/fullName si dispo
  // - sinon: on affiche member.fullName
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
}

function renderMembers(){
  if(!OPEN_MEMBERS.length){
    membersTable.innerHTML = `<tr><td colspan="6">Aucun client partenaire</td></tr>`;
    return;
  }

  membersTable.innerHTML = OPEN_MEMBERS.map(m => `
    <tr>
      <td>${esc(m.displayName || "-")}</td>
      <td><span style="font-family: monospace; color: var(--accent-gold-soft);">${esc(m.clientId || "-")}</span></td>
      <td>${esc(m.rate ?? 0)}</td>
      <td>${fmtDate(m.createdAt)}</td>
      <td>${fmtDate(m.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn btn-outline btn-sm" data-edit="${m.id}">Modifier</button>
        <button class="btn btn-danger btn-sm" data-del="${m.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");

  membersTable.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> editMember(btn.getAttribute("data-edit")));
  });
  membersTable.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=> deleteMember(btn.getAttribute("data-del")));
  });
}

async function editMember(memberId){
  const m = OPEN_MEMBERS.find(x => x.id === memberId);
  if(!m) return;

  const fullName = prompt("Nom affiché :", m.fullName || m.displayName || "") ?? "";
  const clientId = prompt("ClientId (optionnel) :", m.clientId || "") ?? "";
  const rateStr = prompt("Taux :", String(m.rate ?? 0)) ?? "0";
  const rate = Number(rateStr);

  if (!fullName.trim() && !clientId.trim()) return alert("Met au moins un nom OU un clientId.");
  if (Number.isNaN(rate) || rate < 0) return alert("Taux invalide.");

  await updateDoc(doc(db, "partners", OPEN_PARTNER_ID, "members", memberId), {
    // log: PARTENAIRE_MEMBRE_MODIF
    fullName: fullName.trim(),
    clientId: clientId.trim() || null,
    rate,
    updatedAt: serverTimestamp(),
  });
  await logAction("PARTENAIRE_MEMBRE_MODIF", `Modif membre ${memberId} du partenaire ${OPEN_PARTNER_ID}`);

  await loadPartners(); // refresh count
  await loadMembers(OPEN_PARTNER_ID);
}

async function deleteMember(memberId){
  if(!confirm("Supprimer ce client du partenaire ?")) return;
  await deleteDoc(doc(db, "partners", OPEN_PARTNER_ID, "members", memberId));
  await logAction("PARTENAIRE_MEMBRE_SUPPR", `Suppression membre ${memberId} du partenaire ${OPEN_PARTNER_ID}`);
    await loadPartners();
  await loadMembers(OPEN_PARTNER_ID);
}

pmSave?.addEventListener("click", async ()=>{
  if(!OPEN_PARTNER_ID) return;
  const name = (pmName.value || "").trim();
  if(!name) return alert("Nom obligatoire.");

  await updateDoc(doc(db, "partners", OPEN_PARTNER_ID), {
    name,
    nameKey: name.toLowerCase(),
    active: pmActive.checked,
    updatedAt: serverTimestamp(),
  });
  await logAction("PARTENAIRE_MODIF", `Modif partenaire ${OPEN_PARTNER_ID}`);

  await loadPartners();
  const p = PARTNERS.find(x => x.id === OPEN_PARTNER_ID);
  pmTitle.textContent = p?.name ? `Partenaire : ${p.name}` : "Partenaire";
});

pmDelete?.addEventListener("click", async ()=>{
  if(!OPEN_PARTNER_ID) return;
  if(!confirm("Supprimer ce partenaire ?")) return;
  await deleteDoc(doc(db, "partners", OPEN_PARTNER_ID));
  await logAction("PARTENAIRE_SUPPR", `Suppression partenaire ${OPEN_PARTNER_ID}`);
    closeModal();
  await loadPartners();
});

addPartnerBtn?.addEventListener("click", async ()=>{
  const name = prompt("Nom du partenaire ?")?.trim();
  if(!name) return;

  await addDoc(collection(db, "partners"), {
    name,
    nameKey: name.toLowerCase(),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logAction("PARTENAIRE_AJOUT", `Ajout partenaire`);

  await loadPartners();
});

addMemberBtn?.addEventListener("click", async ()=>{
  if(!OPEN_PARTNER_ID) return;

  const fullName = prompt("Nom affiché (obligatoire si pas clientId) :", "") ?? "";
  const clientId = prompt("ClientId (optionnel) :", "") ?? "";
  const rateStr = prompt("Taux :", "0") ?? "0";
  const rate = Number(rateStr);

  if (!fullName.trim() && !clientId.trim()) return alert("Met au moins un nom OU un clientId.");
  if (Number.isNaN(rate) || rate < 0) return alert("Taux invalide.");

  await addDoc(collection(db, "partners", OPEN_PARTNER_ID, "members"), {
    fullName: fullName.trim(),
    clientId: clientId.trim() || null,
    rate,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logAction("PARTENAIRE_MEMBRE_AJOUT", `Ajout membre au partenaire ${OPEN_PARTNER_ID}`);

  await loadPartners();
  await loadMembers(OPEN_PARTNER_ID);
});

search?.addEventListener("input", renderPartners);
refreshBtn?.addEventListener("click", loadPartners);

loadPartners();
