import { auth, db } from "./config.js";
import {
  collection, query, orderBy, onSnapshot, getDocs,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const els = {};
const $ = (id)=>document.getElementById(id);

function fmtDate(ts){
  try{
    if(!ts) return "—";
    const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds*1000) : new Date(ts));
    return d.toLocaleDateString("fr-FR");
  }catch{ return "—"; }
}
function toast(msg, kind=""){
  const t = els.toast;
  if(!t) return;
  t.className = "toast show" + (kind ? " " + kind : "");
  t.textContent = msg;
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=>t.className="toast", 2600);
}
function setModal(open){
  els.modal?.classList.toggle("is-open", !!open);
  els.modal?.setAttribute("aria-hidden", open ? "false" : "true");
  if(open) setTimeout(()=>els.mBrand?.focus(), 30);
}
function setErr(msg){
  if(!els.modalErr) return;
  if(!msg){ els.modalErr.style.display="none"; els.modalErr.textContent=""; }
  else{ els.modalErr.style.display="block"; els.modalErr.textContent=msg; }
}
const safe = (v)=> (v==null?"":String(v));
const norm = (s)=>safe(s).toLowerCase().trim();

let unsubStock=null, unsubRes=null;
let stockRows=[], resRows=[];

function pillStatus(status){
  const s=(status||"").toLowerCase();
  if(s==="reserved") return '<span class="pill gold">Réservé</span>';
  if(s==="pending") return '<span class="pill">En attente</span>';
  if(s==="done") return '<span class="pill good">Terminé</span>';
  if(s==="canceled") return '<span class="pill bad">Annulé</span>';
  return '<span class="pill">—</span>';
}

function renderStock(rows){
  const tb=els.stockTbody; if(!tb) return;
  if(!rows.length){ tb.innerHTML='<tr><td colspan="5" class="small">Aucune ligne.</td></tr>'; return; }
  tb.innerHTML = rows.map(r=>`
    <tr>
      <td>${safe(r.brand)}</td>
      <td>${safe(r.model)}</td>
      <td>${Number(r.qty)||0}</td>
      <td class="small">${fmtDate(r.createdAt)}</td>
      <td style="text-align:right;">
        <div class="t-actions">
          <button class="btn" data-edit="stock" data-id="${r.id}">Modifier</button>
          <button class="btn btn--danger" data-del="stock" data-id="${r.id}">Supprimer</button>
        </div>
      </td>
    </tr>`).join("");
}

function renderRes(rows){
  const tb=els.resTbody; if(!tb) return;
  if(!rows.length){ tb.innerHTML='<tr><td colspan="7" class="small">Aucune réservation.</td></tr>'; return; }
  tb.innerHTML = rows.map(r=>`
    <tr>
      <td>${safe(r.brand)}</td>
      <td>${safe(r.model)}</td>
      <td>${safe(r.clientName)}</td>
      <td>${Number(r.qty)||0}</td>
      <td>${pillStatus(r.status)}</td>
      <td class="small">${fmtDate(r.createdAt)}</td>
      <td style="text-align:right;">
        <div class="t-actions">
          <button class="btn" data-edit="res" data-id="${r.id}">Modifier</button>
          <button class="btn btn--danger" data-del="res" data-id="${r.id}">Supprimer</button>
        </div>
      </td>
    </tr>`).join("");
}

function updateKpis(sRows, rRows){
  const qty = sRows.reduce((a,x)=>a+(Number(x.qty)||0),0);
  const active = rRows.filter(x=>!["done","canceled"].includes((x.status||"").toLowerCase())).length;
  if(els.kQty) els.kQty.textContent = qty;
  if(els.kLines) els.kLines.textContent = sRows.length;
  if(els.kRes) els.kRes.textContent = active;
}

function applyFilter(){
  const q = norm(els.q?.value);
  const s = q ? stockRows.filter(r=> norm(r.brand).includes(q) || norm(r.model).includes(q)) : stockRows;
  const r = q ? resRows.filter(x=> norm(x.brand).includes(q) || norm(x.model).includes(q) || norm(x.clientName).includes(q)) : resRows;
  renderStock(s); renderRes(r); updateKpis(s,r);
}

function start(){
  unsubStock?.(); unsubRes?.();

  unsubStock = onSnapshot(
    query(collection(db,"stock"), orderBy("createdAt","desc")),
    (snap)=>{ stockRows=snap.docs.map(d=>({id:d.id,...d.data()})); applyFilter(); },
    (err)=>{ console.error(err); toast("Erreur lecture stock (permissions?)","bad"); }
  );

  unsubRes = onSnapshot(
    query(collection(db,"reservations"), orderBy("createdAt","desc")),
    (snap)=>{ resRows=snap.docs.map(d=>({id:d.id,...d.data()})); applyFilter(); },
    (err)=>{ console.error(err); toast("Erreur lecture réservations (permissions?)","bad"); }
  );
}

