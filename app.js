// CONFIG FIREBASE - REMPLACE PAR TES VRAIES CLÉS !
const firebaseConfig = {
  apiKey: "AIzaSyAI3qBm_8zltFCTyPyLFNLcY-aU9GI1itM",
  authDomain: "pdm-urban-hills.firebaseapp.com",
  projectId: "pdm-urban-hills",
  storageBucket: "pdm-urban-hills.firebasestorage.app",
  messagingSenderId: "426355558661",
  appId: "1:426355558661:web:8364782043dd5ad2270f6c",
  measurementId: "G-RGM2DWVFLT"
};

// IMPORTS FIREBASE
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// INIT FIREBASE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// FONCTIONS GLOBALES
window.logout = function() {
    signOut(auth).then(() => window.location.href = 'pdm-staff.html');
};

// Vérification connexion sur toutes les pages
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = 'pdm-staff.html';
});

// ======================================
// DASHBOARD
// ======================================
window.loadDashboard = async function() {
    try {
        // Stats rapides
        const [vehiclesSnap, clientsSnap, transactionsSnap] = await Promise.all([
            getDocs(collection(db, 'vehicles')),
            getDocs(collection(db, 'clients')),
            getDocs(query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(1)))
        ]);
        
        const stats = document.querySelectorAll('.stat-number');
        stats[0].textContent = vehiclesSnap.size;
        stats[1].textContent = clientsSnap.size;
        stats[2].textContent = '€' + (vehiclesSnap.size * 45000).toLocaleString();
        stats[3].textContent = vehiclesSnap.size;
        
        // Activité récente
        const recentSnap = await getDocs(query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(5)));
        const tbody = document.querySelector('.data-table tbody');
        tbody.innerHTML = '';
        
        recentSnap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.date || 'N/A'}</td>
                    <td>${data.client || 'N/A'}</td>
                    <td>${data.vehicle || 'N/A'}</td>
                    <td>€${parseFloat(data.amount || 0).toLocaleString()}</td>
                    <td><span class="status">${data.status || 'En cours'}</span></td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Dashboard error:', error);
    }
};

// ======================================
// CLIENTS
// ======================================
window.loadClients = async function() {
    try {
        const clientsSnap = await getDocs(collection(db, 'clients'));
        const tbody = document.querySelector('.data-table tbody');
        tbody.innerHTML = '';
        
        clientsSnap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.nom || 'N/A'}</td>
                    <td>${data.prenom || 'N/A'}</td>
                    <td>${data.telephone || 'N/A'}</td>
                    <td>${data.email || 'N/A'}</td>
                    <td>${data.solde || '€0'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Clients error:', error);
    }
};

// ======================================
// VÉHICULES
// ======================================
window.loadVehicles = async function() {
    try {
        const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
        const tbody = document.querySelector('.data-table tbody');
        tbody.innerHTML = '';
        
        vehiclesSnap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.marque || 'N/A'}</td>
                    <td>${data.modele || 'N/A'}</td>
                    <td>${data.prix || 'N/A'}</td>
                    <td>${data.statut || 'Disponible'}</td>
                    <td>${data.immatriculation || 'N/A'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Vehicles error:', error);
    }
};

// ======================================
// STOCK / RÉSERVATIONS
// ======================================
window.loadStock = async function() {
    try {
        const stockSnap = await getDocs(collection(db, 'stock'));
        const tbody = document.querySelector('.data-table tbody');
        tbody.innerHTML = '';
        
        stockSnap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.piece || 'N/A'}</td>
                    <td>${data.quantite || 0}</td>
                    <td>€${data.prixUnitaire || 0}</td>
                    <td>${data.fournisseur || 'N/A'}</td>
                    <td>${data.dateEntree || 'N/A'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Stock error:', error);
    }
};

// ======================================
// VENTES / TRANSACTIONS
// ======================================
window.loadVentes = async function() {
    try {
        const ventesSnap = await getDocs(query(collection(db, 'transactions'), orderBy('date', 'desc')));
        const tbody = document.querySelector('.data-table tbody');
        tbody.innerHTML = '';
        
        ventesSnap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.date || 'N/A'}</td>
                    <td>${data.client || 'N/A'}</td>
                    <td>${data.vehicle || 'N/A'}</td>
                    <td>€${parseFloat(data.amount || 0).toLocaleString()}</td>
                    <td>${data.status || 'Payée'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Ventes error:', error);
    }
};

// ======================================
// PARTENARIATS
// ======================================
window.loadPartenariats = async function() {
    try {
        const partnersSnap = await getDocs(collection(db, 'partners'));
        const tbody = document.querySelector('.data-table tbody');
        tbody.innerHTML = '';
        
        partnersSnap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.nom || 'N/A'}</td>
                    <td>${data.contact || 'N/A'}</td>
                    <td>${data.type || 'Fournisseur'}</td>
                    <td>${data.dateDebut || 'N/A'}</td>
                    <td>${data.statut || 'Actif'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Partners error:', error);
    }
};

// ======================================
// COMPTA
// ======================================
window.loadCompta = async function() {
    try {
        const cashbookSnap = await getDocs(query(collection(db, 'cashbook'), orderBy('date', 'desc')));
        const tbody = document.querySelector('.data-table tbody');
        tbody.innerHTML = '';
        
        cashbookSnap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.date || 'N/A'}</td>
                    <td>${data.libelle || 'N/A'}</td>
                    <td>${data.debiteur || 'N/A'}</td>
                    <td>€${parseFloat(data.montant || 0).toLocaleString()}</td>
                    <td>${data.type || 'Dépense'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Compta error:', error);
    }
};

// AUTO-CHARGEMENT selon la page
document.addEventListener('DOMContentLoaded', function() {
    const page = window.location.pathname.split('/').pop() || 'dashboard.html';
    
    if (page.includes('dashboard')) loadDashboard();
    else if (page.includes('clients')) loadClients();
    else if (page.includes('vehicles')) loadVehicles();
    else if (page.includes('stock')) loadStock();
    else if (page.includes('ventes')) loadVentes();
    else if (page.includes('partenariats')) loadPartenariats();
    else if (page.includes('compta')) loadCompta();
});
