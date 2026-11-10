import type { Centimes } from './modele.js';

/** Valeur en euros pour une cellule Excel (nombre à deux décimales). */
export function enEuros(montant: Centimes): number {
  return montant / 100;
}

/** Montant écrit à la française : « 1 234,56 », ou « 1234,56 » sans séparateur de milliers. */
export function montantTexte(montant: Centimes, separateurMilliers = ''): string {
  const signe = montant < 0 ? '-' : '';
  const absolu = Math.abs(montant);
  const partieEntiere = String(Math.floor(absolu / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    separateurMilliers,
  );
  const decimales = String(absolu % 100).padStart(2, '0');
  return `${signe}${partieEntiere},${decimales}`;
}

/** Lettre(s) de colonne Excel à partir d'un numéro (1 → A, 27 → AA). */
export function lettreColonne(numero: number): string {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new RangeError(`Numéro de colonne invalide : ${numero}`);
  }
  let reste = numero;
  let lettres = '';
  while (reste > 0) {
    const indice = (reste - 1) % 26;
    lettres = String.fromCharCode(65 + indice) + lettres;
    reste = Math.floor((reste - 1) / 26);
  }
  return lettres;
}

export function adresse(colonne: number, ligne: number): string {
  return `${lettreColonne(colonne)}${ligne}`;
}