async function refreshOnce(){
  try{
    const [sSnap,rSnap] = await Promise.all([
      getDocs(query(collection(db,"stock"), orderBy("createdAt","desc"))),
      getDocs(query(collection(db,"reservations"), orderBy("createdAt","desc")))
    ]);
    stockRows=sSnap.docs.map(d=>({id:d.id,...d.data()}));
    resRows=rSnap.docs.map(d=>({id:d.id,...d.data()}));
    applyFilter();
    toast("Données rafraîchies","good");
  }catch(e){ console.error(e); toast("Impossible de rafraîchir","bad"); }
}

function openModal({type,mode,data}){
  const isRes = type==="res";
  els.mType.value=type;
  els.mId.value=data?.id||"";
  els.modalTitle.textContent = (mode==="edit"?"Modifier ":"Ajouter ") + (isRes?"réservation":"stock");
  if(els.mClientField) els.mClientField.style.display = isRes ? "" : "none";
  if(els.mStatusWrap) els.mStatusWrap.style.display = isRes ? "" : "none";
  els.mBrand.value=safe(data?.brand||"");
  els.mModel.value=safe(data?.model||"");
  els.mQty.value=String(Number(data?.qty ?? 1) || 0);
  if(isRes){
    els.mClient.value=safe(data?.clientName||"");
    els.mStatus.value=safe(data?.status||"reserved");
  }else{
    els.mClient.value=""; els.mStatus.value="reserved";
  }
  setErr(""); setModal(true);
}

async function saveModal(){
  const type=els.mType.value;
  const id=els.mId.value;
  const isRes = type==="res";

  const brand=els.mBrand.value.trim();
  const model=els.mModel.value.trim();
  const qty=Number(els.mQty.value);

  if(!brand||!model||Number.isNaN(qty)||qty<0){ setErr("Merci de remplir Marque / Modèle et une quantité valide."); return; }

  const payload={ brand, model, qty, updatedAt: serverTimestamp() };

  if(isRes){
    const clientName=els.mClient.value.trim();
    if(!clientName){ setErr("Merci de renseigner le nom du client."); return; }
    payload.clientName=clientName;
    payload.status=els.mStatus.value||"reserved";
  }

  try{
    if(id){
      await updateDoc(doc(db, isRes?"reservations":"stock", id), payload);
      toast("Modifié","good");
    }else{
      payload.createdAt=serverTimestamp();
      await addDoc(collection(db, isRes?"reservations":"stock"), payload);
      toast("Ajouté","good");
    }
    setModal(false);
  }catch(e){ console.error(e); setErr("Erreur Firebase : " + (e?.message||"inconnue")); }
}

async function delItem(type,id){
  const isRes = type==="res";
  if(!confirm("Supprimer définitivement ?")) return;
  try{
    await deleteDoc(doc(db, isRes?"reservations":"stock", id));
    toast("Supprimé","good");
  }catch(e){ console.error(e); toast("Suppression impossible","bad"); }
}

document.addEventListener("DOMContentLoaded", ()=>{
  ["q","btnRefresh","btnAddStock","btnAddRes","btnLogout",
   "stockTbody","resTbody","kQty","kLines","kRes",
   "modal","modalTitle","modalSave","modalErr",
   "mType","mId","mBrand","mModel","mQty","mClient","mStatus","mClientField","mStatusWrap",
   "toast"
  ].forEach(id=>els[id]=$(id));

  els.q?.addEventListener("input", applyFilter);
  els.btnRefresh?.addEventListener("click", refreshOnce);
  els.btnAddStock?.addEventListener("click", ()=>openModal({type:"stock",mode:"add",data:{}}));
  els.btnAddRes?.addEventListener("click", ()=>openModal({type:"res",mode:"add",data:{}}));
  els.modalSave?.addEventListener("click", saveModal);
  els.modal?.addEventListener("click", (e)=>{ if(e.target===els.modal) setModal(false); });
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") setModal(false); });

  document.addEventListener("click",(e)=>{
    const t=e.target;
    if(!(t instanceof HTMLElement)) return;

    if(t.hasAttribute("data-close")) setModal(false);

    const edit=t.getAttribute("data-edit");
    const del=t.getAttribute("data-del");
    const id=t.getAttribute("data-id");

    if(edit && id){
      if(edit==="stock"){
        const row=stockRows.find(x=>x.id===id); if(row) openModal({type:"stock",mode:"edit",data:row});
      }else if(edit==="res"){
        const row=resRows.find(x=>x.id===id); if(row) openModal({type:"res",mode:"edit",data:row});
      }
    }
    if(del && id){
      if(del==="stock") delItem("stock",id);
      if(del==="res") delItem("res",id);
    }
  });

  els.btnLogout?.addEventListener("click", async ()=>{
    try{ await signOut(auth); location.href="pdm-staff.html"; }
    catch(e){ console.error(e); toast("Déconnexion impossible","bad"); }
  });

  start();
});
