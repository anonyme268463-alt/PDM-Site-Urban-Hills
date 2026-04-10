import { db } from "./config.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
    let CART = JSON.parse(localStorage.getItem("pdm_cart") || "[]");

    const cartToggle = document.getElementById("cartToggle");
    const cartCount = document.getElementById("cartCount");
    const cartModal = document.getElementById("cartModal");
    const cartItems = document.getElementById("cartItems");
    const cartTotal = document.getElementById("cartTotal");
    const goReservation = document.getElementById("goReservation");

    const reservationModal = document.getElementById("reservationModal");
    const resRecapList = document.getElementById("resRecapList");
    const resTotal = document.getElementById("resTotal");
    const resNameInput = document.getElementById("resName");
    const resDateInput = document.getElementById("resDate");
    const resError = document.getElementById("resError");
    const confirmReservation = document.getElementById("confirmReservation");

    function saveCart() {
        localStorage.setItem("pdm_cart", JSON.stringify(CART));
        updateCartUI();
    }

    function updateCartUI() {
        if (CART.length > 0) {
            cartToggle.classList.remove("hidden");
            cartCount.textContent = CART.length;
        } else {
            cartToggle.classList.add("hidden");
        }
    }

    function addToCart(vehicle) {
        if (CART.find(item => item.id === vehicle.id)) {
            alert("Ce véhicule est déjà dans votre panier.");
            return;
        }
        CART.push(vehicle);
        saveCart();
    }

    function removeFromCart(id) {
        CART = CART.filter(item => item.id !== id);
        saveCart();
        renderCart();
    }

    function renderCart() {
        cartItems.innerHTML = CART.map(v => `
            <div class="cart-item">
                <img src="${v.urlimagevehicule}" onerror="this.src='https://via.placeholder.com/100x50?text=?'">
                <div class="cart-item-info">
                    <div class="cart-item-name">${v.brand} ${v.model}</div>
                    <div class="cart-item-price">€ ${v.price.toLocaleString()}</div>
                    <span class="remove-item" data-id="${v.id}">Retirer</span>
                </div>
            </div>
        `).join("");

        const total = CART.reduce((sum, v) => sum + v.price, 0);
        cartTotal.textContent = `€ ${total.toLocaleString()}`;

        cartItems.querySelectorAll(".remove-item").forEach(btn => {
            btn.onclick = () => removeFromCart(btn.dataset.id);
        });
    }

    cartToggle.onclick = () => {
        renderCart();
        cartModal.classList.remove("hidden");
    };

    goReservation.onclick = () => {
        cartModal.classList.add("hidden");
        renderReservation();
        reservationModal.classList.remove("hidden");
    };

    function renderReservation() {
        resRecapList.innerHTML = CART.map(v => `
            <div class="res-recap-item">
                <span>${v.brand} ${v.model}</span>
                <span>€ ${v.price.toLocaleString()}</span>
            </div>
        `).join("");
        const total = CART.reduce((sum, v) => sum + v.price, 0);
        resTotal.textContent = `€ ${total.toLocaleString()}`;
        resError.classList.add("hidden");
    }

    async function checkLicense(name, vehicles) {
        const q = query(collection(db, "clients"), where("name", "==", name));
        const snap = await getDocs(q);
        if (snap.empty) return { ok: false, msg: "Client non trouvé dans notre base. Veuillez contacter un staff." };

        const client = snap.docs[0].data();
        if (client.license === "Non" || client.license === false) return { ok: false, msg: "Vous n'avez pas de permis de conduire valide." };

        for (const v of vehicles) {
            const type = (v.type || "").toLowerCase();
            if (type.includes("motorcyles") || type.includes("moto")) {
                if (!client.moto) return { ok: false, msg: `Vous n'avez pas le permis Moto pour le véhicule, si votre situation à changée, merci de votre rapprocher de la concession pour procéder au changement ! ${v.brand} ${v.model}.` };
            } else if (type.includes("van") || type.includes("entreprise") || type.includes("truck")) {
                if (!client.truck) return { ok: false, msg: `Vous n'avez pas le permis Poids Lourd pour le véhicule, si votre situation à changée, merci de votre rapprocher de la concession pour procéder au changement ! ${v.brand} ${v.model}.` };
            } else {
                if (!client.car) return { ok: false, msg: `Vous n'avez pas le permis Voiture pour le véhicule, si votre situation à changée, merci de votre rapprocher de la concession pour procéder au changement ! ${v.brand} ${v.model}.` };
            }
        }
        return { ok: true };
    }

    confirmReservation.onclick = async () => {
        const name = resNameInput.value.trim();
        const date = resDateInput.value;
        if (!name || !date) {
            resError.textContent = "Veuillez remplir votre nom et la date souhaitée.";
            resError.classList.remove("hidden");
            return;
        }

        confirmReservation.disabled = true;
        confirmReservation.textContent = "Vérification...";

        try {
            const license = await checkLicense(name, CART);
            if (!license.ok) {
                resError.textContent = license.msg;
                resError.classList.remove("hidden");
                confirmReservation.disabled = false;
                confirmReservation.textContent = "Confirmer la réservation";
                return;
            }

            // Webhook send
            const webhookUrl = "https://discordapp.com/api/webhooks/1491997061724373074/p9G4n7fBcwRB3XWXM5AiNCsFPsKfS9pwqbAnrl1iaakzS7_X-I8U0wC5jiRNO7PaXNtd";
            const total = CART.reduce((sum, v) => sum + v.price, 0);
            const itemsList = CART.map(v => `- ${v.brand} ${v.model} (€ ${v.price.toLocaleString()})`).join("\n");

            const payload = {
                username: "PDM Réservations",
                embeds: [{
                    title: "🆕 Nouvelle Réservation Catalogue",
                    color: 0xD4AF37,
                    fields: [
                        { name: "👤 Client", value: name, inline: true },
                        { name: "📅 Date prévue", value: date, inline: true },
                        { name: "🛒 Véhicules", value: itemsList },
                        { name: "💰 Total", value: `€ ${total.toLocaleString()}`, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            };

            await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            alert("Votre réservation a été validée et envoyée aux équipes PDM !");
            CART = [];
            saveCart();
            reservationModal.classList.add("hidden");
        } catch (e) {
            console.error(e);
            resError.textContent = "Erreur lors de la réservation. Réessayez.";
            resError.classList.remove("hidden");
        } finally {
            confirmReservation.disabled = false;
            confirmReservation.textContent = "Confirmer la réservation";
        }
    };

    async function getVehicles() {
        const CACHE_KEY = "pdm_catalog_cache";
        const CACHE_TIME_KEY = "pdm_catalog_cache_time";
        const TTL = 5 * 60 * 1000; // 5 minutes

        const cached = sessionStorage.getItem(CACHE_KEY);
        const cachedTime = sessionStorage.getItem(CACHE_TIME_KEY);

        if (cached && cachedTime && (Date.now() - Number(cachedTime) < TTL)) {
            console.log("Using cached catalog data");
            return JSON.parse(cached);
        }

        const colRef = collection(db, "vehicles");
        const snap = await getDocs(colRef);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        sessionStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        return data;
    }

    try {
        allVehicles = await getVehicles();

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

        updateCartUI();
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
                    <div class="car-cta-wrap">
                        <div class="car-cta-link btn-buy">Acheter</div>
                        <button class="btn-reserve" data-id="${v.id}">Réserver</button>
                    </div>
                </div>
            `;
            grid.appendChild(article);
        });

        // Add events to Buy/Reserve buttons
        grid.querySelectorAll(".btn-buy").forEach(btn => {
            btn.onclick = (e) => {
                const existing = btn.parentElement.querySelector(".buy-msg");
                if (existing) existing.remove();

                const msg = document.createElement("div");
                msg.className = "buy-msg";
                msg.textContent = "À acheter directement sur place ou à réserver";
                btn.parentElement.appendChild(msg);
                setTimeout(() => msg.remove(), 3000);
            };
        });

        grid.querySelectorAll(".btn-reserve").forEach(btn => {
            btn.onclick = () => {
                const v = allVehicles.find(x => x.id === btn.dataset.id);
                if (v) addToCart(v);
            };
        });
    }

    // Debounce helper
    function debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    }

    const debouncedApplyFilters = debounce(applyFilters, 250);

    // Events
    [qInput, minPrice, maxPrice, minSpeed, maxSpeed, minSeats, maxSeats].forEach(el => {
        el?.addEventListener("input", debouncedApplyFilters);
    });

    [typeSelect, classSelect].forEach(el => {
        el?.addEventListener("change", applyFilters);
    });

    resetBtn?.addEventListener("click", () => {
        [qInput, minPrice, maxPrice, minSpeed, maxSpeed, minSeats, maxSeats].forEach(x => { if(x) x.value = ""; });
        if (typeSelect) typeSelect.value = "all";
        if (classSelect) classSelect.value = "all";
        applyFilters();
    });
});
