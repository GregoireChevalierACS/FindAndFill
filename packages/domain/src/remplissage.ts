import { texteCellule, type Classeur, type ValeurCellule } from './classeur.js';
import { ecrireAdresse, lireAdresse, numeroColonne } from './colonnes.js';
import { anneeDe, lireDate, moisDe } from './dates.js';
import type { Regle, ModeleRemplissage } from './modele-remplissage.js';
import { centimes, montantDeCellule, type Centimes } from './montant.js';
import { repererTableau, type ChangementStructure, type TableauRepere } from './structure.js';

/** Ce que l'on sait de la cible sans la modifier. */
export interface VueCible {
  onglets(): readonly string[];
  /** Texte des cellules non vides d'une colonne, par numéro de ligne. */
  colonne(onglet: string, colonne: number): ReadonlyMap<number, string>;
  contenu(onglet: string, adresse: string): 'vide' | 'valeur' | 'formule';
}

/** Origine d'une valeur écrite : la règle et les lignes sources (numérotées à partir de 1). */
export interface Provenance {
  readonly regle: string;
  readonly source: string;
  readonly lignes: readonly number[];
}

export interface CelluleARemplir {
  readonly onglet: string;
  readonly adresse: string;
  readonly valeur: Centimes;
  readonly provenance: Provenance;
}

export type ErreurRemplissage =
  | { readonly nature: 'source-absente'; readonly source: string }
  | {
      readonly nature: 'structure-modifiee';
      readonly source: string;
      readonly changements: readonly ChangementStructure[];
    }
  | { readonly nature: 'source-inconnue'; readonly regle: string; readonly source: string }
  | { readonly nature: 'colonne-inconnue'; readonly regle: string; readonly colonne: string }
  | { readonly nature: 'onglet-cible-introuvable'; readonly regle: string; readonly onglet: string }
  | {
      readonly nature: 'valeur-illisible';
      readonly regle: string;
      readonly ligne: number;
      readonly colonne: string;
      readonly valeur: string;
    }
  | {
      readonly nature: 'cible-formule' | 'cible-en-double';
      readonly regle: string;
      readonly onglet: string;
      readonly adresse: string;
    };

export type Avertissement =
  | {
      readonly nature: 'cle-absente-de-la-cible';
      readonly regle: string;
      readonly cle: string;
      readonly montant: Centimes;
      readonly lignes: readonly number[];
    }
  | { readonly nature: 'hors-periode'; readonly regle: string; readonly lignes: readonly number[] };

export type ResultatRemplissage =
  | {
      readonly ok: true;
      readonly cellules: readonly CelluleARemplir[];
      readonly avertissements: readonly Avertissement[];
    }
  | { readonly ok: false; readonly erreurs: readonly ErreurRemplissage[] };

interface Cumul {
  montant: number;
  readonly lignes: number[];
}

interface LigneLue {
  readonly numero: number;
  readonly lire: (colonne: string) => ValeurCellule;
}

function colonnesDeLaRegle(regle: Regle): string[] {
  return [
    regle.montant.plus,
    ...(regle.montant.moins === undefined ? [] : [regle.montant.moins]),
    ...(regle.filtres ?? []).map((filtre) => filtre.colonne),
    ...('cle' in regle ? [regle.cle] : []),
    ...('date' in regle ? [regle.date] : []),
  ];
}

function lignesDuTableau(tableau: TableauRepere): LigneLue[] {
  return tableau.feuille.lignes
    .map((valeurs, index) => ({ valeurs, numero: index + 1 }))
    .slice(tableau.ligneEntetes + 1)
    .filter(({ valeurs }) => valeurs.some((valeur) => texteCellule(valeur) !== ''))
    .map(({ valeurs, numero }) => ({
      numero,
      // Les colonnes ont été vérifiées avant lecture : l'indice existe toujours.
      lire: (colonne: string) => valeurs[tableau.colonnes.get(colonne) as number] ?? null,
    }));
}

function retenue(regle: Regle, ligne: LigneLue): boolean {
  return (regle.filtres ?? []).every((filtre) => {
    const egal = texteCellule(ligne.lire(filtre.colonne)) === filtre.valeur;
    return filtre.operateur === 'egal' ? egal : !egal;
  });
}

