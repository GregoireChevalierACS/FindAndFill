import { texteCellule, type ValeurCellule } from './classeur.js';

/** Date du calendrier au format AAAA-MM-JJ. */
export type DateIso = string;

const FORMATS: readonly { motif: RegExp; ordre: readonly [number, number, number] }[] = [
  // AAAA-MM-JJ, éventuellement suivi d'une heure
  { motif: /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/, ordre: [1, 2, 3] },
  // JJ/MM/AAAA ou JJ.MM.AAAA ou JJ-MM-AAAA
  { motif: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/, ordre: [3, 2, 1] },
  // AAAAMMJJ (FEC)
  { motif: /^(\d{4})(\d{2})(\d{2})$/, ordre: [1, 2, 3] },
];

/** Nombre de jours du mois (le jour 0 du mois suivant est le dernier jour de celui-ci). */
function joursDansLeMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

/**
 * Lit une date écrite AAAA-MM-JJ, JJ/MM/AAAA ou AAAAMMJJ.
 * Renvoie `null` si la valeur n'est pas une date du calendrier.
 */
export function lireDate(valeur: ValeurCellule): DateIso | null {
  const texte = texteCellule(valeur);
  for (const { motif, ordre } of FORMATS) {
    const correspondance = motif.exec(texte);
    if (correspondance !== null) {
      const annee = Number(correspondance[ordre[0]]);
      const mois = Number(correspondance[ordre[1]]);
      const jour = Number(correspondance[ordre[2]]);
      if (mois < 1 || mois > 12 || jour < 1 || jour > joursDansLeMois(annee, mois)) {
        return null;
      }
      return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    }
  }
  return null;
}

export function moisDe(date: DateIso): number {
  return Number(date.slice(5, 7));
}

export function anneeDe(date: DateIso): number {
  return Number(date.slice(0, 4));
}
