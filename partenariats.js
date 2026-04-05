import { db, auth } from "./config.js";
import {
  addDoc,
  auth,
  checkIsAdmin,
  collection,
  deleteDoc,
  doc,
  esc } from "./common.js";
import { db,
  getDoc,
  getDocs,
  logAction } from "./config.js";
import {
  partners,
  onSnapshot,
  orderBy,
  query,
  renderUserBadge,
  serverTimestamp,
  showDenyScreen,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  esc, checkIsAdmin, showDenyScreen, renderUserBadge
} from "./common.js";
import { logAction } from "./logger.js";

// DOM Elements
const elements = {
  statPartners: document.getElementById("statPartners"),
  statMembers: document.getElementById("statMembers"),
  statActive: document.getElementById("statActive"),
  search: document.getElementById("search"),
  refreshBtn: document.getElementById("refreshBtn"),
  addPartnerBtn: document.getElementById("addPartnerBtn"),
  partnersTable: document.getElementById("partnersTable"),

  partnerModal: document.getElementById("partnerModal"),
  pmTitle: document.getElementById("pmTitle"),
  pmClose: document.getElementById("pmClose"),
  pmName: document.getElementById("pmName"),
  pmActive: document.getElementById("pmActive"),
  pmSave: document.getElementById("pmSave"),
  pmDelete: document.getElementById("pmDelete"),
  pmId: document.getElementById("pmId"),
  pmCancel: document.getElementById("pmCancel"),
  addMemberBtn: document.getElementById("addMemberBtn"),
  membersTable: document.getElementById("membersTable"),

  addPartnerModal: document.getElementById("addPartnerModal"),
  apmClose: document.getElementById("apmClose"),
  apmName: document.getElementById("apmName"),
  apmCancel: document.getElementById("apmCancel"),
  apmSave: document.getElementById("apmSave"),

  memberModal: document.getElementById("memberModal"),
  mmTitle: document.getElementById("mmTitle"),
  mmClose: document.getElementById("mmClose"),
  mmFullName: document.getElementById("mmFullName"),
  mmClientId: document.getElementById("mmClientId"),
  mmRate: document.getElementById("mmRate"),
  mmId: document.getElementById("mmId"),
  mmCancel: document.getElementById("mmCancel"),
  mmSave: document.getElementById("mmSave"),

  logoutBtn: document.getElementById("logoutBtn")
};

let ALL_PARTNERS = [];
let CURRENT_PARTNER_ID = null;
let PARTNER_MEMBERS = [];
let unsubPartners = null;
let unsubMembers = null;

function hideAllModals() {
  elements.partnerModal.classList.add("hidden");
  elements.addPartnerModal.classList.add("hidden");
  elements.memberModal.classList.add("hidden");
}

function fmtDate(ts) {
  if (!ts) return "-";
  if (ts.seconds === undefined && !(ts instanceof Date)) return "...";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("fr-FR", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return "-";
  }
}

// --- PARTNERS ---

function initPartnersListener() {
  if (unsubPartners) unsubPartners();

  elements.partnersTable.innerHTML = '<tr><td colspan="6" class="muted">Chargement...</td></tr>';

  const q = query(collection(db, "partners"), orderBy("name", "asc"));

  unsubPartners = onSnapshot(q, async (snap) => {
    const partners = [];
    for (const d of snap.docs) {
      const data = { id: d.id, ...d.data() };
      // Note: This could be optimized by storing count in partner doc
      const mSnap = await getDocs(collection(db, "partners", d.id, "members"));
      data.membersCount = mSnap.size;
      partners.push(data);
    }
    ALL_PARTNERS = partners;
    renderPartners();
  }, (err) => {
    console.error("Partners error:", err);
    elements.partnersTable.innerHTML = '<tr><td colspan="6" class="red">Erreur Firestore.</td></tr>';
  });
}

