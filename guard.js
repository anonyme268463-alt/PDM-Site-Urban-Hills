// guard.js
import { auth } from "./config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

export function requireAuth(redirectTo = "./pdm-staff.html") {
  onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = redirectTo;
  });
}
