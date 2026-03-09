// logger.js
import { db, auth } from "./config.js";
import { collection, addDoc, serverTimestamp, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/**
 * Log an action to Firestore
 * @param {string} action - Short description of the action (e.g., "ADD_CLIENT")
 * @param {string} details - Detailed description (e.g., "Added client: John Doe")
 */
export async function logAction(action, details) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    let actorName = "Inconnu";
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        actorName = snap.data().name || snap.data().fullName || user.email || "User";
      } else {
        actorName = user.email || "User";
      }
    } catch (e) {
      console.warn("Logger: could not fetch actor name", e);
    }

    await addDoc(collection(db, "logs"), {
      timestamp: serverTimestamp(),
      actorUid: user.uid,
      actorName: actorName,
      action: action,
      details: details
    });
  } catch (err) {
    console.error("Logger Error:", err);
  }
}