/** Index inverse de la colonne de clés de la cible : clé → première ligne où elle apparaît. */
function lignesParCle(cible: VueCible, onglet: string, colonne: string): Map<string, number> {
  const index = new Map<string, number>();
  for (const [ligne, texte] of cible.colonne(onglet, numeroColonne(colonne))) {
    if (!index.has(texte)) {
      index.set(texte, ligne);
    }
  }
  return index;
}

class Calcul {
  readonly erreurs: ErreurRemplissage[] = [];
  readonly avertissements: Avertissement[] = [];
  readonly cumuls = new Map<
    string,
    { onglet: string; adresse: string; regle: Regle; cumul: Cumul }
  >();
  private readonly doublons = new Set<string>();

  constructor(
    private readonly modele: ModeleRemplissage,
    private readonly cible: VueCible,
  ) {}

  private ajouter(regle: Regle, onglet: string, adresse: string, montant: number, ligne?: number) {
    const cle = `${onglet}!${adresse}`;
    let entree = this.cumuls.get(cle);
    if (entree === undefined) {
      entree = { onglet, adresse, regle, cumul: { montant: 0, lignes: [] } };
      this.cumuls.set(cle, entree);
    } else if (entree.regle !== regle) {
      if (!this.doublons.has(cle)) {
        this.doublons.add(cle);
        this.erreurs.push({ nature: 'cible-en-double', regle: regle.id, onglet, adresse });
      }
      return;
    }
    entree.cumul.montant += montant;
    if (ligne !== undefined) {
      entree.cumul.lignes.push(ligne);
    }
  }

  private montant(regle: Regle, ligne: LigneLue): number | null {
    const lire = (colonne: string): number | null => {
      const valeur = ligne.lire(colonne);
      const montant = montantDeCellule(valeur);
      if (montant === null) {
        this.illisible(regle, ligne, colonne, valeur);
      }
      return montant;
    };
    const plus = lire(regle.montant.plus);
    const moins = regle.montant.moins === undefined ? 0 : lire(regle.montant.moins);
    return plus === null || moins === null ? null : plus - moins;
  }

  private mois(
    regle: Regle & { date: string },
    ligne: LigneLue,
    horsPeriode: number[],
  ): number | null {
    const valeur = ligne.lire(regle.date);
    const date = lireDate(valeur);
    if (date === null) {
      this.illisible(regle, ligne, regle.date, valeur);
      return null;
    }
    if (anneeDe(date) !== this.modele.annee) {
      horsPeriode.push(ligne.numero);
      return null;
    }
    return moisDe(date);
  }

  private illisible(regle: Regle, ligne: LigneLue, colonne: string, valeur: ValeurCellule) {
    this.erreurs.push({
      nature: 'valeur-illisible',
      regle: regle.id,
      ligne: ligne.numero,
      colonne,
      valeur: texteCellule(valeur),
    });
  }

  appliquer(regle: Regle, tableau: TableauRepere): void {
    const { onglet } = regle.cible;
    const horsPeriode: number[] = [];
    const clesAbsentes = new Map<string, Cumul>();
    const index =
      regle.type === 'mensuel-par-cle' || regle.type === 'par-cle'
        ? lignesParCle(this.cible, onglet, regle.cible.colonneCles)
        : new Map<string, number>();

    if (regle.type === 'mensuel') {
      for (let mois = 1; mois <= 12; mois++) {
        const adresse = ecrireAdresse({
          colonne: numeroColonne(regle.cible.colonne),
          ligne: regle.cible.ligneJanvier + mois - 1,
        });
        this.ajouter(regle, onglet, adresse, 0);
      }
    }
    if (regle.type === 'total') {
      this.ajouter(regle, onglet, ecrireAdresse(lireAdresse(regle.cible.adresse)), 0);
    }

    for (const ligne of lignesDuTableau(tableau).filter((l) => retenue(regle, l))) {
      const montant = this.montant(regle, ligne);
      const mois = 'date' in regle ? this.mois(regle, ligne, horsPeriode) : 0;
      if (montant === null || mois === null) {
        continue;
      }
      switch (regle.type) {
        case 'total':
          this.ajouter(
            regle,
            onglet,
            ecrireAdresse(lireAdresse(regle.cible.adresse)),
            montant,
            ligne.numero,
          );
          break;
        case 'mensuel':
          this.ajouter(
            regle,
            onglet,
            ecrireAdresse({
              colonne: numeroColonne(regle.cible.colonne),
              ligne: regle.cible.ligneJanvier + mois - 1,
            }),
            montant,
            ligne.numero,
          );
          break;
        case 'mensuel-par-cle':
        case 'par-cle': {
          const cle = texteCellule(ligne.lire(regle.cle));
          const ligneCible = index.get(cle);
          if (ligneCible === undefined) {
            const absente = clesAbsentes.get(cle) ?? { montant: 0, lignes: [] };
            absente.montant += montant;
            absente.lignes.push(ligne.numero);
            clesAbsentes.set(cle, absente);
            break;
          }
          if (regle.type === 'par-cle') {
            this.ajouter(
              regle,
              onglet,
              ecrireAdresse({ colonne: numeroColonne(regle.cible.colonne), ligne: ligneCible }),
              montant,
              ligne.numero,
            );
            break;
          }
          const premiere = numeroColonne(regle.cible.premiereColonneMois);
          // Toute la ligne est écrite, zéros compris, pour effacer les valeurs d'un remplissage précédent.
          for (let m = 1; m <= 12; m++) {
            this.ajouter(
              regle,
              onglet,
              ecrireAdresse({ colonne: premiere + m - 1, ligne: ligneCible }),
              m === mois ? montant : 0,
              m === mois ? ligne.numero : undefined,
            );
          }
        }
      }
    }

    for (const [cle, { montant, lignes }] of clesAbsentes) {
      this.avertissements.push({
        nature: 'cle-absente-de-la-cible',
        regle: regle.id,
        cle,
        montant: centimes(montant),
        lignes,
      });
    }
    if (horsPeriode.length > 0) {
      this.avertissements.push({ nature: 'hors-periode', regle: regle.id, lignes: horsPeriode });
    }
  }

