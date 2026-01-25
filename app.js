// Sidebar helpers (déco + lien actif)
// NOTE: on ne met PAS firebase ici signalé, car chaque page a déjà son init/auth.
// Donc ici on fait simple: bouton logout déclenche un event, et chaque page le gère.

export function wireSidebar({ onLogout } = {}){
  const logoutBtn = document.getElementById("logoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", async () => {
      try{
        if(onLogout) await onLogout();
      }catch(e){
        console.error(e);
      }
    });
  }

  // highlight lien actif
  const file = location.pathname.split("/").pop();
  document.querySelectorAll(".sb-link").forEach(a=>{
    if(a.getAttribute("href") === file){
      a.style.background = "rgba(212,175,55,.10)";
      a.style.borderColor = "rgba(212,175,55,.35)";
    }
  });
}
