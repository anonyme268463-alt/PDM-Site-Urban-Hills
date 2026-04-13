# 🚗 PDM Site — Urban Hills

## 📌 Description

Application web interne pour la gestion du concessionnaire **Premium Deluxe Motorsport (PDM)** sur Urban Hills RP.

Ce site permet de centraliser et gérer :

* 📊 Les ventes (transactions)
* 🚗 Le catalogue de véhicules
* 📦 Le stock et les réservations
* 👥 Les clients
* 💰 La comptabilité

---

## 🌐 Accès au site

Le site est accessible publiquement via GitHub Pages :
👉 https://anonyme268463-alt.github.io/PDM-Site-Urban-Hills/

⚠️ Certaines fonctionnalités nécessitent une authentification.

---

## 🔐 Sécurité

Le projet repose sur **Firebase (Auth + Firestore)** avec :

* Authentification obligatoire
* Gestion des rôles (admin / staff)
* Règles Firestore strictes
* Protection contre la modification non autorisée des données

👉 Voir : [`SECURITY.md`](./SECURITY.md)

---

## 👥 Gestion des rôles

### 🔹 Employés (Staff)

* Accès aux données internes
* Création de ventes
* Modification de leurs propres ventes uniquement
* Gestion du stock et des réservations (sans suppression)

### 🔹 Direction / Admin

* Accès complet
* Gestion des utilisateurs
* Gestion du catalogue
* Accès comptabilité
* Suppression des données sensibles

---

## 🚫 Règles importantes

* Un utilisateur ne peut **modifier que ses propres ventes**
* Les champs critiques (`sellerId`, `createdBy`, etc.) sont protégés
* Les rôles utilisateurs ne sont pas modifiables côté client
* Toute tentative de modification non autorisée est bloquée par Firestore

---

## ⚙️ Technologies utilisées

* HTML / CSS / JavaScript
* Firebase (Authentication + Firestore)
* GitHub (versioning + GitHub Pages)

---

## 📦 Déploiement

Le site est déployé via **GitHub Pages** directement depuis ce repository.

---

## 🧪 Développement & tests

Le projet est en développement actif.

Pour tester :

* Utiliser différents comptes (admin / staff)
* Vérifier les permissions Firestore
* Tester les restrictions côté base de données (pas uniquement l’interface)

---

## 💬 Sécurité & signalement

Si vous découvrez une faille :

* Ne pas l’exploiter
* Ne pas la rendre publique
* Voir le fichier [`SECURITY.md`](./SECURITY.md)

---

## 🏁 Auteur

Projet développé pour usage RP — Urban Hills

---
