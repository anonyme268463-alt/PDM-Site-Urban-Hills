import { db } from "./config.js";
import { collection, getDocs, setDoc, doc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

function norm(s) {
    return (s || "").trim().toLowerCase();
}

export async function mergeCatalogueToVehicles() {
    console.log("Starting migration: vehiclescatalogue -> vehicles");

    // 1. Fetch all from catalogue
    const catSnap = await getDocs(collection(db, "vehiclescatalogue"));
    const catalog = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Found ${catalog.length} vehicles in catalogue.`);

    // 2. Fetch all current vehicles to avoid duplicates and map them
    const vehSnap = await getDocs(collection(db, "vehicles"));
    const existingVehicles = vehSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Found ${existingVehicles.length} existing vehicles in 'vehicles' collection.`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const catItem of catalog) {
        const brand = norm(catItem.brand);
        const model = norm(catItem.model);

        // Find if it already exists in 'vehicles'
        const existing = existingVehicles.find(v => norm(v.brand) === brand && norm(v.model) === model);

        const vehicleData = {
            brand: catItem.brand,
            model: catItem.model,
            type: catItem.type || "",
            classe: catItem.classe || "",
            places: Number(catItem.places || 0),
            vitessemax: Number(catItem.vitessemax || 0),
            urlimagevehicule: catItem.urlimagevehicule || "",
            price: Number(catItem.price || 0),
            sellPrice: Number(catItem.sellPrice || catItem.price || 0),
            buyPrice: Number(catItem.buyPrice || Math.floor((catItem.sellPrice || catItem.price || 0) / 2)),
            updatedAt: serverTimestamp()
        };

        if (existing) {
            // Update existing
            await setDoc(doc(db, "vehicles", existing.id), vehicleData, { merge: true });
            updatedCount++;
        } else {
            // Create new
            const newDocRef = doc(collection(db, "vehicles"));
            await setDoc(newDocRef, {
                ...vehicleData,
                createdAt: serverTimestamp()
            });
            createdCount++;
        }
    }

    console.log(`Migration complete: ${createdCount} created, ${updatedCount} updated.`);
    return { createdCount, updatedCount };
}
