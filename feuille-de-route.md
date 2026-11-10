# FindAndFill — Feuille de route

Application de bureau qui automatise la saisie et le reporting des comptables : lire des données (Excel, CSV, factures électroniques, relevés, PDF) et remplir d'autres fichiers ou logiciels comptables, sans ressaisie manuelle. Construite selon [bonnes-pratiques.md](bonnes-pratiques.md).

## Cadre

| Sujet | Décision |
| --- | --- |
| Utilisateurs | PME (compta interne) et cabinets comptables (multi-dossiers) |
| Déploiement | Bureau d'abord (Windows), SaaS plus tard sans réécrire le métier |
| IA | Aucune : moteur de règles déterministe, modèles de mapping enregistrés |
| Fichiers Excel | Structure stable, changements occasionnels, macros à préserver |
| Pays | France (PCG, FEC, TVA française), puis francophonie |
| Pilote | Mecatherm (Barembach) : ETI industrielle, lignes de boulangerie, projets à l'international |
| Données réelles | Aucune avant la démo : jeu de fichiers synthétiques réalistes |
| OCR | Accepté (Tesseract) pour les PDF scannés |
| Équipe | Développeur seul |

## Choix techniques

- **Langage** : TypeScript partout (strict), monorepo pnpm.
- **Bureau** : Electron (processus principal Node pour les fichiers, interface React).
- **SaaS futur** : les paquets `domain` et `application` sont réutilisés tels quels ; seuls les adapters changent (stockage local → stockage cloud, Excel COM → écriture XML).
- **Excel** : deux adapters d'écriture derrière le même contrat :
  1. *Patch XML* : modifie uniquement les valeurs des cellules ciblées dans le zip `.xlsx`/`.xlsm`. Préserve macros, mise en forme et formules. Fonctionne sans Excel et côté serveur.
  2. *Excel COM* (Windows, Excel installé) : pilote Excel pour recalculer les formules et lancer une macro si besoin. Excel est probablement présent chez le pilote, mais non confirmé : l'application détecte son absence et se replie sur le patch XML.
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

### Phase 0 — Jeu de données synthétique
Sans fichiers réels, on fabrique un jeu de test crédible pour une ETI industrielle qui vend des lignes de production à l'international :
- Exports « ERP » fictifs : grand livre, balance, ventes par affaire, carnet de commandes, achats fournisseurs, en EUR et devises.
- Fichiers de reporting direction `.xlsm` avec macros, formules, onglets mensuels : CA et marge par affaire, carnet de commandes, trésorerie, suivi des coûts projet.
- Variantes « structure modifiée » (colonne ajoutée, onglet renommé) pour tester la détection de changement.
- Un script génère ces fichiers de façon reproductible ; les résultats attendus sont écrits à la main une fois.
- **Terminée quand** : au moins 5 couples source → reporting attendu, dont 2 avec macros, et 3 variantes de structure.

### Phase 1 — Socle : Excel → Excel (reporting direction)
Le besoin le plus visible : remplir les fichiers de reporting à partir des exports existants.
- Lecture Excel/CSV, éditeur de modèle (choix des cellules source et cible), écriture par patch XML, aperçu, piste d'audit.
- **Terminée quand** : la CI passe (100 % / mutation ≥ 80 %), tous les couples du jeu synthétique sont reproduits à l'identique, macros intactes, et chaque variante de structure est détectée.

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

_(symptôme, cause, contournement, lien)_
