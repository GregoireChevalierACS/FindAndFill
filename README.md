# FindAndFill

Application de bureau qui automatise la saisie et le reporting comptables : lire des données (Excel, CSV, factures électroniques, relevés bancaires, PDF) et remplir d'autres fichiers ou logiciels comptables, sans ressaisie manuelle et sans IA (moteur de règles déterministe).

- Feuille de route : [feuille-de-route.md](feuille-de-route.md)
- Bonnes pratiques suivies : [bonnes-pratiques.md](bonnes-pratiques.md)

## Démarrer

Prérequis : Node 24 et pnpm 10.

```sh
pnpm install
pnpm verifier        # formatage, lint, types, tests et couverture
pnpm test:mutation   # tests de mutation du domaine
pnpm generer:jeu     # jeu de données synthétique dans donnees-synthetiques/
pnpm dev             # application de bureau en mode développement
pnpm test:e2e        # construit l'application et rejoue le parcours utilisateur (Playwright)
```

| Paquet                                                   | Rôle                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [apps/desktop](apps/desktop)                             | Application de bureau Electron + React                                                                      |
| [packages/domain](packages/domain)                       | Règles métier pures, sans aucune dépendance : montants, dates, repérage des tableaux, calcul du remplissage |
| [packages/application](packages/application)             | Cas d'usage et ports (contrats des adapters)                                                                |
| [packages/adapters-fichiers](packages/adapters-fichiers) | Lecture Excel/CSV/FEC, écriture des gabarits Excel par retouche du XML                                      |
| [packages/jeu-synthetique](packages/jeu-synthetique)     | Générateur de fichiers comptables fictifs et modèles de référence pour la recette                           |

## Contribuer

`main` est protégée : toute modification passe par une branche et une pull request (fusion en squash, historique linéaire).

```sh
git switch -c feat/ma-modification
# ... commits ...
git push -u origin feat/ma-modification
gh pr create --fill
```

Aucune donnée comptable réelle ne doit être versionnée : les tests utilisent uniquement le jeu synthétique.
