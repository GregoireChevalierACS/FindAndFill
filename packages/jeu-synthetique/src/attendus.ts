import {
  achatsMensuels,
  caMensuel,
  commandeEur,
  factureEur,
  tresorerieMensuelle,
} from './agregats.js';
import { enEuros } from './format.js';
import {
  CELLULE_SOLDE_INITIAL,
  celluleAchats,
  celluleCa,
  celluleCarnet,
  celluleTresorerie,
  ONGLETS,
} from './gabarit.js';
import type { Centimes, JeuDeDonnees } from './modele.js';

/**
 * Valeur qu'une cellule du gabarit doit contenir une fois remplie.
 * Calculée depuis le modèle, sans relire les fichiers sources : c'est l'oracle des tests.
 */
export interface CelluleAttendue {
  readonly onglet: string;
  readonly adresse: string;
  readonly valeur: number;
}

function mensuelles(
  onglet: string,
  rang: number,
  cumuls: readonly Centimes[],
  cellule: (rang: number, mois: number) => string,
): CelluleAttendue[] {
  return cumuls.map((montant, index) => ({
    onglet,
    adresse: cellule(rang, index + 1),
    valeur: enEuros(montant),
  }));
}

export function attendusCa(jeu: JeuDeDonnees): CelluleAttendue[] {
  return jeu.affaires.flatMap((affaire, rang) =>
    mensuelles(ONGLETS.ca, rang, caMensuel(jeu, affaire), celluleCa),
  );
}

export function attendusAchats(jeu: JeuDeDonnees): CelluleAttendue[] {
  return jeu.fournisseurs.flatMap((fournisseur, rang) =>
    mensuelles(ONGLETS.achats, rang, achatsMensuels(jeu, fournisseur.code), celluleAchats),
  );
}

export function attendusCarnet(jeu: JeuDeDonnees): CelluleAttendue[] {
  return jeu.affaires.flatMap((affaire, rang) => [
    {
      onglet: ONGLETS.carnet,
      adresse: celluleCarnet(rang, 'commande'),
      valeur: enEuros(commandeEur(affaire)),
    },
    {
      onglet: ONGLETS.carnet,
      adresse: celluleCarnet(rang, 'facture'),
      valeur: enEuros(factureEur(jeu, affaire)),
    },
  ]);
}

export function attendusTresorerie(jeu: JeuDeDonnees): CelluleAttendue[] {
  const { soldeInitial, encaissements, decaissements } = tresorerieMensuelle(jeu);
  return [
    { onglet: ONGLETS.tresorerie, adresse: CELLULE_SOLDE_INITIAL, valeur: enEuros(soldeInitial) },
    ...encaissements.flatMap((encaisse, index) => [
      {
        onglet: ONGLETS.tresorerie,
        adresse: celluleTresorerie(index + 1, 'encaissements'),
        valeur: enEuros(encaisse),
      },
      {
        onglet: ONGLETS.tresorerie,
        adresse: celluleTresorerie(index + 1, 'decaissements'),
        valeur: enEuros(decaissements[index] ?? 0),
      },
    ]),
  ];
}
