import { auth, db } from "./config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export async function requireAdmin() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Not authenticated");
  }

  const snap = await getDoc(doc(db, "users", user.uid));

  if (!snap.exists()) {
    throw new Error("User doc not found");
  }

  const data = snap.data();

  if ((data.role || "").toLowerCase() !== "admin") {
    throw new Error("Not admin");
  }

  return true;
}

export async function requireRole(role) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) throw new Error("User doc not found");

  const data = snap.data();
  const userRole = (data.role || "").toLowerCase();

  if (role === "admin" && userRole !== "admin") {
    throw new Error("Admin role required");
  }

  return true;
}
