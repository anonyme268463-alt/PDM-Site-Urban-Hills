import { db, auth } from "./config.js";
import {
  collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, writeBatch, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { logAction } from "./logger.js";
import { esc, renderUserBadge, normRole, getCachedCollection, clearPdmCache, fmtMoney } from "./common.js";

const elements = {
  participantsTable: document.getElementById("participantsTable"),
  winnersTable: document.getElementById("winnersTable"),
  ticketPrice: document.getElementById("ticketPrice"),
  totalTickets: document.getElementById("totalTickets"),
  totalPot: document.getElementById("totalPot"),
  totalParticipants: document.getElementById("totalParticipants"),
  drawBtn: document.getElementById("drawBtn"),
  resetBtn: document.getElementById("resetBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  addParticipantBtn: document.getElementById("addParticipantBtn"),
  pName: document.getElementById("pName"),
  pTickets: document.getElementById("pTickets"),
  pSearchDropdown: document.getElementById("pSearchDropdown"),
  voucherValue: document.getElementById("voucherValue"),
  saveVouchersBtn: document.getElementById("saveVouchersBtn"),
  logoutBtn: document.getElementById("logoutBtn")
};

let STATE = {
  participants: [],
  winners: [],
  clients: [],
  role: "staff",
  ticketPrice: 500,
  voucherValue: 100000
};

async function loadData(force = false) {
  try {
    const [pSnap, cData] = await Promise.all([
      getDocs(collection(db, "tombola_participants")),
      getCachedCollection("clients", force)
    ]);

    STATE.participants = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    STATE.clients = cData;

    renderParticipants();
    renderStats();

    // Load last winners if any
    const wSnap = await getDocs(query(collection(db, "tombola_winners"), orderBy("place", "asc")));
    STATE.winners = wSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderWinners();
  } catch (err) {
    console.error("Load error:", err);
  }
}

function renderStats() {
  const totalTickets = STATE.participants.reduce((sum, p) => sum + (Number(p.tickets) || 0), 0);
  elements.totalTickets.textContent = totalTickets;
  const price = Number(elements.ticketPrice.value || 500);
  elements.totalPot.textContent = fmtMoney(totalTickets * price);
  elements.totalParticipants.textContent = STATE.participants.length;
}

function renderParticipants() {
  if (STATE.participants.length === 0) {
    elements.participantsTable.innerHTML = `<tr><td colspan="2" class="muted">Aucun participant</td></tr>`;
    return;
  }
  elements.participantsTable.innerHTML = STATE.participants
    .sort((a,b) => (b.tickets || 0) - (a.tickets || 0))
    .map(p => `
      <tr>
        <td>${esc(p.name)}</td>
        <td>${p.tickets}</td>
      </tr>
    `).join("");
}

function renderWinners() {
  if (STATE.winners.length === 0) {
    elements.winnersTable.innerHTML = `<tr><td colspan="5" class="muted">Aucun tirage effectué</td></tr>`;
    elements.saveVouchersBtn.classList.add("hidden");
    return;
  }
  elements.winnersTable.innerHTML = STATE.winners.map(w => `
    <tr>
      <td>${w.place}</td>
      <td>${esc(w.name)}</td>
      <td>${fmtMoney(w.voucherValue || STATE.voucherValue)}</td>
      <td>${fmtMoney(w.used || 0)}</td>
      <td>${fmtMoney((w.voucherValue || STATE.voucherValue) - (w.used || 0))}</td>
    </tr>
  `).join("");

  if (STATE.role === "admin") {
      elements.saveVouchersBtn.classList.remove("hidden");
  }
}

function updateSearchDropdown() {
  const q = elements.pName.value.trim().toLowerCase();
  if (!q) {
    elements.pSearchDropdown.classList.add("hidden");
    return;
  }
  const filtered = STATE.clients
    .filter(c => (c.name || "").toLowerCase().includes(q))
    .slice(0, 8);

  if (filtered.length === 0) {
    elements.pSearchDropdown.classList.add("hidden");
    return;
  }

  elements.pSearchDropdown.innerHTML = filtered
    .map(c => `<div data-name="${esc(c.name)}">${esc(c.name)}</div>`)
    .join("");
  elements.pSearchDropdown.classList.remove("hidden");
}

elements.pName.addEventListener("input", updateSearchDropdown);
elements.pName.addEventListener("focus", updateSearchDropdown);
elements.ticketPrice.addEventListener("input", renderStats);
elements.voucherValue.addEventListener("input", () => {
  STATE.voucherValue = Number(elements.voucherValue.value || 100000);
});

elements.pSearchDropdown.addEventListener("click", e => {
  const div = e.target.closest("div");
  if (div && div.dataset.name) {
    elements.pName.value = div.dataset.name;
    elements.pSearchDropdown.classList.add("hidden");
  }
});

document.addEventListener("click", e => {
  if (!elements.pName.contains(e.target) && !elements.pSearchDropdown.contains(e.target)) {
    elements.pSearchDropdown.classList.add("hidden");
  }
});

async function addParticipant() {
  const name = elements.pName.value.trim();
  const tickets = parseInt(elements.pTickets.value) || 0;
  if (!name || tickets <= 0) return alert("Nom et nombre de tickets valides requis.");

  try {
    const existing = STATE.participants.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      await updateDoc(doc(db, "tombola_participants", existing.id), {
        tickets: existing.tickets + tickets
      });
    } else {
      await addDoc(collection(db, "tombola_participants"), {
        name,
        tickets,
        createdAt: serverTimestamp()
      });
    }
    elements.pName.value = "";
    elements.pTickets.value = "1";
    await loadData();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'ajout.");
  }
}

async function resetTombola() {
  if (STATE.role !== "admin") return alert("Accès refusé.");
  if (!confirm("Réinitialiser toute la tombola (participants et gagnants) ?")) return;

  try {
    const pSnap = await getDocs(collection(db, "tombola_participants"));
    const wSnap = await getDocs(collection(db, "tombola_winners"));

    let batch = writeBatch(db);
    let count = 0;

    const allDocs = [...pSnap.docs, ...wSnap.docs];

    for (const d of allDocs) {
      batch.delete(d.ref);
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) await batch.commit();

    STATE.participants = [];
    STATE.winners = [];
    renderParticipants();
    renderWinners();
    renderStats();
    alert("Tombola réinitialisée.");
  } catch (err) {
    console.error(err);
    alert("Erreur lors de la réinitialisation.");
  }
}

function runWeightedDraw() {
    if (STATE.participants.length < 1) return alert("Il faut au moins un participant.");
    if (STATE.role !== "admin") return alert("Accès réservé aux administrateurs.");

    const vVal = Number(elements.voucherValue.value || 100000);

    // Pool creation: each participant appears 'tickets' times
    let pool = [];
    STATE.participants.forEach(p => {
        for(let i=0; i < p.tickets; i++) {
            pool.push(p.name);
        }
    });

    // Shuffle pool
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    let winners = [];
    let tempPool = [...pool];

    // Pick 10 unique winners (or less if not enough participants)
    const maxWinners = Math.min(10, STATE.participants.length);

    while (winners.length < maxWinners && tempPool.length > 0) {
        const idx = Math.floor(Math.random() * tempPool.length);
        const picked = tempPool[idx];
        if (!winners.includes(picked)) {
            winners.push(picked);
        }
        // Remove all instances of this winner to ensure uniqueness
        tempPool = tempPool.filter(name => name !== picked);
    }

    STATE.winners = winners.map((name, index) => ({
        place: index + 1,
        name: name,
        voucherValue: vVal,
        used: 0
    }));

    renderWinners();
}

async function saveWinners() {
    if (STATE.winners.length === 0) return;
    if (STATE.role !== "admin") return;

    try {
        let batch = writeBatch(db);
        let count = 0;

        // Clear old winners first
        const wSnap = await getDocs(collection(db, "tombola_winners"));
        for (const d of wSnap.docs) {
          batch.delete(d.ref);
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }

        // Add new winners and create Vouchers
        for (const w of STATE.winners) {
            const wRef = doc(collection(db, "tombola_winners"));
            batch.set(wRef, {
                ...w,
                createdAt: serverTimestamp()
            });
            count++;

            // Find client ID for voucher if exists
            const client = STATE.clients.find(c => c.name.toLowerCase() === w.name.toLowerCase());

            const vRef = doc(collection(db, "vouchers"));
            batch.set(vRef, {
                clientId: client ? client.id : null,
                clientName: w.name,
                initialValue: w.voucherValue,
                currentValue: w.voucherValue,
                type: "Tombola Reward",
                createdAt: serverTimestamp(),
                active: true
            });
            count++;

            if (count >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
        }

        if (count > 0) await batch.commit();

        // Calculate Revenue and record in Cashbook
        const totalTickets = STATE.participants.reduce((sum, p) => sum + (Number(p.tickets) || 0), 0);
        const price = Number(elements.ticketPrice.value || 500);
        const revenue = totalTickets * price;

        if (revenue > 0) {
          await addDoc(collection(db, "cashbook"), {
            date: serverTimestamp(),
            type: "other",
            reason: `Revenus Tombola (${totalTickets} tickets)`,
            amount: revenue,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: auth.currentUser?.uid || null
          });
        }

        await logAction("TOMBOLA_DRAW", `Tirage effectué: ${STATE.winners.length} gagnants. Revenus: ${revenue}`);
        alert("Gagnants enregistrés et Bons d'achat générés !");
    } catch (err) {
        console.error(err);
        alert("Erreur lors de l'enregistrement des gagnants.");
    }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }

  const uSnap = await getDoc(doc(db, "users", user.uid));
  if (uSnap.exists()) {
    const userData = uSnap.data();
    STATE.role = normRole(userData.role || userData.rank);
    renderUserBadge(userData);
  }

  if (STATE.role !== "admin") {
      elements.drawBtn.classList.add("hidden");
      elements.resetBtn.classList.add("hidden");
      elements.ticketPrice.readOnly = true;
      elements.voucherValue.readOnly = true;
  }

  loadData();
});

elements.addParticipantBtn.addEventListener("click", addParticipant);
elements.drawBtn.addEventListener("click", runWeightedDraw);
elements.resetBtn.addEventListener("click", resetTombola);
elements.refreshBtn.addEventListener("click", () => loadData(true));
elements.saveVouchersBtn.addEventListener("click", saveWinners);
elements.logoutBtn?.addEventListener("click", () => signOut(auth));
