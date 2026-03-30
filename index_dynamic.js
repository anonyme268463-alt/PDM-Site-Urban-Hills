import { db } from "./config.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.querySelector(".catalogue-grid");
    const qInput = document.getElementById("q");
    const typeSelect = document.getElementById("typeSelect");
    const classSelect = document.getElementById("classSelect");
    const sortSelect = document.getElementById("sortSelect");
    const minPrice = document.getElementById("minPrice");
    const maxPrice = document.getElementById("maxPrice");
    const minSpeed = document.getElementById("minSpeed");
    const maxSpeed = document.getElementById("maxSpeed");
    const minSeats = document.getElementById("minSeats");
    const maxSeats = document.getElementById("maxSeats");
    const resetBtn = document.getElementById("resetFilters");
    const resultsCount = document.getElementById("resultsCount");
    const dailySelection = document.getElementById("daily-selection");

    if (!grid) return;

    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px;">Chargement du catalogue...</div>';

    let allVehicles = [];

    try {
        const colRef = collection(db, "vehicles");
        const snap = await getDocs(colRef);
        allVehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        allVehicles.forEach(v => {
            v.hay = `${v.brand} ${v.model} ${v.type} ${v.classe}`.toLowerCase();
            v.price = Number(v.sellPrice || v.price || 0);
            v.vitessemax = Number(v.vitessemax) || 0;
            v.places = Number(v.places) || 0;
        });

        const types = [...new Set(allVehicles.map(v => v.type))].sort();
        typeSelect.innerHTML = '<option value="all">Tous les types</option>';
        types.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            typeSelect.appendChild(opt);
        });

        renderDailySelection(allVehicles);
        applyFilters();

    } catch (e) {
        console.error("Error loading vehicles:", e);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--danger);">
                Erreur lors du chargement des véhicules.<br>
                <small style="color: var(--text-muted);">${esc(e.message)}</small>
            </div>
        `;
    }

    function renderDailySelection(vehicles) {
        if (!dailySelection || !vehicles.length) return;
        const premium = vehicles.filter(v => v.classe === "S" || v.classe === "A");
        const list = premium.length ? premium : vehicles;
        const dayIndex = Math.floor(Date.now() / 86400000) % list.length;
        const v = list[dayIndex];

        const img = dailySelection.querySelector(".car-preview-main img");
        img.src = v.urlimagevehicule;
        img.onerror = () => { img.src = "https://via.placeholder.com/600x300.png?text=Image+non+disponible"; };

        dailySelection.querySelector(".car-preview-badge").textContent = v.brand;
        dailySelection.querySelector(".car-preview-price strong").textContent = `€ ${v.price.toLocaleString()}`;

        dailySelection.onclick = () => {
            const el = document.querySelector(`[data-id="${v.id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.style.boxShadow = "0 0 0 2px var(--accent-gold)";
                setTimeout(() => { if(el) el.style.boxShadow = ""; }, 2000);
            }
        };
    }

    function applyFilters() {
        const f = {
            text: qInput.value.toLowerCase().trim(),
            type: typeSelect.value,
            classe: classSelect.value,
            sort: sortSelect.value,
            pMin: minPrice.value ? Number(minPrice.value) : null,
            pMax: maxPrice.value ? Number(maxPrice.value) : null,
            sMin: minSpeed.value ? Number(minSpeed.value) : null,
            sMax: maxSpeed.value ? Number(maxSpeed.value) : null,
            seatsMin: minSeats.value ? Number(minSeats.value) : null,
            seatsMax: maxSeats.value ? Number(maxSeats.value) : null
        };

        let filtered = allVehicles.filter(v => {
            if (f.text && !v.hay.includes(f.text)) return false;
            if (f.type !== "all" && v.type !== f.type) return false;
            if (f.classe !== "all" && v.classe !== f.classe) return false;
            if (f.pMin !== null && v.price < f.pMin) return false;
            if (f.pMax !== null && v.price > f.pMax) return false;
            if (f.sMin !== null && v.vitessemax < f.sMin) return false;
            if (f.sMax !== null && v.vitessemax > f.sMax) return false;
            if (f.seatsMin !== null && v.places < f.seatsMin) return false;
            if (f.seatsMax !== null && v.places > f.seatsMax) return false;
            return true;
        });

        if (f.sort === "priceAsc") filtered.sort((a,b) => a.price - b.price);
        else if (f.sort === "priceDesc") filtered.sort((a,b) => b.price - a.price);
        else if (f.sort === "speedDesc") filtered.sort((a,b) => b.vitessemax - a.vitessemax);
        else if (f.sort === "seatsDesc") filtered.sort((a,b) => b.places - a.places);
        else filtered.sort((a,b) => (a.type || "").localeCompare(b.type || "") || a.price - b.price || (a.brand || "").localeCompare(b.brand || ""));

        renderGrid(filtered);
        resultsCount.textContent = `${filtered.length} véhicule${filtered.length > 1 ? 's' : ''}`;
    }

    function renderGrid(vehicles) {
        grid.innerHTML = "";
        if (!vehicles.length) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px;" class="muted">Aucun véhicule ne correspond à vos critères.</div>';
            return;
        }

        let currentType = "";
        vehicles.forEach(v => {
            if (v.type !== currentType) {
                currentType = v.type;
                const title = document.createElement("div");
                title.className = "category-title";
                title.textContent = currentType;
                grid.appendChild(title);
            }

            const article = document.createElement("article");
            article.className = "car-card";
            article.dataset.id = v.id;
            article.innerHTML = `
                <div class="car-card-header">
                    <div>
                        <div class="car-brand">${esc(v.brand)}</div>
                        <div class="car-name">${esc(v.model)}</div>
                    </div>
                    <div class="car-stock">Type : ${esc(v.type)}</div>
                </div>
                <div class="car-image">
                    <img src="${esc(v.urlimagevehicule)}" alt="${esc(v.brand)} ${esc(v.model)}" loading="lazy" onerror="this.src='https://via.placeholder.com/600x300.png?text=Image+non+disponible'">
                </div>
                <div class="car-infos">
                    <div class="car-price">
                        <span>Prix client</span>
                        <strong>€ ${v.price.toLocaleString()}</strong>
                    </div>
                    <div class="car-meta">
                        <span>🚗 ${v.places} places</span>
                        <span>⚡ ${v.vitessemax} Km/h</span>
                    </div>
                </div>
                <div class="car-footer">
                    <div class="car-badges">
                        <span class="badge">Classe ${esc(v.classe || '-')}</span>
                    </div>
                    <div class="car-cta-link">Acheter</div>
                </div>
            `;
            grid.appendChild(article);
        });
    }

    [qInput, typeSelect, classSelect, sortSelect, minPrice, maxPrice, minSpeed, maxSpeed, minSeats, maxSeats].forEach(el => {
        el?.addEventListener("input", applyFilters);
        el?.addEventListener("change", applyFilters);
    });

    resetBtn?.addEventListener("click", () => {
        [qInput, minPrice, maxPrice, minSpeed, maxSpeed, minSeats, maxSeats].forEach(x => { if(x) x.value = ""; });
        if(typeSelect) typeSelect.value = "all";
        if(classSelect) classSelect.value = "all";
        if(sortSelect) sortSelect.value = "default";
        applyFilters();
    });
});
