import { texteCellule, type Classeur, type Feuille } from './classeur.js';

/**
 * Ce que le modèle a retenu de la structure d'une source quand on l'a configuré :
 * l'onglet (absent pour un CSV ou un FEC) et la ligne d'en-têtes.
 */
export interface EmpreinteSource {
  readonly onglet?: string;
  readonly entetes: readonly string[];
}

export type ChangementStructure =
  | {
      readonly nature: 'onglet-introuvable';
      readonly onglet: string;
      readonly ongletsDisponibles: readonly string[];
    }
  | { readonly nature: 'entetes-introuvables' }
  | { readonly nature: 'colonnes-ajoutees'; readonly colonnes: readonly string[] }
  | { readonly nature: 'colonnes-supprimees'; readonly colonnes: readonly string[] }
  | { readonly nature: 'colonnes-deplacees'; readonly colonnes: readonly string[] };

/** Tableau repéré : feuille, ligne d'en-têtes (indice à partir de 0) et colonne de chaque en-tête. */
export interface TableauRepere {
  readonly feuille: Feuille;
  readonly ligneEntetes: number;
  readonly colonnes: ReadonlyMap<string, number>;
}

export type ResultatReperage =
  | { readonly ok: true; readonly tableau: TableauRepere }
  | { readonly ok: false; readonly changements: readonly ChangementStructure[] };

/** Nombre de lignes parcourues pour trouver les en-têtes (titres, lignes vides au-dessus). */
export const LIGNES_EXPLOREES = 30;

function entetesDeLigne(ligne: readonly unknown[]): string[] {
  const textes = ligne.map((valeur) =>
    texteCellule(typeof valeur === 'string' || typeof valeur === 'number' ? valeur : null),
  );
  while (textes.length > 0 && textes.at(-1) === '') {
    textes.pop();
  }
  return textes;
}

function memesEntetes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entete, index) => entete === b[index]);
}

/** Colonnes communes dont l'ordre relatif a changé. */
function colonnesDeplacees(attendues: readonly string[], trouvees: readonly string[]): string[] {
  const communesAttendues = attendues.filter((e) => trouvees.includes(e));
  const communesTrouvees = trouvees.filter((e) => attendues.includes(e));
  return communesAttendues.filter((entete, index) => communesTrouvees[index] !== entete);
}

function comparer(
  attendues: readonly string[],
  trouvees: readonly string[],
): ChangementStructure[] {
  const ajoutees = trouvees.filter((e) => e !== '' && !attendues.includes(e));
  const supprimees = attendues.filter((e) => !trouvees.includes(e));
  // Sans ajout ni suppression, toute colonne qui a changé de position a été déplacée
  // (par exemple décalée par une colonne vide insérée) ; sinon, seul l'ordre relatif compte.
  const deplacees =
    ajoutees.length === 0 && supprimees.length === 0
      ? attendues.filter((entete, index) => trouvees.indexOf(entete) !== index)
      : colonnesDeplacees(attendues, trouvees);
  const changements: ChangementStructure[] = [
    ...(ajoutees.length > 0 ? [{ nature: 'colonnes-ajoutees' as const, colonnes: ajoutees }] : []),
    ...(supprimees.length > 0
      ? [{ nature: 'colonnes-supprimees' as const, colonnes: supprimees }]
      : []),
    ...(deplacees.length > 0
      ? [{ nature: 'colonnes-deplacees' as const, colonnes: deplacees }]
      : []),
  ];
  // Cas résiduel (en-têtes en double, par exemple) : on ne devine pas.
  return changements.length > 0 ? changements : [{ nature: 'entetes-introuvables' }];
}

/**
 * Retrouve le tableau décrit par l'empreinte. Les en-têtes peuvent avoir glissé de quelques lignes ;
 * tout autre changement (onglet, colonnes) est signalé au lieu d'être deviné.
 */
export function repererTableau(classeur: Classeur, empreinte: EmpreinteSource): ResultatReperage {
  const feuille =
    empreinte.onglet === undefined
      ? classeur.feuilles[0]
      : classeur.feuilles.find((f) => f.nom === empreinte.onglet);
  if (feuille === undefined) {
    return {
      ok: false,
      changements: [
        {
          nature: 'onglet-introuvable',
          onglet: empreinte.onglet ?? '',
          ongletsDisponibles: classeur.feuilles.map((f) => f.nom),
        },
      ],
    };
  }

  let meilleure: { ligne: number; entetes: string[]; score: number } | null = null;
  for (const [ligne, valeurs] of feuille.lignes.slice(0, LIGNES_EXPLOREES).entries()) {
    const entetes = entetesDeLigne(valeurs);
    if (memesEntetes(entetes, empreinte.entetes)) {
      return {
        ok: true,
        tableau: {
          feuille,
          ligneEntetes: ligne,
          colonnes: new Map(entetes.map((entete, index) => [entete, index])),
        },
      };
    }
    const score = entetes.filter((e) => empreinte.entetes.includes(e)).length;
    if (score > (meilleure?.score ?? 0)) {
      meilleure = { ligne, entetes, score };
    }
  }
  return {
    ok: false,
    changements:
      meilleure === null
        ? [{ nature: 'entetes-introuvables' }]
        : comparer(empreinte.entetes, meilleure.entetes),
  };
}
