import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);

function toDateSafe(ts) { try { return ts?.toDate?.() || null; } catch { return null; } }
function fmtDate(ts) { const d = toDateSafe(ts); return d ? d.toLocaleDateString("fr-FR") : "-"; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function openModal(el) { el.classList.remove("hidden"); }
function closeModal(el) { el.classList.add("hidden"); }

const partnersBody = $("partnersBody");
const membersBody = $("membersBody");
const search = $("search");

const statPartners = $("statPartners");
const statMembers = $("statMembers");
const statActive = $("statActive");

const refreshBtn = $("refreshBtn");
const addPartnerBtn = $("addPartnerBtn");
const logoutBtn = $("logoutBtn");

const partnerModal = $("partnerModal");
const pmTitle = $("pmTitle");
const pmSub = $("pmSub");
const pmClose = $("pmClose");
const pmCancel = $("pmCancel");
const pmSave = $("pmSave");
const pmDelete = $("pmDelete");
const pmName = $("pmName");
const pmActive = $("pmActive");
const addMemberBtn = $("addMemberBtn");

const memberModal = $("memberModal");
const mmTitle = $("mmTitle");
const mmClose = $("mmClose");
const mmCancel = $("mmCancel");
const mmSave = $("mmSave");
const mmFullName = $("mmFullName");
const mmClientId = $("mmClientId");
const mmRate = $("mmRate");

let PARTNERS = [];
let OPEN_PARTNER_ID = null;
let OPEN_MEMBERS = [];
let MEMBER_EDIT = { mode: "create", id: null };

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

[pmClose, pmCancel].forEach((b) => b?.addEventListener("click", () => closeModal(partnerModal)));
partnerModal?.addEventListener("click", (e) => { if (e.target === partnerModal) closeModal(partnerModal); });

[mmClose, mmCancel].forEach((b) => b?.addEventListener("click", () => closeModal(memberModal)));
memberModal?.addEventListener("click", (e) => { if (e.target === memberModal) closeModal(memberModal); });

async function loadPartners() {
  partnersBody.innerHTML = `<tr><td colspan="6">Chargement...</td></tr>`;
  const snap = await getDocs(collection(db, "partners"));
  const base = snap.docs.map((d) => ({ id: d.id, ...d.data(), membersCount: 0 }));

  for (const p of base) {
    try {
      const ms = await getDocs(collection(db, "partners", p.id, "members"));
      p.membersCount = ms.size;
    } catch { p.membersCount = 0; }
  }

  PARTNERS = base;
  renderPartners();
}

function renderPartners() {
  const q = (search?.value || "").trim().toLowerCase();

  const list = PARTNERS
    .filter((p) => {
      const name = (p.name || "").toLowerCase();
      const nk = (p.nameKey || "").toLowerCase();
      return !q || name.includes(q) || nk.includes(q);
    })
    .sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));

  statPartners.textContent = String(list.length);
  statMembers.textContent = String(list.reduce((s, p) => s + (p.membersCount || 0), 0));
  statActive.textContent = String(list.filter((p) => p.active === true).length);

  if (!list.length) {
    partnersBody.innerHTML = `<tr><td colspan="6">Aucun partenaire</td></tr>`;
    return;
  }

  partnersBody.innerHTML = list.map((p) => `
    <tr>
      <td>${esc(p.name || "-")}</td>
      <td>${p.active ? `<span class="pill pill-ok">Oui</span>` : `<span class="pill pill-no">Non</span>`}</td>
      <td>${p.membersCount ?? 0}</td>
      <td>${fmtDate(p.createdAt)}</td>
      <td>${fmtDate(p.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn btn-gold" data-open="${p.id}">Voir</button>
        <button class="btn" data-open="${p.id}">Modifier</button>
      </td>
    </tr>
  `).join("");

  partnersBody.querySelectorAll("[data-open]").forEach((b) => {
    b.addEventListener("click", () => openPartner(b.getAttribute("data-open")));
  });
}

async function openPartner(partnerId) {
  OPEN_PARTNER_ID = partnerId;

  const p = PARTNERS.find((x) => x.id === partnerId);
  pmTitle.textContent = p?.name ? `Partenaire — ${p.name}` : "Partenaire";
  pmSub.textContent = `ID : ${partnerId}`;
  pmName.value = p?.name || "";
  pmActive.checked = p?.active === true;

  await loadMembers(partnerId);
  openModal(partnerModal);
}

