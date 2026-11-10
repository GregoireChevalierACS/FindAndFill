import {
  calculerRemplissage,
  type Avertissement,
  type CelluleARemplir,
  type Classeur,
  type ErreurRemplissage,
  type ModeleRemplissage,
} from '@findandfill/domain';
import type { FichierEntrant, GabaritOuvert, LecteurSources, OuvreurGabarit } from './ports.js';

export interface DemandeRemplissage {
  readonly modele: ModeleRemplissage;
  /** Fichier fourni pour chaque source du modèle, par identifiant de source. */
  readonly sources: ReadonlyMap<string, FichierEntrant>;
  readonly gabarit: FichierEntrant;
}

export type ErreurPreparation =
  | ErreurRemplissage
  | { readonly nature: 'fichier-illisible'; readonly fichier: string; readonly detail: string };

export type Preparation =
  | { readonly ok: false; readonly erreurs: readonly ErreurPreparation[] }
  | {
      readonly ok: true;
      /** Ce qui sera écrit, avec l'origine de chaque valeur : à montrer avant de confirmer. */
      readonly cellules: readonly CelluleARemplir[];
      readonly avertissements: readonly Avertissement[];
      /** Écrit le gabarit rempli. Rien n'est écrit tant que l'utilisateur n'a pas confirmé. */
      readonly confirmer: () => Promise<Uint8Array>;
    };

function detail(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Lit les sources et le gabarit, puis calcule le remplissage sans rien écrire.
 * Un fichier illisible devient une erreur, pas une exception.
 */
export async function preparerRemplissage(
  demande: DemandeRemplissage,
  ports: { readonly lecteur: LecteurSources; readonly ouvreur: OuvreurGabarit },
): Promise<Preparation> {
  const erreurs: ErreurPreparation[] = [];
  const illisible = (fichier: FichierEntrant, erreur: unknown) => {
    erreurs.push({ nature: 'fichier-illisible', fichier: fichier.nom, detail: detail(erreur) });
  };

  const lectures = await Promise.all(
    [...demande.sources].map(async ([id, fichier]) => {
      try {
        return [id, await ports.lecteur.lire(fichier)] as const;
      } catch (erreur) {
        illisible(fichier, erreur);
        return null;
      }
    }),
  );
  let gabarit: GabaritOuvert | null = null;
  try {
    gabarit = await ports.ouvreur.ouvrir(demande.gabarit);
  } catch (erreur) {
    illisible(demande.gabarit, erreur);
  }
  if (gabarit === null || erreurs.length > 0) {
    return { ok: false, erreurs };
  }

  const sources = new Map<string, Classeur>(lectures.filter((lecture) => lecture !== null));
  const resultat = calculerRemplissage(demande.modele, sources, gabarit);
  if (!resultat.ok) {
    return { ok: false, erreurs: resultat.erreurs };
  }
  const ouvert = gabarit;
  return {
    ok: true,
    cellules: resultat.cellules,
    avertissements: resultat.avertissements,
    confirmer: () => ouvert.ecrire(resultat.cellules),
  };
}
