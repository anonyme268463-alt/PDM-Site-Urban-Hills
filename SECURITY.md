# 🔐 Security Policy

## 📌 Supported Versions

Ce projet est en développement actif.  
Seule la version actuelle disponible sur le dépôt est supportée.

| Version | Support |
|--------|--------|
| Latest | ✅ Oui |
| Older versions | ❌ Non |

---

## 🚨 Signaler une vulnérabilité

Si vous découvrez une faille de sécurité, merci de **ne pas la divulguer publiquement**.

Merci de me contacter directement via :

- Discord (recommandé)
- Message privé GitHub

---

## ⚠️ Règles importantes

- Toute tentative d’exploitation non autorisée est interdite
- Merci de tester uniquement dans un cadre responsable
- Les accès et données utilisateurs sont protégés par des règles Firestore strictes

---

## 🧠 Scope (ce qui est concerné)

Ce projet inclut :
- Le site web PDM
- Les règles Firebase / Firestore
- Les interactions base de données

Ne sont PAS concernés :
- Les services tiers (Firebase, GitHub, etc.)
- Les modifications côté client (le front est public par nature)

---

## 🛠️ Bonnes pratiques mises en place

- Authentification Firebase obligatoire
- Rôles utilisateurs (admin / staff)
- Protection des écritures sensibles via Firestore Rules
- Restrictions sur modification des données critiques (transactions, users)

---

## 💬 Remerciements

Merci à toute personne aidant à améliorer la sécurité du projet 🙏
