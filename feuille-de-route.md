# FindAndFill — Feuille de route

Application de bureau qui automatise la saisie et le reporting des comptables : lire des données (Excel, CSV, factures électroniques, relevés, PDF) et remplir d'autres fichiers ou logiciels comptables, sans ressaisie manuelle. Construite selon [bonnes-pratiques.md](bonnes-pratiques.md).

## Cadre

| Sujet           | Décision                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------ |
| Utilisateurs    | PME (compta interne) et cabinets comptables (multi-dossiers)                               |
| Déploiement     | Bureau d'abord (Windows), SaaS plus tard sans réécrire le métier                           |
| IA              | Aucune : moteur de règles déterministe, modèles de mapping enregistrés                     |
| Fichiers Excel  | Structure stable, changements occasionnels, macros à préserver                             |
| Pays            | France (PCG, FEC, TVA française), puis francophonie                                        |
| Pilote          | Mecatherm (Barembach) : ETI industrielle, lignes de boulangerie, projets à l'international |
| Données réelles | Aucune avant la démo : jeu de fichiers synthétiques réalistes                              |
| OCR             | Accepté (Tesseract) pour les PDF scannés                                                   |
| Équipe          | Développeur seul                                                                           |

## Choix techniques

- **Langage** : TypeScript partout (strict), monorepo pnpm.
- **Bureau** : Electron (processus principal Node pour les fichiers, interface React).
- **SaaS futur** : les paquets `domain` et `application` sont réutilisés tels quels ; seuls les adapters changent (stockage local → stockage cloud, Excel COM → écriture XML).
- **Excel** : deux adapters d'écriture derrière le même contrat :
  1. _Patch XML_ : modifie uniquement les valeurs des cellules ciblées dans le zip `.xlsx`/`.xlsm`. Préserve macros, mise en forme et formules. Fonctionne sans Excel et côté serveur.
  2. _Excel COM_ (Windows, Excel installé) : pilote Excel pour recalculer les formules et lancer une macro si besoin. Excel est probablement présent chez le pilote, mais non confirmé : l'application détecte son absence et se replie sur le patch XML.
- **Validation des données** : Zod aux frontières (fichiers lus, modèles enregistrés).
- **Tests** : Vitest (100 % sur le domaine), Stryker (mutation ≥ 80 %), suite de contrats par adapter, Playwright sur l'exécutable empaqueté.

```
packages/
  domain/          règles pures : écriture, compte, journal, TVA, contrôles, mapping
  application/     cas d'usage : importerSource, appliquerModele, remplirClasseur,
                   genererEcritures, exporterVersLogiciel, detecterChangementStructure
  adapters/
    sources/       excel, csv, facturx-ubl-cii, releve-bancaire (CAMT.053, OFX, CSV), pdf-texte
    cibles/        excel-patch-xml, excel-com, fec, sage, ebp, cegid-quadra, pennylane
    stockage/      local (JSON chiffré), plus tard cloud
apps/
  desktop/         Electron + React
  (web/, api/)     plus tard, pour le SaaS
```

## Principe central : le « modèle »

Un modèle décrit une transformation réutilisable : source(s) → règles → cible(s).

- **Repérage** : par nom d'onglet, libellé de colonne ou cellule d'ancrage (ex. « Total CA »), pas par adresse figée, pour survivre aux petits décalages.
- **Règles** : mapping de colonnes, correspondance libellé → compte, filtres, agrégats (somme par compte, par mois, par affaire), conversions (dates, montants, signes).
- **Empreinte de structure** : à chaque exécution, on compare la structure du fichier à celle du modèle. Si elle a changé, on bloque et on montre la différence à l'utilisateur au lieu de produire un résultat faux en silence.
- **Aperçu avant écriture** : la cible est montrée avant/après, et rien n'est écrit sans confirmation.
- **Piste d'audit** : chaque valeur écrite garde son origine (fichier, onglet, cellule, règle).

## Phases

### Phase 0 — Jeu de données synthétique ✅

Sans fichiers réels, on fabrique un jeu de test crédible pour une ETI industrielle qui vend des lignes de production à l'international. Détails : [packages/jeu-synthetique](packages/jeu-synthetique/README.md).

- [x] Sources fictives : export Excel des ventes par affaire, carnet de commandes, CSV des achats, FEC ; en EUR, USD et GBP.
- [x] Gabarit de reporting direction (`.xlsx` et `.xlsm` avec projet VBA) : CA par affaire, carnet de commandes, trésorerie, achats ; formules de totaux.
- [x] Variantes « structure modifiée » : colonne ajoutée, onglet renommé, colonnes déplacées.
- [x] Génération déterministe (mêmes octets pour une même graine) avec `pnpm generer:jeu`.
- [x] Résultats attendus calculés depuis le modèle (oracle), et recoupés en relisant chaque source par un chemin indépendant. Ce recoupement remplace la saisie manuelle des valeurs attendues prévue au départ.
- [ ] Ouvrir le `.xlsm` généré dans Excel, sur un poste équipé.
- [ ] Plus tard : balance et suivi des coûts projet (marge par affaire), non couverts pour l'instant.
- **Terminée quand** : au moins 5 couples source → reporting attendu, dont 2 avec macros, et 3 variantes de structure. → **6 cas de remplissage dont 2 avec macros, 3 variantes** (vérifié par un test).

### Phase 1 — Socle : Excel → Excel (reporting direction)

Le besoin le plus visible : remplir les fichiers de reporting à partir des exports existants.

#### 1a — Moteur de remplissage ✅

