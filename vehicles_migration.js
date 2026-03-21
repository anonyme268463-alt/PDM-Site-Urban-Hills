import { db } from "./config.js";
import { collection, getDocs, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { VEHICLE_MAPPING } from "./vehicle_mapping.js";

function norm(s) {
    return (s || "").trim().toLowerCase();
}

export async function runBulkEnrichment() {
    // 1. Fetch catalog
    const catSnap = await getDocs(collection(db, "vehiclescatalogue"));
    const catalog = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 2. Fetch current vehicles
    const snap = await getDocs(collection(db, "vehicles"));
    let updatedCount = 0;
    let skippedCount = 0;

    for (const d of snap.docs) {
        const data = d.data();
        const brand = norm(data.brand);
        const model = norm(data.model);

        // Check if stats are missing or default
        const needsUpdate = !data.classe || data.classe === "-" || !data.places || !data.vitessemax || !data.type;

        if (needsUpdate) {
            let stats = null;

            // Priority 1: vehiclescatalogue
            const fromCat = catalog.find(v => norm(v.brand) === brand && norm(v.model) === model);
            if (fromCat) {
                stats = {
                    type: fromCat.type || "",
                    classe: fromCat.classe || "",
                    places: Number(fromCat.places || 0),
                    vitessemax: Number(fromCat.vitessemax || 0),
                    urlimagevehicule: fromCat.urlimagevehicule || data.urlimagevehicule || ""
                };
                if (!data.sellPrice || data.sellPrice === 0) {
                    stats.sellPrice = Number(fromCat.sellPrice || fromCat.price || 0);
                    stats.buyPrice = Math.floor(stats.sellPrice / 2);
                }
            }
            // Priority 2: vehicle_mapping.js
            else if (VEHICLE_MAPPING[brand] && VEHICLE_MAPPING[brand][model]) {
                stats = VEHICLE_MAPPING[brand][model];
            }

            if (stats) {
                await updateDoc(doc(db, "vehicles", d.id), {
                    ...stats,
                    updatedAt: serverTimestamp()
                });
                updatedCount++;
            } else {
                skippedCount++;
            }
        } else {
            skippedCount++;
        }
    }

    console.log(`Bulk enrichment complete: ${updatedCount} updated, ${skippedCount} skipped.`);
    return { updatedCount, skippedCount };
}
