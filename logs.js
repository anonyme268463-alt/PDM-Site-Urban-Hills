import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  collection, getDocs, query, orderBy, limit, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { checkIsAdmin, showDenyScreen, esc, renderUserBadge } from "./common.js";

const logoutBtn = document.getElementById("logoutBtn");
const logsTableBody = document.getElementById("logsTableBody");
const logSearch = document.getElementById("logSearch");
const refreshBtn = document.getElementById("refreshBtn");

let currentLogs = [];

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
    logsTableBody.innerHTML = `<tr><td colspan="4" class="red">Erreur de chargement.</td></tr>`;
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
          <div style="font-weight:600">${esc(l.actorName || "Système")}</div>
          <div class="muted" style="font-size: 0.8em; font-family: monospace;">${esc(l.actorUid || "-")}</div>
        </td>
        <td><span class="badge badge-info">${esc(l.action)}</span></td>
        <td style="font-size: 0.9em;">${esc(l.details)}</td>
      </tr>
    `;
  }).join("");
}

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

logSearch?.addEventListener("input", renderLogs);
refreshBtn?.addEventListener("click", loadLogs);

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }
  try{
    if (!(await checkIsAdmin(user.uid))) {
      showDenyScreen();
    } else {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) renderUserBadge(snap.data());
      loadLogs();
    }
  } catch(e){ console.error(e); showDenyScreen(); }
});
