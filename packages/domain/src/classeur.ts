/**
 * Vue neutre d'un fichier source, quel que soit son format (Excel, CSV, FEC).
 * Les adapters convertissent les dates en texte AAAA-MM-JJ ; les nombres restent des nombres.
 */
export type ValeurCellule = string | number | null;

export interface Feuille {
  readonly nom: string;
  /** Lignes du fichier : l'indice 0 correspond à la ligne 1. */
  readonly lignes: readonly (readonly ValeurCellule[])[];
}

export interface Classeur {
  readonly feuilles: readonly Feuille[];
}

/** Texte d'une cellule, espaces superflus retirés ; vide pour une cellule vide. */
export function texteCellule(valeur: ValeurCellule | undefined): string {
  if (valeur === null || valeur === undefined) {
    return '';
  }
  return String(valeur).trim().replace(/\s+/g, ' ');
}
