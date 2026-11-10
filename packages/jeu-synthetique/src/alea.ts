/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même jeu de données. */
export interface Alea {
  /** Nombre dans [0, 1[. */
  suivant(): number;
  /** Entier dans [min, max], bornes incluses. */
  entier(min: number, max: number): number;
  choisir<T>(liste: readonly T[]): T;
  /** Vrai avec la probabilité donnée. */
  chance(probabilite: number): boolean;
}

export function creerAlea(graine: number): Alea {
  let etat = graine >>> 0;

  function suivant(): number {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function entier(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Bornes invalides : [${min}, ${max}].`);
    }
    return min + Math.floor(suivant() * (max - min + 1));
  }

  return {
    suivant,
    entier,
    choisir<T>(liste: readonly T[]): T {
      if (liste.length === 0) {
        throw new RangeError('Impossible de choisir dans une liste vide.');
      }
      return liste[entier(0, liste.length - 1)] as T;
    },
    chance(probabilite: number): boolean {
      return suivant() < probabilite;
    },
  };
}
