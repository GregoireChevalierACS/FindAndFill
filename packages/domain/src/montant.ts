/**
 * Montant exprimé en centimes entiers : aucun calcul en virgule flottante,
 * donc aucun écart d'arrondi sur les totaux.
 */
export type Centimes = number & { readonly __marque: 'Centimes' };

export function centimes(valeur: number): Centimes {
  if (!Number.isSafeInteger(valeur)) {
    throw new RangeError(
      `Montant invalide : ${String(valeur)} n'est pas un nombre entier de centimes.`,
    );
  }
  return valeur as Centimes;
}

export function additionner(montants: readonly Centimes[]): Centimes {
  return centimes(montants.reduce((total, montant) => total + montant, 0));
}

// \s couvre aussi les espaces insécables (U+00A0, U+202F) utilisés comme séparateurs de milliers.
const ESPACES = /\s/g;
const FORMAT_MONTANT = /^([+-])?(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Lit un montant écrit à la française (« 1 234,56 », « -12,5 ») ou à l'anglaise (« 1234.56 »).
 * Les séparateurs de milliers par espace (y compris insécables) sont acceptés.
 * Renvoie `null` si le texte n'est pas un montant exact.
 */
export function lireMontant(texte: string): Centimes | null {
  const correspondance = FORMAT_MONTANT.exec(texte.replace(ESPACES, ''));
  if (correspondance === null) {
    return null;
  }
  const [, signe, partieEntiere = '', decimales = ''] = correspondance;
  const valeurAbsolue = Number(partieEntiere) * 100 + Number(decimales.padEnd(2, '0'));
  if (!Number.isSafeInteger(valeurAbsolue)) {
    return null;
  }
  return centimes(signe === '-' ? 0 - valeurAbsolue : valeurAbsolue);
}
