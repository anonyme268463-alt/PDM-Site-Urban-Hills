// partenariats.js
import { db } from "./config.js";
import { requireAuth } from "./guard.js";
import { showToast, logout } from "./common.js";

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

requireAuth();

const partnersRef = collection(db, "partners");
let partners = []; // {id,name,...}
let members = [];  // members of selected partner
let currentPartnerId = null;

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function membersRefFor(pid) {
  return collection(db, "partners", pid, "members");
}

function renderPartners(list) {
  $("partnerCount").textContent = `${list.length} partenaires`;
  const tbody = $("partnersTable");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="3">Aucun partenaire</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(p => `
    <tr data-partner-id="${p.id}" style="cursor:pointer">
      <td>${escapeHtml(p.name || "")}</td>
      <td>${escapeHtml(p.note || "")}</td>
      <td>
        <button class="btn" data-action="edit-partner" data-id="${p.id}" style="padding:6px 12px;font-size:12px">✏️</button>
        <button class="btn" data-action="del-partner" data-id="${p.id}" style="padding:6px 12px;font-size:12px;background:#ff4444">🗑️</button>
      </td>
    </tr>
  `).join("");
}

function renderMembers(list) {
  $("memberCount").textContent = `${list.length} membres`;
  const panel = $("membersPanel");
  if (panel) panel.style.display = currentPartnerId ? "block" : "none";

  const tbody = $("membersTable");
  if (!tbody) return;

  if (!currentPartnerId) {
    tbody.innerHTML = '<tr><td colspan="3">Sélectionne un partenaire</td></tr>';
    return;
  }

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="3">Aucun membre</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(m => `
    <tr>
      <td>${escapeHtml(m.name || "")}</td>
      <td>${escapeHtml(m.rate || "")}</td>
      <td>
        <button class="btn" data-action="edit-member" data-id="${m.id}" style="padding:6px 12px;font-size:12px">✏️</button>
        <button class="btn" data-action="del-member" data-id="${m.id}" style="padding:6px 12px;font-size:12px;background:#ff4444">🗑️</button>
      </td>
    </tr>
  `).join("");
}

function applyPartnerSearch() {
  const term = ($("partnerSearch")?.value || "").toLowerCase().trim();
  if (!term) return renderPartners(partners);
  renderPartners(partners.filter(p => String(p.name||"").toLowerCase().includes(term)));
}

function applyMemberSearch() {
  const term = ($("memberSearch")?.value || "").toLowerCase().trim();
  if (!term) return renderMembers(members);
  renderMembers(members.filter(m => String(m.name||"").toLowerCase().includes(term)));
}

async function addPartner() {
  const name = ($("partnerName")?.value || "").trim() || prompt("Nom partenaire :");
  if (!name) return;
  await addDoc(partnersRef, { name, createdAt: serverTimestamp() });
  if ($("partnerName")) $("partnerName").value = "";
  showToast("Partenaire ajouté !");
}

async function renamePartner() {
  if (!currentPartnerId) return showToast("Sélectionne un partenaire", "err");
  const current = partners.find(p => p.id === currentPartnerId);
  const name = prompt("Nouveau nom :", current?.name || "");
  if (!name) return;
  await updateDoc(doc(db, "partners", currentPartnerId), { name, updatedAt: serverTimestamp() });
  showToast("Partenaire renommé !");
}

async function deleteSelectedPartner() {
  if (!currentPartnerId) return showToast("Sélectionne un partenaire", "err");
  if (!confirm("Supprimer ce partenaire ? (les membres aussi)")) return;
  await deleteDoc(doc(db, "partners", currentPartnerId));
  currentPartnerId = null;
  members = [];
  renderMembers([]);
  showToast("Partenaire supprimé !");
}

async function selectPartner(id) {
  currentPartnerId = id;
  $("newPartner").textContent = partners.find(p => p.id === id)?.name || "Partenaire";
  // subscribe members
  onSnapshot(query(membersRefFor(id), orderBy("createdAt","desc")), (snap) => {
    members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyMemberSearch();
  });
  applyMemberSearch();
}

