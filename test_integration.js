import { db } from "./config.js";
import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

async function testCRUD() {
  console.log("Starting CRUD Test...");
  const colRef = collection(db, "vehiclescatalogue");
  const testVehicle = {
    brand: "TEST_BRAND",
    model: "TEST_MODEL",
    type: "TEST_TYPE",
    price: 999999,
    places: 4,
    vitessemax: 500,
    classe: "S",
    urlimagevehicule: "https://via.placeholder.com/150",
    isTest: true
  };

  try {
    // 1. Create
    console.log("Creating test vehicle...");
    const docRef = await addDoc(colRef, testVehicle);
    console.log("Test vehicle created with ID:", docRef.id);

    // 2. Read
    console.log("Verifying creation...");
    const q = query(colRef, where("brand", "==", "TEST_BRAND"));
    const snap = await getDocs(q);
    if (!snap.empty) {
      console.log("Verified: Test vehicle found in Firestore.");
    } else {
      throw new Error("Test vehicle NOT found after creation.");
    }

    // 3. Delete
    console.log("Cleaning up test vehicle...");
    await deleteDoc(doc(db, "vehiclescatalogue", docRef.id));
    console.log("Test vehicle deleted.");

    console.log("CRUD Test Passed Successfully!");
  } catch (e) {
    console.error("CRUD Test Failed:", e);
  }
}

// Check if running in browser
if (typeof window !== 'undefined') {
    testCRUD();
}
