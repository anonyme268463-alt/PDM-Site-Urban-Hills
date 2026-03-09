// logs.js (admin-only)
import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { escapeHtml, fmtDate } from "./common.js";

const logoutBtn = document.getElementById("logoutBtn");
const pageRoot = document.getElementById("pageRoot");
const logsTableBody = document.getElementById("logsTableBody");
const logSearch = document.getElementById("logSearch");
const refreshBtn = document.getElementById("refreshBtn");

let currentLogs = [];

// 1. Permissions & Auth
async function requireAdmin(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return false;
  const data = snap.data();
  const role = String(data.role || "staff").toLowerCase();
  const rank = String(data.rank || "staff").toLowerCase();
  const admins = ["admin", "pdg", "patron", "direction"];
  return admins.includes(role) || admins.includes(rank);
}

function deny(){
  pageRoot.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">Accès refusé</div>
      </div>
      <p class="muted" style="padding:18px">Vous n'avez pas l'autorisation de consulter cette page. Seuls les administrateurs peuvent voir les logs.</p>
    </div>
  `;
}

// 2. Data Logic
async function loadLogs() {
  if (!logsTableBody) return;
  logsTableBody.innerHTML = `<tr><td colspan="4" class="muted">Chargement...</td></tr>`;
  try {
    const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(200));
    const snap = await getDocs(q);

    currentLogs = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    renderLogs();
  } catch (e) {
    console.error(e);
    logsTableBody.innerHTML = `<tr><td colspan="4" class="red">Erreur lors du chargement des logs.</td></tr>`;
  }
}

function renderLogs() {
  if (!logsTableBody) return;
  const qStr = (logSearch?.value || "").toLowerCase().trim();

  const filtered = currentLogs.filter(l => {
    return (l.actorName || "").toLowerCase().includes(qStr) ||
           (l.action || "").toLowerCase().includes(qStr) ||
           (l.details || "").toLowerCase().includes(qStr) ||
           (l.actorUid || "").toLowerCase().includes(qStr);
  });

  if (filtered.length === 0) {
    logsTableBody.innerHTML = `<tr><td colspan="4" class="muted">Aucun log trouvé.</td></tr>`;
    return;
  }

  logsTableBody.innerHTML = filtered.map(l => {
    const d = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
    const dateStr = d.toLocaleString("fr-FR");

    return `
      <tr>
        <td style="white-space: nowrap;">${dateStr}</td>
        <td>
          <div style="font-weight:600">${escapeHtml(l.actorName || "Système")}</div>
          <div class="muted" style="font-size: 0.8em; font-family: monospace;">${l.actorUid || "-"}</div>
        </td>
        <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td>
        <td style="font-size: 0.9em;">${escapeHtml(l.details)}</td>
      </tr>
    `;
  }).join("");
}

// 3. Events
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

logSearch?.addEventListener("input", renderLogs);
refreshBtn?.addEventListener("click", loadLogs);

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }
  try{
    const ok = await requireAdmin(user);
    if (!ok) {
      deny();
    } else {
      loadLogs();
    }
  } catch(e){
    console.error(e);
    deny();
  }
});
