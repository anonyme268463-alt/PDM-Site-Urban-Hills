// stock.js (compatible avec le dernier stock.html)
// Firestore collections: "stock" et "reservations"

import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let db;

// ---------- helpers ----------
function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toText(v) {
  if (v === true) return "Oui";
  if (v === false) return "Non";
  return v ?? "";
}

function formatDate(ts) {
  try {
    const d =
      ts?.toDate?.() ||
      (typeof ts === "number" ? new Date(ts) : ts instanceof Date ? ts : null);
    if (!d) return "-";
    return d.toLocaleDateString("fr-FR");
  } catch {
    return "-";
  }
}

function parseIntSafe(v, fallback = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function notify(msg, type = "ok") {
  // si common.js expose un toast/notify, on l’utilise
  if (typeof window.toast === "function") return window.toast(msg, type);
  if (typeof window.notify === "function") return window.notify(msg, type);

  // fallback ultra simple
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.position = "fixed";
  el.style.right = "16px";
  el.style.bottom = "16px";
  el.style.zIndex = "99999";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "12px";
  el.style.background = type === "err" ? "rgba(180,40,40,.92)" : "rgba(20,140,90,.92)";
  el.style.color = "#fff";
  el.style.fontFamily = "system-ui, Segoe UI, Arial";
  el.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

async function initDb() {
  // 1) si config.js a mis db en global (window.db)
  if (window.db) return window.db;

  // 2) sinon, on essaie de récupérer depuis config.js (quel que soit son export)
  try {
    const mod = await import("./config.js");
    if (mod.db) return mod.db;
    if (mod.default?.db) return mod.default.db;
    // si config exporte app
    if (mod.app || mod.default?.app) return getFirestore(mod.app || mod.default.app);
  } catch {
    // ignore
  }

  // 3) dernier recours: db via window.firebaseApp si tu l’as exposé
  if (window.firebaseApp) return getFirestore(window.firebaseApp);

  throw new Error(
    "Impossible d'initialiser Firestore (db). Vérifie config.js: il doit exposer 'db' ou mettre window.db."
  );
}

// ---------- state ----------
let stockRows = []; // { id, brand, model, qty, createdAt, ... }
let resRows = []; // { id, brand, model, clientName, qty, status, createdAt, ... }
let unsubStock = null;
let unsubRes = null;

const els = {
  q: $("qSearch"),
  btnRefresh: $("btnRefresh"),
  btnAddStock: $("btnAddStock"),
  btnAddReservation: $("btnAddReservation"),

  kpiStockQty: $("kpiStockQty"),
  kpiStockLines: $("kpiStockLines"),
  kpiResActive: $("kpiResActive"),

  stockTbody: $("stockTbody"),
  resTbody: $("resTbody"),

  modal: $("modal"),
  modalTitle: $("modalTitle"),
  modalSave: $("modalSave"),
  modalErr: $("modalErr"),

  mId: $("mId"),
  mType: $("mType"),
  mBrand: $("mBrand"),
  mModel: $("mModel"),
  mQty: $("mQty"),
  mClient: $("mClient"),
  mStatusWrap: $("mStatusWrap"),
  mStatus: $("mStatus"),
};

function setModalError(message) {
  if (!els.modalErr) return;
  if (!message) {
    els.modalErr.style.display = "none";
    els.modalErr.textContent = "";
  } else {
    els.modalErr.style.display = "block";
    els.modalErr.textContent = message;
  }
}

function openModal({ type, id = "", brand = "", model = "", qty = 1, clientName = "", status = "reserved" }) {
  els.mType.value = type;
  els.mId.value = id;

  els.mBrand.value = brand ?? "";
  els.mModel.value = model ?? "";
  els.mQty.value = String(qty ?? 1);

  els.mClient.value = clientName ?? "";
  els.mStatus.value = status ?? "reserved";

  const isReservation = type === "reservation";
  els.mStatusWrap.style.display = isReservation ? "" : "none";
  $("mClient")?.closest?.(".field") && ($("mClient").closest(".field").style.display = isReservation ? "" : "none");

  els.modalTitle.textContent =
    (id ? "Modifier " : "Ajouter ") + (isReservation ? "une réservation" : "une ligne de stock");

  setModalError("");
  els.modal.classList.add("is-open");
}

function closeModal() {
  els.modal.classList.remove("is-open");
  setModalError("");
}

function matchSearch(row, q) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  if (!s) return true;

  const bag = [
    row.brand,
    row.model,
    row.clientName,
    row.status,
    String(row.qty ?? ""),
    String(row.createdAt ?? ""),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return bag.includes(s);
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "reserved" || s === "réservé") return `<span class="pill pill--gold">Réservé</span>`;
  if (s === "pending" || s === "en attente") return `<span class="pill">En attente</span>`;
  if (s === "done" || s === "terminé") return `<span class="pill pill--ok">Terminé</span>`;
  if (s === "canceled" || s === "annulé") return `<span class="pill pill--danger">Annulé</span>`;
  return `<span class="pill">${esc(toText(status))}</span>`;
}

function updateKpis() {
  const totalQty = stockRows.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
  const lines = stockRows.length;

  const activeRes = resRows.filter((r) => {
    const s = String(r.status || "").toLowerCase();
    return s !== "done" && s !== "terminé" && s !== "canceled" && s !== "annulé";
  }).length;

  if (els.kpiStockQty) els.kpiStockQty.textContent = String(totalQty);
  if (els.kpiStockLines) els.kpiStockLines.textContent = String(lines);
  if (els.kpiResActive) els.kpiResActive.textContent = String(activeRes);
}

function render() {
  const q = els.q?.value || "";

  // Stock table
  const stockFiltered = stockRows.filter((r) => matchSearch(r, q));
  els.stockTbody.innerHTML =
    stockFiltered.length === 0
      ? `<tr><td colspan="5" class="muted">Aucune ligne</td></tr>`
      : stockFiltered
          .map((r) => {
            return `
            <tr>
              <td>${esc(r.brand)}</td>
              <td>${esc(r.model)}</td>
              <td>${esc(r.qty)}</td>
              <td class="muted">${esc(formatDate(r.createdAt))}</td>
              <td class="actions">
                <button class="btn btn--sm" data-action="edit-stock" data-id="${esc(r.id)}">Modifier</button>
                <button class="btn btn--sm btn--danger" data-action="del-stock" data-id="${esc(r.id)}">Supprimer</button>
              </td>
            </tr>`;
          })
          .join("");

  // Reservations table
  const resFiltered = resRows.filter((r) => matchSearch(r, q));
  els.resTbody.innerHTML =
    resFiltered.length === 0
      ? `<tr><td colspan="7" class="muted">Aucune réservation</td></tr>`
      : resFiltered
          .map((r) => {
            return `
            <tr>
              <td>${esc(r.brand)}</td>
              <td>${esc(r.model)}</td>
              <td>${esc(r.clientName || "-")}</td>
              <td>${esc(r.qty)}</td>
              <td>${statusBadge(r.status)}</td>
              <td class="muted">${esc(formatDate(r.createdAt))}</td>
              <td class="actions">
                <button class="btn btn--sm" data-action="edit-res" data-id="${esc(r.id)}">Modifier</button>
                <button class="btn btn--sm btn--danger" data-action="del-res" data-id="${esc(r.id)}">Supprimer</button>
              </td>
            </tr>`;
          })
          .join("");

  updateKpis();
}

function bindSnapshots() {
  // clean previous
  if (typeof unsubStock === "function") unsubStock();
  if (typeof unsubRes === "function") unsubRes();

  const qStock = query(collection(db, "stock"), orderBy("createdAt", "desc"));
  const qRes = query(collection(db, "reservations"), orderBy("createdAt", "desc"));

  unsubStock = onSnapshot(
    qStock,
    (snap) => {
      stockRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => {
      console.error(err);
      notify("Accès stock refusé (permissions).", "err");
    }
  );

  unsubRes = onSnapshot(
    qRes,
    (snap) => {
      resRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => {
      console.error(err);
      notify("Accès réservations refusé (permissions).", "err");
    }
  );
}

// ---------- CRUD ----------
async function saveModal() {
  const type = els.mType.value; // "stock" | "reservation"
  const id = els.mId.value;

  const brand = els.mBrand.value.trim();
  const model = els.mModel.value.trim();
  const qty = parseIntSafe(els.mQty.value, 0);

  const isReservation = type === "reservation";
  const clientName = els.mClient.value.trim();
  const status = els.mStatus.value;

  if (!brand || !model) return setModalError("Marque et modèle sont obligatoires.");
  if (!Number.isFinite(qty) || qty < 0) return setModalError("La quantité doit être un nombre (>= 0).");

  if (isReservation && !clientName) return setModalError("Le client est obligatoire pour une réservation.");

  setModalError("");

  try {
    if (isReservation) {
      const payload = {
        brand,
        model,
        qty,
        clientName,
        status: status || "reserved",
        updatedAt: serverTimestamp(),
      };

      if (id) {
        await updateDoc(doc(db, "reservations", id), payload);
        notify("Réservation mise à jour ✅");
      } else {
        await addDoc(collection(db, "reservations"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        notify("Réservation ajoutée ✅");
      }
    } else {
      const payload = {
        brand,
        model,
        qty,
        updatedAt: serverTimestamp(),
      };

      if (id) {
        await updateDoc(doc(db, "stock", id), payload);
        notify("Stock mis à jour ✅");
      } else {
        await addDoc(collection(db, "stock"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        notify("Stock ajouté ✅");
      }
    }

    closeModal();
  } catch (e) {
    console.error(e);
    const msg =
      e?.code === "permission-denied"
        ? "Action refusée (permissions)."
        : "Erreur lors de l’enregistrement.";
    setModalError(msg);
    notify(msg, "err");
  }
}

async function deleteRow(kind, id) {
  if (!id) return;
  if (!confirm("Confirmer la suppression ?")) return;

  try {
    if (kind === "stock") await deleteDoc(doc(db, "stock", id));
    else await deleteDoc(doc(db, "reservations", id));
    notify("Supprimé ✅");
  } catch (e) {
    console.error(e);
    const msg =
      e?.code === "permission-denied"
        ? "Suppression refusée (admin uniquement)."
        : "Erreur lors de la suppression.";
    notify(msg, "err");
  }
}

// ---------- events ----------
function bindEvents() {
  // Search
  els.q?.addEventListener("input", () => render());

  // Refresh (re-bind snapshots)
  els.btnRefresh?.addEventListener("click", () => {
    bindSnapshots();
    notify("Rafraîchi ✅");
  });

  // Add buttons
  els.btnAddStock?.addEventListener("click", () => openModal({ type: "stock" }));
  els.btnAddReservation?.addEventListener("click", () => openModal({ type: "reservation" }));

  // Modal close
  document.querySelectorAll("[data-close='1']").forEach((b) => b.addEventListener("click", closeModal));
  els.modal?.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.modal?.classList.contains("is-open")) closeModal();
  });

  // Modal save
  els.modalSave?.addEventListener("click", saveModal);

  // Table actions (event delegation)
  els.stockTbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const row = stockRows.find((r) => r.id === id);

    if (action === "edit-stock" && row) {
      openModal({
        type: "stock",
        id: row.id,
        brand: row.brand,
        model: row.model,
        qty: row.qty ?? 0,
      });
    }
    if (action === "del-stock") deleteRow("stock", id);
  });

  els.resTbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const row = resRows.find((r) => r.id === id);

    if (action === "edit-res" && row) {
      openModal({
        type: "reservation",
        id: row.id,
        brand: row.brand,
        model: row.model,
        qty: row.qty ?? 1,
        clientName: row.clientName ?? "",
        status: row.status ?? "reserved",
      });
    }
    if (action === "del-res") deleteRow("reservation", id);
  });
}

// ---------- boot ----------
(async function boot() {
  try {
    db = await initDb();
    bindEvents();
    bindSnapshots();
  } catch (e) {
    console.error(e);
    notify(e?.message || "Erreur d'initialisation.", "err");
  }
})();
