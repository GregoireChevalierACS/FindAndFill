import type { EmpreinteSource } from './structure.js';

/**
 * Modèle de remplissage : décrit une fois, par l'utilisateur, comment passer de fichiers sources
 * à un gabarit. Il est rejoué chaque mois tant que la structure des sources ne change pas.
 * Les colonnes sources sont désignées par leur en-tête, jamais par leur position.
 */
export interface ModeleRemplissage {
  readonly nom: string;
  /** Exercice couvert : les lignes datées d'une autre année sont écartées et signalées. */
  readonly annee: number;
  readonly sources: readonly SourceDuModele[];
  readonly regles: readonly Regle[];
}

export interface SourceDuModele {
  readonly id: string;
  readonly libelle: string;
  readonly empreinte: EmpreinteSource;
}

export interface Filtre {
  readonly colonne: string;
  readonly operateur: 'egal' | 'different';
  readonly valeur: string;
}

/** Montant d'une ligne : une colonne, ou la différence de deux colonnes (débit − crédit). */
export interface Mesure {
  readonly plus: string;
  readonly moins?: string;
}

interface RegleCommune {
  readonly id: string;
  readonly source: string;
  readonly montant: Mesure;
  readonly filtres?: readonly Filtre[];
}

/** Une ligne par clé (affaire, fournisseur…) retrouvée dans la cible, une colonne par mois. */
export interface RegleMensuelleParCle extends RegleCommune {
  readonly type: 'mensuel-par-cle';
  readonly cle: string;
  readonly date: string;
  readonly cible: {
    readonly onglet: string;
    readonly colonneCles: string;
    readonly premiereColonneMois: string;
  };
}

/** Une ligne par mois, à partir d'une ligne donnée de la cible. */
export interface RegleMensuelle extends RegleCommune {
  readonly type: 'mensuel';
  readonly date: string;
  readonly cible: {
    readonly onglet: string;
    readonly colonne: string;
    readonly ligneJanvier: number;
  };
}

/** Un total par clé retrouvée dans la cible. */
export interface RegleParCle extends RegleCommune {
  readonly type: 'par-cle';
  readonly cle: string;
  readonly cible: {
    readonly onglet: string;
    readonly colonneCles: string;
    readonly colonne: string;
  };
}

/** Un total unique dans une cellule. */
export interface RegleTotal extends RegleCommune {
  readonly type: 'total';
  readonly cible: {
    readonly onglet: string;
    readonly adresse: string;
  };
}

export type Regle = RegleMensuelleParCle | RegleMensuelle | RegleParCle | RegleTotal;
