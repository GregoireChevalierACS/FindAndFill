import { additionner, centimes, type Centimes } from './montant.js';

export interface LigneEcriture {
  readonly compte: string;
  readonly debit: Centimes;
  readonly credit: Centimes;
}

export type ControleEquilibre =
  { readonly equilibree: true } | { readonly equilibree: false; readonly ecart: Centimes };

/** Une écriture est équilibrée quand le total des débits égale le total des crédits. */
export function controlerEquilibre(lignes: readonly LigneEcriture[]): ControleEquilibre {
  const ecart = centimes(
    additionner(lignes.map((ligne) => ligne.debit)) -
      additionner(lignes.map((ligne) => ligne.credit)),
  );
  return ecart === 0 ? { equilibree: true } : { equilibree: false, ecart };
}