async function loadMembers(partnerId) {
  membersBody.innerHTML = `<tr><td colspan="6">Chargement...</td></tr>`;
  const snap = await getDocs(collection(db, "partners", partnerId, "members"));
  const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  for (const m of members) {
    m.displayName = m.fullName || "-";
    if (m.clientId) {
      try {
        const c = await getDoc(doc(db, "clients", m.clientId));
        if (c.exists() && c.data()?.name) m.displayName = c.data().name;
      } catch {}
    }
  }

  OPEN_MEMBERS = members.sort((a, b) => (toDateSafe(b.createdAt)?.getTime() || 0) - (toDateSafe(a.createdAt)?.getTime() || 0));
  renderMembers();
}

function renderMembers() {
  if (!OPEN_MEMBERS.length) {
    membersBody.innerHTML = `<tr><td colspan="6">Aucun client partenaire</td></tr>`;
    return;
  }

  membersBody.innerHTML = OPEN_MEMBERS.map((m) => `
    <tr>
      <td>${esc(m.displayName || "-")}</td>
      <td>${esc(m.clientId || "-")}</td>
      <td>${esc(m.rate ?? 0)}</td>
      <td>${fmtDate(m.createdAt)}</td>
      <td>${fmtDate(m.updatedAt)}</td>
      <td style="text-align:right;">
        <button class="btn" data-edit="${m.id}">Modifier</button>
        <button class="btn btn-danger" data-del="${m.id}">Supprimer</button>
      </td>
    </tr>
  `).join("");

  membersBody.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-edit");
      const m = OPEN_MEMBERS.find((x) => x.id === id);
      openMemberModal("edit", m);
    });
  });

  membersBody.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-del");
      if (!confirm("Supprimer ce client de ce partenaire ?")) return;
      await deleteDoc(doc(db, "partners", OPEN_PARTNER_ID, "members", id));
      await loadPartners();
      await loadMembers(OPEN_PARTNER_ID);
    });
  });
}

pmSave?.addEventListener("click", async () => {
  if (!OPEN_PARTNER_ID) return;

  const name = (pmName.value || "").trim();
  if (!name) return alert("Nom obligatoire.");

  pmSave.disabled = true;
  try {
    await updateDoc(doc(db, "partners", OPEN_PARTNER_ID), {
      name,
      nameKey: name.toLowerCase(),
      active: pmActive.checked,
      updatedAt: serverTimestamp(),
    });
    await loadPartners();
    const p = PARTNERS.find((x) => x.id === OPEN_PARTNER_ID);
    pmTitle.textContent = p?.name ? `Partenaire — ${p.name}` : "Partenaire";
  } finally {
    pmSave.disabled = false;
  }
});

pmDelete?.addEventListener("click", async () => {
  if (!OPEN_PARTNER_ID) return;
  if (!confirm("Supprimer ce partenaire ?")) return;

  pmDelete.disabled = true;
  try {
    await deleteDoc(doc(db, "partners", OPEN_PARTNER_ID));
    closeModal(partnerModal);
    await loadPartners();
  } finally {
    pmDelete.disabled = false;
  }
});

addPartnerBtn?.addEventListener("click", async () => {
  const name = prompt("Nom du partenaire ?");
  if (!name) return;

  await addDoc(collection(db, "partners"), {
    name: name.trim(),
    nameKey: name.trim().toLowerCase(),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await loadPartners();
});

function openMemberModal(mode, member) {
  MEMBER_EDIT = { mode, id: member?.id || null };
  mmTitle.textContent = mode === "edit" ? "Modifier client partenaire" : "Ajouter client partenaire";
  mmFullName.value = member?.fullName || member?.displayName || "";
  mmClientId.value = member?.clientId || "";
  mmRate.value = String(member?.rate ?? 0);
  openModal(memberModal);
}

addMemberBtn?.addEventListener("click", () => openMemberModal("create"));

mmSave?.addEventListener("click", async () => {
  if (!OPEN_PARTNER_ID) return;

  const fullName = (mmFullName.value || "").trim();
  const clientId = (mmClientId.value || "").trim();
  const rate = Number(mmRate.value || 0);

  if (!fullName && !clientId) return alert("Met un nom affiché OU un clientId.");
  if (Number.isNaN(rate) || rate < 0) return alert("Taux invalide.");

  mmSave.disabled = true;
  try {
    const payload = {
      fullName: fullName || "",
      nameKey: (fullName || "").toLowerCase(),
      clientId: clientId || null,
      rate,
      updatedAt: serverTimestamp(),
    };

    if (MEMBER_EDIT.mode === "create") {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "partners", OPEN_PARTNER_ID, "members"), payload);
    } else {
      await updateDoc(doc(db, "partners", OPEN_PARTNER_ID, "members", MEMBER_EDIT.id), payload);
    }

    closeModal(memberModal);
    await loadPartners();
    await loadMembers(OPEN_PARTNER_ID);
  } finally {
    mmSave.disabled = false;
  }
});

search?.addEventListener("input", renderPartners);
refreshBtn?.addEventListener("click", loadPartners);

loadPartners();