async function addMember() {
  if (!currentPartnerId) return showToast("Sélectionne un partenaire", "err");
  const name = ($("newMemberName")?.value || "").trim() || prompt("Nom membre :");
  if (!name) return;
  const rate = ($("newMemberRate")?.value || "").trim() || prompt("Taux / % / info :", "");
  await addDoc(membersRefFor(currentPartnerId), { name, rate: rate || "", createdAt: serverTimestamp() });
  if ($("newMemberName")) $("newMemberName").value = "";
  if ($("newMemberRate")) $("newMemberRate").value = "";
  showToast("Membre ajouté !");
}

async function editMember(id) {
  if (!currentPartnerId) return;
  const m = members.find(x => x.id === id);
  if (!m) return;
  const name = prompt("Nom :", m.name || "") ?? (m.name || "");
  const rate = prompt("Taux / info :", m.rate || "") ?? (m.rate || "");
  await updateDoc(doc(db, "partners", currentPartnerId, "members", id), { name, rate, updatedAt: serverTimestamp() });
  showToast("Membre modifié !");
}

async function deleteMember(id) {
  if (!currentPartnerId) return;
  if (!confirm("Supprimer ce membre ?")) return;
  await deleteDoc(doc(db, "partners", currentPartnerId, "members", id));
  showToast("Membre supprimé !");
}

async function editPartnerInline(id) {
  const p = partners.find(x => x.id === id);
  if (!p) return;
  const name = prompt("Nom partenaire :", p.name || "") ?? (p.name || "");
  await updateDoc(doc(db, "partners", id), { name, updatedAt: serverTimestamp() });
  showToast("Partenaire modifié !");
}

async function deletePartnerInline(id) {
  if (!confirm("Supprimer ce partenaire ?")) return;
  await deleteDoc(doc(db, "partners", id));
  if (currentPartnerId === id) {
    currentPartnerId = null;
    members = [];
    renderMembers([]);
  }
  showToast("Partenaire supprimé !");
}

document.getElementById("logoutBtn")?.addEventListener("click", () => logout());

$("partnerSearch")?.addEventListener("input", applyPartnerSearch);
$("memberSearch")?.addEventListener("input", applyMemberSearch);

document.getElementById("addPartnerBtn")?.addEventListener("click", () => addPartner().catch(()=>showToast("Erreur ajout partenaire","err")));
document.getElementById("renamePartnerBtn")?.addEventListener("click", () => renamePartner().catch(()=>showToast("Erreur renommage","err")));
document.getElementById("deletePartnerBtn")?.addEventListener("click", () => deleteSelectedPartner().catch(()=>showToast("Erreur suppression","err")));
document.getElementById("refreshPartnersBtn")?.addEventListener("click", () => showToast("OK (temps réel)"));
document.getElementById("addMemberBtn")?.addEventListener("click", () => addMember().catch(()=>showToast("Erreur ajout membre","err")));

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (btn) {
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (action === "edit-partner") editPartnerInline(id).catch(()=>showToast("Erreur modif partenaire","err"));
    if (action === "del-partner") deletePartnerInline(id).catch(()=>showToast("Erreur supp partenaire","err"));
    if (action === "edit-member") editMember(id).catch(()=>showToast("Erreur modif membre","err"));
    if (action === "del-member") deleteMember(id).catch(()=>showToast("Erreur supp membre","err"));
    e.stopPropagation();
    return;
  }

  const tr = e.target.closest("tr[data-partner-id]");
  if (tr) {
    selectPartner(tr.getAttribute("data-partner-id")).catch(()=>showToast("Erreur sélection","err"));
  }
});

onSnapshot(query(partnersRef, orderBy("createdAt","desc")), (snap) => {
  partners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  applyPartnerSearch();
  // auto-select first if none selected
  if (!currentPartnerId && partners.length) {
    selectPartner(partners[0].id).catch(()=>{});
  }
});

showToast("PDM Partenaires chargé !");
renderMembers([]);
