# @findandfill/jeu-synthetique

Génère un jeu de fichiers comptables **fictifs** mais réalistes, pour développer et tester FindAndFill sans données réelles.

```sh
pnpm generer:jeu                                  # depuis la racine, graine 2026
pnpm generer:jeu -- --graine 7 --sortie ./autre   # autre graine, autre dossier
```

Les fichiers sont écrits dans `donnees-synthetiques/` (ignoré par git). La génération est déterministe : même graine, mêmes octets.

## L'entreprise fictive

« Fournil Industries SAS » vend des lignes de production de boulangerie en France, dans l'UE et à l'export (EUR, USD, GBP), sur l'exercice 2026. Chaque affaire est facturée en trois échéances (acompte 30 %, livraison 60 %, réception 10 %). Les achats sont imputés ou non à une affaire. Les créances et dettes réglées après le 31/12 restent ouvertes.

Simplifications volontaires : taux de change fixes, salaires passés directement en banque, pas de déclaration ni de paiement de TVA.

## Contenu

| Dossier              | Fichiers                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `sources/`           | Export Excel des ventes, carnet de commandes Excel, CSV des achats (conventions françaises), FEC 18 colonnes               |
| `sources/variantes/` | Les mêmes sources avec une structure modifiée : colonne ajoutée, onglet renommé, colonnes déplacées                        |
| `gabarits/`          | Reporting direction à 4 onglets, en `.xlsx` et en `.xlsm` (avec projet VBA) : cellules de saisie vides, formules de totaux |
| `attendus/`          | Pour chaque cas de remplissage, la valeur attendue de chaque cellule                                                       |
| `manifeste.json`     | La liste des cas et l'empreinte SHA-256 de chaque fichier                                                                  |

## Oracle

Les valeurs attendues sont calculées directement depuis le modèle en mémoire, jamais en relisant les fichiers. Les tests vérifient ensuite que chaque fichier source, **relu par un chemin indépendant** (ExcelJS, découpage du CSV ou du FEC), redonne exactement ces valeurs.

## Projet VBA

`ressources/vbaProject.bin` vient du projet [XlsxWriter](https://github.com/jmcnamara/XlsxWriter) (licence BSD-2-Clause, voir `ressources/LICENCE-XlsxWriter.txt`). Il a été produit par Excel et contient une seule macro, inoffensive (`say_hello`, une boîte de message). Il sert à vérifier que FindAndFill conserve les macros à l'identique.

Le `.xlsm` généré a été vérifié avec `olevba` et `openpyxl`, mais **pas encore ouvert dans Excel** : à faire sur un poste équipé.