- [x] Domaine : modèle de remplissage (sources désignées par en-têtes, règles `mensuel-par-cle`, `mensuel`, `par-cle`, `total`, filtres, débit − crédit), lecture des dates et montants français, repérage du tableau sous les titres.
- [x] Détection des changements de structure : onglet introuvable, colonnes ajoutées, supprimées ou déplacées. Le remplissage est alors bloqué, jamais deviné.
- [x] Aperçu avant écriture : cas d'usage `preparerRemplissage` → cellules, avertissements (clé absente du gabarit, ligne hors exercice) et provenance de chaque valeur (règle, source, lignes) ; l'écriture n'a lieu qu'à la confirmation.
- [x] Adapters : lecture Excel (`.xlsx`, `.xlsm`), CSV/TSV/FEC (séparateur détecté, UTF-8 ou Windows-1252) ; écriture du gabarit par retouche du XML des seules cellules visées (styles hérités de la ligne ou de la colonne, formules refusées, recalcul forcé à l'ouverture).
- [x] Recette sur le jeu synthétique : les 6 cas reproduits au centime (373 cellules pour le cas complet, recoupées aussi avec openpyxl), formules et projet VBA intacts, les 3 variantes bloquées avec le bon diagnostic.

#### 1b — Application de bureau

- [x] Electron + React (`apps/desktop`) : choix du modèle, des sources et du gabarit ; aperçu des cellules avec leur provenance ; confirmation puis enregistrement sous un autre nom (le gabarit d'origine reste vierge).
- [x] Bouton « Charger la démonstration » : génère le jeu synthétique et pré-remplit le cas complet, pour une démo sans aucune donnée réelle.
- [x] Message en français pour chaque erreur et avertissement, avec la marche à suivre.
- [x] Sécurité : interface isolée (contextIsolation, sandbox, CSP), accès disque uniquement par le processus principal, modèle validé par zod.
- [x] Tests de bout en bout Playwright sur l'application lancée (parcours complet, variante bloquée, aperçu effacé quand un fichier change), en CI sous xvfb.
- [ ] Éditeur de modèle : choisir les colonnes sources et les cellules cibles, enregistrer le modèle.

- **Terminée quand** : la CI passe (100 % / mutation ≥ 80 %), tous les couples du jeu synthétique sont reproduits à l'identique, macros intactes, et chaque variante de structure est détectée — **atteint par le moteur** ; reste à le rendre utilisable sans ligne de commande (1b).

### Phase 2 — Démo et essai réel chez Mecatherm

Faute de fichiers en amont, la démo doit prouver que l'outil s'adapte à un fichier inconnu.

- Démo : un comptable apporte un de ses fichiers ; on configure le modèle devant lui.
- Puis, si accord : un mois de clôture traité en parallèle de la méthode manuelle.
- **Terminée quand** : un fichier inconnu est configuré en moins de 15 minutes pendant la démo ; puis un mois complet est traité, chaque écart est expliqué ou corrigé, et le gain de temps est mesuré (minutes avant/après par fichier).

### Phase 3 — Saisie comptable : sources → écritures

- Génération d'écritures depuis Excel/CSV, contrôles (équilibre, comptes existants, période, doublons).
- Export FEC, puis formats d'import Sage, EBP, Cegid/Quadra, API Pennylane, selon l'outil du pilote en premier.
- **Terminée quand** : les écritures d'un mois sont importées dans le logiciel du pilote sans correction manuelle.

### Phase 4 — Sources structurées

- Factures électroniques Factur-X/UBL/CII (réception obligatoire depuis le 1er sept. 2026).
- Relevés bancaires (CAMT.053, OFX, CSV) et rapprochement par règles.
- **Terminée quand** : les factures et relevés d'un mois du pilote sont traités sans ressaisie.

### Phase 5 — PDF

- PDF texte : extraction par zones définies dans le modèle.
- PDF scannés : OCR (Tesseract.js), puis extraction par zones comme pour les PDF texte.
- **Terminée quand** : taux d'extraction correcte mesuré sur un jeu de 50 pièces anonymisées ≥ seuil fixé avec le pilote.

### Phase 6 — Confort et reporting étendu

- Tableaux de bord (CA, marges, trésorerie), multi-dossiers pour cabinets, rôles, mises à jour automatiques, code signé.

### Phase 7 — SaaS

- Apps `web` et `api`, stockage cloud, authentification, isolation par client.

## Questions ouvertes

- Logiciel comptable / ERP utilisé par Mecatherm : inconnu. La phase 3 commence par le FEC, que tout logiciel français produit et que la plupart importent.
- Excel installé sur les postes : probable, à confirmer lors de la démo.

## Pièges rencontrés

| Symptôme                                                                    | Cause                                                                                                                                       | Contournement                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `unmet peer typescript` à l'installation, puis erreurs de typescript-eslint | TypeScript 7 (compilateur natif) s'installe par défaut ; typescript-eslint et le vérificateur TypeScript de Stryker ne le gèrent pas encore | Version imposée `~6.0.0` via `overrides` dans `pnpm-workspace.yaml`         |
| `Cannot find Checker plugin "typescript"`                                   | Avec pnpm, Stryker ne découvre pas ses plugins tout seul                                                                                    | Liste `plugins` explicite dans `stryker.config.json`                        |
| Impossible de créer un projet VBA sans Excel                                | Le format `vbaProject.bin` est binaire et non documenté pour l'écriture simple                                                              | Réutiliser un `vbaProject.bin` produit par Excel (XlsxWriter, BSD-2-Clause) |
| Deux générations d'un même `.xlsx` diffèrent                                | ExcelJS et JSZip datent les fichiers à l'heure courante                                                                                     | Dates figées et ordre stable dans `normaliserArchive`                       |