function renderPartners() {
  const searchTerm = (elements.search.value || "").trim().toLowerCase();
  const filtered = ALL_PARTNERS.filter(p => (p.name || "").toLowerCase().includes(searchTerm));

  elements.statPartners.textContent = filtered.length;
  elements.statMembers.textContent = filtered.reduce((acc, p) => acc + (p.membersCount || 0), 0);
  elements.statActive.textContent = filtered.filter(p => p.active).length;

  if (filtered.length === 0) {
    elements.partnersTable.innerHTML = '<tr><td colspan="6" class="muted">Aucun partenaire trouvé.</td></tr>';
    return;
  }

  elements.partnersTable.innerHTML = filtered.map(p => `
    <tr>
      <td style="font-weight:600; color:#fff;">${esc(p.name)}</td>
      <td><span class="badge ${p.active ? "badge-success" : "badge-danger"}">${p.active ? "Actif" : "Inactif"}</span></td>
      <td>${p.membersCount || 0} membres</td>
      <td class="muted" style="font-size:12px;">${fmtDate(p.createdAt)}</td>
      <td class="muted" style="font-size:12px;">${fmtDate(p.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn btn-gold btn-sm" data-id="${p.id}" data-action="open">Gérer</button>
      </td>
    </tr>
  `).join("");

  elements.partnersTable.querySelectorAll('[data-action="open"]').forEach(btn => {
    btn.addEventListener('click', () => openPartner(btn.dataset.id));
  });
}

async function openPartner(id) {
  CURRENT_PARTNER_ID = id;
  const p = ALL_PARTNERS.find(x => x.id === id);
  if (!p) return;

  elements.pmTitle.textContent = `Partenaire : ${p.name}`;
  elements.pmId.textContent = id;
  elements.pmName.value = p.name || "";
  elements.pmActive.checked = !!p.active;

  elements.partnerModal.classList.remove("hidden");
  initMembersListener(id);
}

// --- MEMBERS ---

function initMembersListener(partnerId) {
  if (unsubMembers) unsubMembers();

  elements.membersTable.innerHTML = '<tr><td colspan="6" class="muted">Chargement...</td></tr>';

  const q = query(collection(db, "partners", partnerId, "members"), orderBy("createdAt", "desc"));

  unsubMembers = onSnapshot(q, async (snap) => {
    const members = [];
    for (const d of snap.docs) {
      const m = { id: d.id, ...d.data() };
      if (m.clientId) {
        try {
          const cSnap = await getDoc(doc(db, "clients", m.clientId));
          if (cSnap.exists()) {
            m.clientName = cSnap.data().name || cSnap.data().fullName || "Client Inconnu";
          }
        } catch (e) {}
      }
      members.push(m);
    }
    PARTNER_MEMBERS = members;
    renderMembers();
  });
}

function renderMembers() {
  if (PARTNER_MEMBERS.length === 0) {
    elements.membersTable.innerHTML = '<tr><td colspan="6" class="muted">Aucun membre pour ce partenaire.</td></tr>';
    return;
  }

  elements.membersTable.innerHTML = PARTNER_MEMBERS.map(m => `
    <tr>
      <td>${esc(m.clientName || m.fullName || "Inconnu")}</td>
      <td style="font-family:monospace; font-size:12px;">${esc(m.clientId || "-")}</td>
      <td style="color:var(--accent-gold); font-weight:600;">${m.rate || 0}%</td>
      <td class="muted" style="font-size:11px;">${fmtDate(m.createdAt)}</td>
      <td class="muted" style="font-size:11px;">${fmtDate(m.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn btn-outline btn-sm" data-id="${m.id}" data-action="editMember">Modifier</button>
        <button class="btn btn-danger btn-sm" data-id="${m.id}" data-action="deleteMember">✕</button>
      </td>
    </tr>
  `).join("");

  elements.membersTable.querySelectorAll('[data-action="editMember"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = PARTNER_MEMBERS.find(x => x.id === btn.dataset.id);
      if (!m) return;
      elements.mmTitle.textContent = "Modifier Membre";
      elements.mmId.textContent = m.id;
      elements.mmFullName.value = m.fullName || "";
      elements.mmClientId.value = m.clientId || "";
      elements.mmRate.value = m.rate || 0;
      elements.memberModal.classList.remove("hidden");
    });
  });

  elements.membersTable.querySelectorAll('[data-action="deleteMember"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm("Supprimer ce membre ?")) return;
      try {
        await deleteDoc(doc(db, "partners", CURRENT_PARTNER_ID, "members", btn.dataset.id));
        await logAction("PARTNER_MEMBER_DELETE", `Membre supprimé du partenaire ${CURRENT_PARTNER_ID}`);
      } catch (e) { alert("Erreur."); }
    });
  });
}

