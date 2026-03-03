// gestion.js (admin-only)
import { auth, db } from "./config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const logoutBtn = document.getElementById("logoutBtn");
const pageRoot = document.getElementById("pageRoot");

async function requireAdmin(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const role = snap.exists() ? (snap.data().role || snap.data().rank || "staff") : "staff";
  return String(role).toLowerCase() === "admin";
}

function deny(){
  pageRoot.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Accès refusé</div>
          <div class="card-sub">Vous n'avez pas l'autorisation de consulter cette page.</div>
        </div>
      </div>
      <div style="padding:18px" class="muted">Si tu penses que c'est une erreur, contacte le PDG.</div>
    </div>
  `;
}

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "pdm-staff.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "pdm-staff.html"; return; }
  try{
    const ok = await requireAdmin(user);
    if (!ok) deny();
  } catch(e){
    console.error(e);
    deny();
  }
});