  cellules(): CelluleARemplir[] {
    return [...this.cumuls.values()].map(({ onglet, adresse, regle, cumul }) => ({
      onglet,
      adresse,
      valeur: centimes(cumul.montant),
      provenance: { regle: regle.id, source: regle.source, lignes: cumul.lignes },
    }));
  }
}

/**
 * Calcule, sans rien écrire, les cellules du gabarit à remplir et l'origine de chaque valeur.
 * Toute anomalie bloquante est renvoyée en erreur ; rien n'est deviné.
 */
export function calculerRemplissage(
  modele: ModeleRemplissage,
  sources: ReadonlyMap<string, Classeur>,
  cible: VueCible,
): ResultatRemplissage {
  const calcul = new Calcul(modele, cible);
  const tableaux = new Map<string, TableauRepere>();
  for (const source of modele.sources) {
    const classeur = sources.get(source.id);
    if (classeur === undefined) {
      calcul.erreurs.push({ nature: 'source-absente', source: source.id });
      continue;
    }
    const reperage = repererTableau(classeur, source.empreinte);
    if (reperage.ok) {
      tableaux.set(source.id, reperage.tableau);
    } else {
      calcul.erreurs.push({
        nature: 'structure-modifiee',
        source: source.id,
        changements: reperage.changements,
      });
    }
  }

  const onglets = cible.onglets();
  for (const regle of modele.regles) {
    const definie = modele.sources.some((source) => source.id === regle.source);
    if (!definie) {
      calcul.erreurs.push({ nature: 'source-inconnue', regle: regle.id, source: regle.source });
      continue;
    }
    if (!onglets.includes(regle.cible.onglet)) {
      calcul.erreurs.push({
        nature: 'onglet-cible-introuvable',
        regle: regle.id,
        onglet: regle.cible.onglet,
      });
      continue;
    }
    const tableau = tableaux.get(regle.source);
    if (tableau === undefined) {
      continue;
    }
    const inconnues = colonnesDeLaRegle(regle).filter((colonne) => !tableau.colonnes.has(colonne));
    if (inconnues.length > 0) {
      calcul.erreurs.push(
        ...inconnues.map((colonne) => ({
          nature: 'colonne-inconnue' as const,
          regle: regle.id,
          colonne,
        })),
      );
      continue;
    }
    calcul.appliquer(regle, tableau);
  }

  const cellules = calcul.cellules();
  for (const cellule of cellules) {
    if (cible.contenu(cellule.onglet, cellule.adresse) === 'formule') {
      calcul.erreurs.push({
        nature: 'cible-formule',
        regle: cellule.provenance.regle,
        onglet: cellule.onglet,
        adresse: cellule.adresse,
      });
    }
  }

  return calcul.erreurs.length > 0
    ? { ok: false, erreurs: calcul.erreurs }
    : { ok: true, cellules, avertissements: calcul.avertissements };
}
