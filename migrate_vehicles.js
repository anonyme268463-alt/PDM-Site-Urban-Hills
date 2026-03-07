
import { db } from "./config.js";
import { collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

async function migrate() {
    const status = document.getElementById("status");
    status.innerHTML = "Initialisation de la migration...<br>";

    try {
        const response = await fetch("./vehicles_data.json");
        if (!response.ok) throw new Error("Impossible de charger vehicles_data.json");
        const vehicles = await response.json();
        status.innerHTML += `Fichier JSON chargé (${vehicles.length} véhicules).<br>`;

        const colRef = collection(db, "vehiclescatalogue");

        // Optionnel : Nettoyer la collection existante si besoin
        status.innerHTML += "Nettoyage de l'ancienne base... (optionnel)<br>";
        // const oldDocs = await getDocs(colRef);
        // for (const d of oldDocs.docs) { await deleteDoc(doc(db, "vehiclescatalogue", d.id)); }

        let count = 0;
        let errors = 0;
        for (const v of vehicles) {
            try {
                await addDoc(colRef, {
                    ...v,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                count++;
            } catch (err) {
                console.error("Erreur pour", v.model, err);
                errors++;
            }
            if ((count + errors) % 10 === 0) {
                status.innerHTML += `Progression : ${count + errors}/${vehicles.length}...<br>`;
            }
        }

        if (errors > 0) {
            status.innerHTML += `<br><strong style="color:orange;">Migration terminée avec ${errors} erreurs. ${count} véhicules importés.</strong>`;
        } else {
            status.innerHTML += `<br><strong style="color:green;">Migration terminée avec succès ! ${count} véhicules importés.</strong>`;
        }
        status.innerHTML += `<br>Tu peux maintenant supprimer les fichiers migrate.html, migrate_vehicles.js et vehicles_data.json.`;

    } catch (e) {
        status.innerHTML += `<br><strong style="color:red;">Erreur : ${e.message}</strong>`;
        console.error(e);
    }
}

window.migrate = migrate;
