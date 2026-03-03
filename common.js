// common.js — helpers partagés (ESM)

/** getElementById */
export function $(id) {
  return document.getElementById(id);
}

/** querySelector */
export function q(sel, root = document) {
  return root.querySelector(sel);
}

/** querySelectorAll -> Array */
export function qa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function escapeHtml(v) {
  const s = String(v ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * fmtDate: accepte Date, number(ms), string(ISO), Firestore Timestamp (toDate()).
 * Retour: "dd/mm/yyyy" (FR)
 */
export function fmtDate(input) {
  if (!input) return "—";

  let d = null;

  // Firestore Timestamp-like
  if (typeof input === "object" && typeof input.toDate === "function") {
    d = input.toDate();
  } else if (input instanceof Date) {
    d = input;
  } else if (typeof input === "number") {
    d = new Date(input);
  } else if (typeof input === "string") {
    const tmp = new Date(input);
    if (!Number.isNaN(tmp.getTime())) d = tmp;
  }

  if (!d || Number.isNaN(d.getTime())) return "—";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export function fmtMoney(value, currency = "$") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    // look "PDM" style: $123,456
    return (
      currency +
      Math.round(n).toLocaleString("en-US", {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      })
    );
  } catch {
    return currency + String(Math.round(n));
  }
}

/**
 * Toast minimal (sans dépendre du CSS)
 * type: info | ok | warn | err
 */
export function toast(message, type = "info", timeout = 2600) {
  injectToastStylesOnce();

  const wrapId = "pdmToastWrap";
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = wrapId;
    document.body.appendChild(wrap);
  }

  const t = document.createElement("div");
  t.className = `pdmToast pdmToast--${type}`;
  t.textContent = String(message ?? "");
  wrap.appendChild(t);

  requestAnimationFrame(() => t.classList.add("is-in"));

  const kill = () => {
    t.classList.remove("is-in");
    t.classList.add("is-out");
    setTimeout(() => t.remove(), 220);
  };

  t.addEventListener("click", kill);
  setTimeout(kill, timeout);
}

let __toastCssInjected = false;
function injectToastStylesOnce() {
  if (__toastCssInjected) return;
  __toastCssInjected = true;

  const style = document.createElement("style");
  style.textContent = `
#pdmToastWrap{
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pdmToast{
  min-width: 240px;
  max-width: 360px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(15,18,28,.78);
  backdrop-filter: blur(10px);
  color: rgba(255,255,255,.92);
  font: 600 13px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  box-shadow: 0 14px 40px rgba(0,0,0,.35);
  transform: translateY(10px);
  opacity: 0;
  transition: transform .18s ease, opacity .18s ease, filter .18s ease;
  cursor: pointer;
}
.pdmToast.is-in{ transform: translateY(0); opacity: 1; }
.pdmToast.is-out{ transform: translateY(6px); opacity: 0; filter: blur(1px); }

.pdmToast--ok{ border-color: rgba(88, 255, 160, .22); }
.pdmToast--warn{ border-color: rgba(255, 200, 88, .22); }
.pdmToast--err{ border-color: rgba(255, 88, 88, .22); }
`;
  document.head.appendChild(style);
}
