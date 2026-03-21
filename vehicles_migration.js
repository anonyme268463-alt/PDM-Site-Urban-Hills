import { db } from "./config.js";
import { collection, getDocs, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { VEHICLE_MAPPING } from "./vehicle_mapping.js";

export async function runBulkEnrichment() {
    const snap = await getDocs(collection(db, "vehicles"));
    let updatedCount = 0;
    let skippedCount = 0;

    for (const d of snap.docs) {
        const data = d.data();
        const brand = (data.brand || "").toLowerCase();
        const model = (data.model || "").toLowerCase();

        // Check if stats are missing or default
        const needsUpdate = !data.classe || data.classe === "-" || !data.places || !data.vitessemax;

        if (needsUpdate && VEHICLE_MAPPING[brand] && VEHICLE_MAPPING[brand][model]) {
            const stats = VEHICLE_MAPPING[brand][model];
            await updateDoc(doc(db, "vehicles", d.id), {
                ...stats,
                updatedAt: serverTimestamp()
            });
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log(`Bulk enrichment complete: ${updatedCount} updated, ${skippedCount} skipped.`);
    return { updatedCount, skippedCount };
}
