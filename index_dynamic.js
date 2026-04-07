import { db } from "./config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.querySelector(".catalogue-grid");
    const qInput = document.getElementById("q");
    const typeSelect = document.getElementById("typeSelect");
    const classSelect = document.getElementById("classSelect");
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

        // Prepare and normalize data
        allVehicles.forEach(v => {
            let t = (v.type && v.type.trim()) || "Inconnu";
            // Capitalize first letter, rest lower
            v.type = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
            v.hay = `${v.brand} ${v.model} ${v.type} ${v.classe}`.toLowerCase();
            v.price = Number(v.sellPrice || v.price || 0);
            v.vitessemax = Number(v.vitessemax) || 0;
            v.places = Number(v.places) || 0;
        });

        // Initialize Type Select
        const types = [...new Set(allVehicles.map(v => v.type))].sort();
        if (typeSelect) {
            typeSelect.innerHTML = '<option value="all">Tous les types</option>';
            types.forEach(t => {
                const opt = document.createElement("option");
                opt.value = t;
                opt.textContent = t;
                typeSelect.appendChild(opt);
            });
        }

        renderDailySelection(allVehicles);
        applyFilters();

    } catch (e) {
        console.error("Error loading vehicles:", e);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--accent-red);">
                Erreur lors du chargement des véhicules.<br>
                <small style="color: var(--text-muted);">${e.message}</small>
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
        if (img) {
            img.src = v.urlimagevehicule;
            img.onerror = () => { img.src = "https://via.placeholder.com/600x300.png?text=Image+non+disponible"; };
        }

        const badge = dailySelection.querySelector(".car-preview-badge");
        if (badge) badge.textContent = v.brand;

        const priceStrong = dailySelection.querySelector(".car-preview-price strong");
        if (priceStrong) priceStrong.textContent = `€ ${v.price.toLocaleString()}`;

        dailySelection.onclick = () => {
            const el = document.querySelector(`[data-id="${v.id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.style.boxShadow = "0 0 0 2px var(--accent-gold)";
                setTimeout(() => el.style.boxShadow = "", 2000);
            }
        };
    }

    function applyFilters() {
        const f = {
            text: qInput?.value.toLowerCase().trim() || "",
            type: typeSelect?.value || "all",
            classe: classSelect?.value || "all",
            pMin: minPrice?.value ? Number(minPrice.value) : null,
            pMax: maxPrice?.value ? Number(maxPrice.value) : null,
            sMin: minSpeed?.value ? Number(minSpeed.value) : null,
            sMax: maxSpeed?.value ? Number(maxSpeed.value) : null,
            seatsMin: minSeats?.value ? Number(minSeats.value) : null,
            seatsMax: maxSeats?.value ? Number(maxSeats.value) : null
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

        // Forced Sort: Category (Type) ASC, then Price ASC
        filtered.sort((a, b) => {
            const typeCompare = a.type.localeCompare(b.type);
            if (typeCompare !== 0) return typeCompare;
            return a.price - b.price;
        });

        renderGrid(filtered);
        if (resultsCount) {
            resultsCount.textContent = `${filtered.length} véhicule${filtered.length > 1 ? 's' : ''}`;
        }
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
                        <div class="car-brand">${v.brand || ""}</div>
                        <div class="car-name">${v.model || ""}</div>
                    </div>
                    <div class="car-stock">Type : ${v.type}</div>
                </div>
                <div class="car-image">
                    <img src="${v.urlimagevehicule || ""}" alt="${v.brand} ${v.model}" loading="lazy" onerror="this.src='https://via.placeholder.com/600x300.png?text=Image+non+disponible'">
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
                        <span class="badge">Classe ${v.classe || '-'}</span>
                    </div>
                    <div class="car-cta-link">Acheter</div>
                </div>
            `;
            grid.appendChild(article);
        });
    }

    // Events
    [qInput, typeSelect, classSelect, minPrice, maxPrice, minSpeed, maxSpeed, minSeats, maxSeats].forEach(el => {
        el?.addEventListener("input", applyFilters);
        el?.addEventListener("change", applyFilters);
    });

    resetBtn?.addEventListener("click", () => {
        [qInput, minPrice, maxPrice, minSpeed, maxSpeed, minSeats, maxSeats].forEach(x => { if(x) x.value = ""; });
        if (typeSelect) typeSelect.value = "all";
        if (classSelect) classSelect.value = "all";
        applyFilters();
    });
});
