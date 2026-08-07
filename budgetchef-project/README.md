# BudgetChef Pro

Application de planification de repas économiques : React + Vite + Tailwind (front) et Express + SQLite (back, pour les comptes).

## Contenu

- 100 recettes (petit-déjeuner, déjeuner, dîner) avec quantités par personne
- Génération de menu qui respecte budget, équipement, régimes et goûts (sans répétition sur la semaine)
- Comparaison de prix sur 12 enseignes
- Liste de courses par rayon, quantités agrégées, export PDF et envoi WhatsApp
- Photos de plats via l'API Pexels (gratuite) — sinon illustration dessinée
- **Comptes utilisateurs** : inscription e-mail + mot de passe, **vérification d'e-mail obligatoire**, recettes favorites et historique des menus

## Développement en local

```bash
npm install
npm run build        # génère le dossier dist/
npm run start        # démarre le serveur (front + API) sur le PORT (3000 par défaut)
```

Pour le front seul avec rechargement à chaud : `npm run dev` (http://localhost:5173), mais l'API n'est alors pas servie.

En local sans `RESEND_API_KEY`, aucun e-mail n'est envoyé : le **lien de vérification s'affiche dans la console** du serveur, ce qui permet de tester tout le parcours.

## Variables d'environnement (Railway)

| Variable | Rôle | Obligatoire |
|----------|------|-------------|
| `APP_URL` | URL publique du site (ex. `https://monsite.up.railway.app`). Sert à construire les liens de vérification. | Oui |
| `RESEND_API_KEY` | Clé API Resend pour envoyer les e-mails de vérification. | Oui (sinon pas d'e-mail) |
| `MAIL_FROM` | Adresse expéditrice. Doit appartenir à un domaine vérifié dans Resend (ou `onboarding@resend.dev` pour tester). | Oui |
| `SESSION_SECRET` | Secret de signature des sessions (chaîne longue et aléatoire). | Oui |
| `DATA_DIR` | Dossier où est stockée la base SQLite. Attache un volume Railway sur ce chemin (voir ci-dessous). | Recommandé |
| `SITE_NAME` | Nom affiché dans les e-mails. | Optionnel |
| `DISCORD_HANDLE` | Affiché en pied des e-mails (support). | Optionnel |
| `PORT` | Défini automatiquement par Railway. | Auto |

Persistance des comptes : la base SQLite vit dans `DATA_DIR`. Sans volume, Railway remet le disque à zéro à chaque déploiement et les comptes seraient perdus. Dans le service Railway -> onglet Volumes -> crée un volume monté sur le chemin de `DATA_DIR` (ex. `/data`).

Resend : pour envoyer depuis ta propre adresse (`MAIL_FROM`), le domaine doit être vérifié dans Resend (DNS). Tant que ce n'est pas fait, utilise `onboarding@resend.dev` comme `MAIL_FROM` pour tester.

## Déploiement GitHub + Railway

1. Pousse ce dossier sur un dépôt GitHub.
2. Sur railway.app : New Project -> Deploy from GitHub repo.
3. Ajoute les variables ci-dessus, et un volume sur `DATA_DIR`.
4. Railway lit `railway.json` : `npm install && npm run build`, puis `node server/index.js`.

## Activer les vraies photos de plats

1. Compte gratuit sur https://www.pexels.com/api/ (sans carte).
2. Colle la clé dans `src/App.jsx` : `const PEXELS_API_KEY = 'ta_cle';`
3. Chaque recette a déjà une requête photo optimisée (table `PHOTO_QUERIES`). Pour changer une image, modifie sa requête.

## Architecture

- `src/` — front React (assistant, menu, liste de courses, comptes).
- `src/auth.jsx` — contexte d'authentification + fenêtre connexion/inscription.
- `server/index.js` — API Express + service du build.
- `server/db.js` — base SQLite (comptes, tokens, favoris, menus).
- `server/email.js` — envoi des e-mails via Resend.
