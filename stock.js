<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PDM Admin — Stock</title>
  <link rel="icon" href="favicon.png" />
  <link rel="stylesheet" href="app.css" />
</head>

<body>
  <div class="app">
    <!-- Sidebar (même structure que les autres pages) -->
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__title">PDM ADMIN</div>
        <div class="sidebar__subtitle">Urban Hills</div>
      </div>

      <nav class="sidebar__nav">
        <a class="nav__item" href="dashboard.html">Dashboard</a>
        <a class="nav__item" href="clients.html">Clients</a>
        <a class="nav__item nav__item--active" href="stock.html">Stock</a>
        <a class="nav__item" href="ventes.html">Ventes</a>
        <a class="nav__item" href="vehicles.html">Véhicules</a>
        <a class="nav__item" href="partenariats.html">Partenaires</a>
        <a class="nav__item" href="compta.html">Comptabilité</a>
        <a class="nav__item nav__item--admin" href="catalogue.html">Catalogue</a>
        <a class="nav__item nav__item--admin" href="gestion.html">Gestion</a>
      </nav>

      <button class="btn btn--primary sidebar__logout" id="logoutBtn" type="button">Déconnexion</button>
    </aside>

    <!-- Main -->
    <main class="main">
      <header class="pageHeader">
        <h1 class="pageHeader__title">Stock &amp; Réservations</h1>
        <p class="pageHeader__subtitle">Sources : Firestore (<code>stock</code> / <code>reservations</code>)</p>
      </header>

      <!-- Toolbar -->
      <section class="card">
        <div class="toolbar">
          <input class="input" id="q" placeholder="Rechercher (marque, modèle, client)..." />
          <div class="toolbar__actions">
            <button class="btn" id="refreshBtn" type="button">Rafraîchir</button>
            <button class="btn btn--primary" id="addStockBtn" type="button">+ Stock</button>
            <button class="btn btn--primary" id="addResaBtn" type="button">+ Réservation</button>
          </div>
        </div>

        <div class="statsRow">
          <div class="stat">
            <div class="stat__label">Quantité stock</div>
            <div class="stat__value" id="statStockQty">—</div>
          </div>
          <div class="stat">
            <div class="stat__label">Lignes stock</div>
            <div class="stat__value" id="statStockLines">—</div>
          </div>
          <div class="stat">
            <div class="stat__label">Réservations actives</div>
            <div class="stat__value" id="statResaActive">—</div>
          </div>
        </div>
      </section>

      <!-- STOCK -->
      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">STOCK</h2>
            <div class="card__hint">Collection : <code>stock</code></div>
          </div>
        </div>

        <div class="tableWrap">
          <table class="table" id="stockTable">
            <thead>
              <tr>
                <th>Marque</th>
                <th>Modèle</th>
                <th>Qté</th>
                <th>Créé</th>
                <th class="t-right">Actions</th>
              </tr>
            </thead>
            <tbody id="stockBody">
              <tr><td colspan="5" class="muted">Chargement…</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- RESERVATIONS -->
      <section class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">RÉSERVATIONS</h2>
            <div class="card__hint">Collection : <code>reservations</code></div>
          </div>
        </div>

        <div class="tableWrap">
          <table class="table" id="resaTable">
            <thead>
              <tr>
                <th>Marque</th>
                <th>Modèle</th>
                <th>Client</th>
                <th>Qté</th>
                <th>Status</th>
                <th>Créé</th>
                <th class="t-right">Actions</th>
              </tr>
            </thead>
            <tbody id="resaBody">
              <tr><td colspan="7" class="muted">Chargement…</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Modal commun (ajout / édition) -->
      <div class="modal" id="modal" aria-hidden="true">
        <div class="modal__backdrop" data-close="1"></div>
        <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal__header">
            <h3 class="modal__title" id="modalTitle">—</h3>
            <button class="modal__close" type="button" data-close="1">✕</button>
          </div>

          <div class="modal__body">
            <div class="grid grid--2">
              <label class="field">
                <span class="field__label">Marque</span>
                <input class="input" id="mBrand" placeholder="Pfister" />
              </label>
              <label class="field">
                <span class="field__label">Modèle</span>
                <input class="input" id="mModel" placeholder="Comet S2" />
              </label>

              <label class="field">
                <span class="field__label">Quantité</span>
                <input class="input" id="mQty" type="number" min="0" value="1" />
              </label>

              <label class="field" id="mClientWrap">
                <span class="field__label">Client</span>
                <input class="input" id="mClient" placeholder="Nom du client" />
                <span class="field__help">Si rempli → Réservation, sinon → Stock</span>
              </label>

              <label class="field" id="mStatusWrap" style="display:none;">
                <span class="field__label">Status</span>
                <select class="input" id="mStatus">
                  <option value="reserved">Réservé</option>
                  <option value="pending">En attente</option>
                  <option value="done">Terminé</option>
                  <option value="canceled">Annulé</option>
                </select>
              </label>
            </div>

            <div class="alert alert--danger" id="modalErr" style="display:none;"></div>
          </div>

          <div class="modal__footer">
            <button class="btn" type="button" data-close="1">Annuler</button>
            <button class="btn btn--primary" id="modalSave" type="button">Enregistrer</button>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Scripts -->
  <script type="module" src="config.js"></script>
  <script type="module" src="guard.js"></script>
  <script type="module" src="common.js"></script>
  <script type="module" src="stock.js"></script>

  <script>
    // bouton logout via common.js (fallback)
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      if (typeof window.logout === 'function') window.logout();
    });
  </script>
</body>
</html>