// --- EVENTS ---

elements.refreshBtn?.addEventListener("click", () => initPartnersListener());
elements.search?.addEventListener("input", renderPartners);

elements.addPartnerBtn?.addEventListener("click", () => {
  elements.apmName.value = "";
  elements.addPartnerModal.classList.remove("hidden");
});

elements.apmSave?.addEventListener("click", async () => {
  const name = elements.apmName.value.trim();
  if (!name) return alert("Nom requis.");
  try {
    await addDoc(collection(db, "partners"), {
      name,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await logAction("PARTNER_ADD", `Partenaire ajouté: ${name}`);
    hideAllModals();
  } catch (e) { alert("Erreur."); }
});

elements.pmSave?.addEventListener("click", async () => {
  const name = elements.pmName.value.trim();
  if (!name) return alert("Nom requis.");
  try {
    await updateDoc(doc(db, "partners", CURRENT_PARTNER_ID), {
      name,
      active: elements.pmActive.checked,
      updatedAt: serverTimestamp()
    });
    await logAction("PARTNER_UPDATE", `Partenaire modifié: ${name}`);
    hideAllModals();
  } catch (e) { alert("Erreur."); }
});

elements.pmDelete?.addEventListener("click", async () => {
  if (!confirm("Supprimer ce partenaire et tous ses membres ?")) return;
  try {
    await deleteDoc(doc(db, "partners", CURRENT_PARTNER_ID));
    await logAction("PARTNER_DELETE", `Partenaire supprimé: ${CURRENT_PARTNER_ID}`);
    hideAllModals();
  } catch (e) { alert("Erreur."); }
});

elements.addMemberBtn?.addEventListener("click", () => {
  elements.mmTitle.textContent = "Ajouter Membre";
  elements.mmId.textContent = "";
  elements.mmFullName.value = "";
  elements.mmClientId.value = "";
  elements.mmRate.value = 0;
  elements.memberModal.classList.remove("hidden");
});

elements.mmSave?.addEventListener("click", async () => {
  const fullName = elements.mmFullName.value.trim();
  const clientId = elements.mmClientId.value.trim();
  const rate = Number(elements.mmRate.value || 0);
  const mId = elements.mmId.textContent;
  if (!fullName && !clientId) return alert("Nom ou ID Client requis.");
  try {
    const data = {
      fullName,
      clientId: clientId || null,
      rate,
      updatedAt: serverTimestamp()
    };
    if (mId) {
      await updateDoc(doc(db, "partners", CURRENT_PARTNER_ID, "members", mId), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "partners", CURRENT_PARTNER_ID, "members"), data);
    }
    elements.memberModal.classList.add("hidden");
  } catch (e) { alert("Erreur."); }
});

[elements.pmClose, elements.pmCancel, elements.apmClose, elements.apmCancel, elements.mmClose, elements.mmCancel].forEach(btn => {
  btn?.addEventListener("click", hideAllModals);
});

elements.logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "pdm-staff.html";
    return;
  }
  try {
    const isAdmin = await checkIsAdmin(user.uid);
    if (!isAdmin) {
      showDenyScreen();
      return;
    }
    const qUser = query(collection(db, "users"), where("id", "==", user.uid));
    const uSnap = await getDocs(qUser);
    if (!uSnap.empty) renderUserBadge(uSnap.docs[0].data());
    initPartnersListener();
  } catch (err) {
    console.error(err);
    showDenyScreen();
  }
});
