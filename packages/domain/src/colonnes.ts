/** Conversion entre lettres de colonne Excel (A, Z, AA…) et numéros (1, 26, 27…). */

const LETTRES = /^[A-Z]{1,3}$/;
const ADRESSE = /^([A-Z]{1,3})([1-9]\d{0,6})$/;
/** Dernière colonne d'Excel : XFD. */
export const COLONNE_MAX = 16384;

export function numeroColonne(lettres: string): number {
  if (!LETTRES.test(lettres)) {
    throw new RangeError(`Colonne invalide : « ${lettres} »`);
  }
  let numero = 0;
  for (const lettre of lettres) {
    numero = numero * 26 + lettre.charCodeAt(0) - 64;
  }
  if (numero > COLONNE_MAX) {
    throw new RangeError(`Colonne invalide : « ${lettres} »`);
  }
  return numero;
}

export function lettresColonne(numero: number): string {
  if (!Number.isInteger(numero) || numero < 1 || numero > COLONNE_MAX) {
    throw new RangeError(`Numéro de colonne invalide : ${numero}`);
  }
  let reste = numero;
  let lettres = '';
  while (reste > 0) {
    lettres = String.fromCharCode(65 + ((reste - 1) % 26)) + lettres;
    reste = Math.floor((reste - 1) / 26);
  }
  return lettres;
}

export interface Adresse {
  readonly colonne: number;
  readonly ligne: number;
}

export function lireAdresse(adresse: string): Adresse {
  const correspondance = ADRESSE.exec(adresse);
  if (correspondance === null) {
    throw new RangeError(`Adresse invalide : « ${adresse} »`);
  }
  const [, lettres = '', ligne = ''] = correspondance;
  return { colonne: numeroColonne(lettres), ligne: Number(ligne) };
}

export function ecrireAdresse({ colonne, ligne }: Adresse): string {
  return `${lettresColonne(colonne)}${ligne}`;
}
