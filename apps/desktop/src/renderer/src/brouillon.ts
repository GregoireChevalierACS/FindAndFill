import {
  ecrireAdresse,
  empreinteDeLigne,
  lettresColonne,
  verifierModele,
  type EmpreinteSource,
  type ModeleRemplissage,
  type ProblemeModele,
  type Regle,
} from '@findandfill/domain';
import type { ApercuFeuille, ApercuOnglet } from '../../shared/api.js';

/**
 * Brouillon de modèle manipulé par l'éditeur : un modèle en cours de saisie, plus les aperçus
 * des fichiers ouverts pour le configurer. Toutes les fonctions sont pures.
 */

export interface FichierSource {
  readonly chemin: string;
  readonly feuilles: readonly ApercuFeuille[];
  readonly onglet: string;
  /** Ligne d'en-têtes choisie (indice à partir de 0), ou `null` si aucune. */
  readonly ligneEntetes: number | null;
}

export interface SourceBrouillon {
  readonly id: string;
  readonly libelle: string;
  readonly empreinte: EmpreinteSource;
  /** Fichier ouvert pour configurer la source ; absent pour un modèle rouvert. */
  readonly fichier: FichierSource | null;
}

export interface GabaritBrouillon {
  readonly chemin: string;
  readonly onglets: readonly ApercuOnglet[];
}

export interface Brouillon {
  readonly nom: string;
  readonly annee: number;
  readonly sources: readonly SourceBrouillon[];
  readonly regles: readonly Regle[];
  readonly gabarit: GabaritBrouillon | null;
}

export type TypeRegle = Regle['type'];

export const LIBELLES_TYPES: Readonly<Record<TypeRegle, { titre: string; aide: string }>> = {
  'mensuel-par-cle': {
    titre: 'Mois en colonnes, une ligne par clé',
    aide: 'Cumule par clé (affaire, fournisseur…) et par mois ; la clé est retrouvée dans une colonne du gabarit.',
  },
  mensuel: {
    titre: 'Un mois par ligne',
    aide: 'Cumule par mois dans une colonne, de janvier à décembre sur douze lignes consécutives.',
  },
  'par-cle': {
    titre: 'Un total par clé',
    aide: 'Cumule par clé dans une colonne ; la clé est retrouvée dans une colonne du gabarit.',
  },
  total: {
    titre: 'Un total dans une cellule',
    aide: 'Cumule toutes les lignes retenues dans une seule cellule.',
  },
};

export function brouillonVide(annee: number): Brouillon {
  return { nom: 'Nouveau modèle', annee, sources: [], regles: [], gabarit: null };
}

/** Identifiant lisible tiré d'un libellé : « Export des ventes » → « export-des-ventes ». */
export function identifiant(libelle: string): string {
  const base = libelle
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base === '' ? 'element' : base;
}

/** Premier identifiant libre : « ventes », sinon « ventes-2 », « ventes-3 »… */
export function identifiantLibre(base: string, pris: readonly string[]): string {
  if (!pris.includes(base)) {
    return base;
  }
  let numero = 2;
  while (pris.includes(`${base}-${numero}`)) {
    numero++;
  }
  return `${base}-${numero}`;
}

function nomSansExtension(chemin: string): string {
  const nom = chemin.slice(Math.max(chemin.lastIndexOf('/'), chemin.lastIndexOf('\\')) + 1);
  const point = nom.lastIndexOf('.');
  return point > 0 ? nom.slice(0, point) : nom;
}

/** Empreinte tirée du fichier ouvert : onglet choisi (sauf CSV/FEC) et ligne d'en-têtes. */
export function empreinteDuFichier(fichier: FichierSource): EmpreinteSource {
  const feuille = fichier.feuilles.find((f) => f.nom === fichier.onglet) ?? fichier.feuilles[0];
  const onglet = feuille === undefined || feuille.nom === '' ? undefined : feuille.nom;
  if (feuille === undefined || fichier.ligneEntetes === null) {
    return onglet === undefined ? { entetes: [] } : { onglet, entetes: [] };
  }
  return empreinteDeLigne(feuille, fichier.ligneEntetes, onglet);
}

function avecFichier(source: SourceBrouillon, fichier: FichierSource): SourceBrouillon {
  return { ...source, fichier, empreinte: empreinteDuFichier(fichier) };
}

function fichierInitial(chemin: string, feuilles: readonly ApercuFeuille[]): FichierSource {
  const [premiere] = feuilles;
  return {
    chemin,
    feuilles,
    onglet: premiere?.nom ?? '',
    ligneEntetes: premiere?.ligneEntetesProposee ?? null,
  };
}

export function ajouterSource(
  brouillon: Brouillon,
  chemin: string,
  feuilles: readonly ApercuFeuille[],
): Brouillon {
  const libelle = nomSansExtension(chemin);
  const id = identifiantLibre(
    identifiant(libelle),
    brouillon.sources.map((s) => s.id),
  );
  const source = avecFichier(
    { id, libelle, empreinte: { entetes: [] }, fichier: null },
    fichierInitial(chemin, feuilles),
  );
  return { ...brouillon, sources: [...brouillon.sources, source] };
}

function majSourceParId(
  brouillon: Brouillon,
  id: string,
  transformer: (source: SourceBrouillon) => SourceBrouillon,
): Brouillon {
  return {
    ...brouillon,
    sources: brouillon.sources.map((source) => (source.id === id ? transformer(source) : source)),
  };
}

/** Rattache un (nouveau) fichier à une source existante, en gardant son identifiant et son libellé. */
export function remplacerFichierSource(
  brouillon: Brouillon,
  id: string,
  chemin: string,
  feuilles: readonly ApercuFeuille[],
): Brouillon {
  return majSourceParId(brouillon, id, (source) =>
    avecFichier(source, fichierInitial(chemin, feuilles)),
  );
}

/** Change d'onglet (la ligne d'en-têtes proposée pour cet onglet est reprise) ou de ligne d'en-têtes. */
export function choisirEntetes(
  brouillon: Brouillon,
  id: string,
  choix: { readonly onglet?: string; readonly ligneEntetes?: number },
): Brouillon {
  return majSourceParId(brouillon, id, (source) => {
    if (source.fichier === null) {
      return source;
    }
    const onglet = choix.onglet ?? source.fichier.onglet;
    const proposee =
      source.fichier.feuilles.find((f) => f.nom === onglet)?.ligneEntetesProposee ?? null;
    const ligneEntetes =
      choix.ligneEntetes ?? (choix.onglet === undefined ? source.fichier.ligneEntetes : proposee);
    return avecFichier(source, { ...source.fichier, onglet, ligneEntetes });
  });
}

export function renommerSource(brouillon: Brouillon, id: string, libelle: string): Brouillon {
  return majSourceParId(brouillon, id, (source) => ({ ...source, libelle }));
}

export function retirerSource(brouillon: Brouillon, id: string): Brouillon {
  return { ...brouillon, sources: brouillon.sources.filter((source) => source.id !== id) };
}

function premiereQuiRessemble(entetes: readonly string[], motif: RegExp): string {
  return entetes.find((entete) => motif.test(entete)) ?? '';
}

const MOTIF_DATE = /date/i;
const MOTIF_MONTANT = /montant|\bht\b|d[ée]bit|cr[ée]dit|total/i;

/** Cible par défaut de chaque type de règle, à ajuster en cliquant dans le gabarit. */
function cibleParDefaut(type: TypeRegle, onglet: string): Regle['cible'] {
  switch (type) {
    case 'mensuel-par-cle':
      return { onglet, colonneCles: 'A', premiereColonneMois: 'C' };
    case 'mensuel':
      return { onglet, colonne: 'B', ligneJanvier: 2 };
    case 'par-cle':
      return { onglet, colonneCles: 'A', colonne: 'C' };
    case 'total':
      return { onglet, adresse: 'B2' };
  }
}

/** Règle du type demandé, en reprenant ce qui peut l'être d'une règle existante. */
export function regleDeType(
  type: TypeRegle,
  base: { id: string; source: string; entetes: readonly string[]; onglet: string },
  precedente?: Regle,
): Regle {
  const commune = {
    id: base.id,
    source: precedente?.source ?? base.source,
    montant: precedente?.montant ?? { plus: premiereQuiRessemble(base.entetes, MOTIF_MONTANT) },
    ...(precedente?.filtres === undefined ? {} : { filtres: precedente.filtres }),
  };
  const cle = precedente !== undefined && 'cle' in precedente ? precedente.cle : '';
  const date =
    precedente !== undefined && 'date' in precedente
      ? precedente.date
      : premiereQuiRessemble(base.entetes, MOTIF_DATE);
  const onglet = precedente?.cible.onglet ?? base.onglet;
  const cible = cibleParDefaut(type, onglet);
  switch (type) {
    case 'mensuel-par-cle':
      return { ...commune, type, cle, date, cible } as Regle;
    case 'mensuel':
      return { ...commune, type, date, cible } as Regle;
    case 'par-cle':
      return { ...commune, type, cle, cible } as Regle;
    case 'total':
      return { ...commune, type, cible } as Regle;
  }
}

export function ajouterRegle(brouillon: Brouillon, type: TypeRegle): Brouillon {
  const [source] = brouillon.sources;
  const regle = regleDeType(type, {
    id: identifiantLibre(
      'regle',
      brouillon.regles.map((r) => r.id),
    ),
    source: source?.id ?? '',
    entetes: source?.empreinte.entetes ?? [],
    onglet: brouillon.gabarit?.onglets[0]?.nom ?? '',
  });
  return { ...brouillon, regles: [...brouillon.regles, regle] };
}

export function majRegle(brouillon: Brouillon, index: number, regle: Regle): Brouillon {
  return { ...brouillon, regles: brouillon.regles.map((r, i) => (i === index ? regle : r)) };
}

export function retirerRegle(brouillon: Brouillon, index: number): Brouillon {
  return { ...brouillon, regles: brouillon.regles.filter((_, i) => i !== index) };
}

export type ChampCible =
  'colonneCles' | 'premiereColonneMois' | 'colonne' | 'ligneJanvier' | 'adresse';

/** Applique le clic sur une cellule du gabarit (ligne et colonne à partir de 1) au champ choisi. */
export function appliquerClic(
  regle: Regle,
  champ: ChampCible,
  ligne: number,
  colonne: number,
): Regle {
  const valeur =
    champ === 'ligneJanvier'
      ? ligne
      : champ === 'adresse'
        ? ecrireAdresse({ colonne, ligne })
        : lettresColonne(colonne);
  return { ...regle, cible: { ...regle.cible, [champ]: valeur } } as Regle;
}

/** Retire les champs facultatifs vides avant d'enregistrer. */
function nettoyer(regle: Regle): Regle {
  const { moins, ...montant } = regle.montant;
  const { filtres, ...reste } = regle;
  return {
    ...reste,
    montant: moins === undefined || moins === '' ? montant : { ...montant, moins },
    ...(filtres === undefined || filtres.length === 0 ? {} : { filtres }),
  };
}

export function versModele(brouillon: Brouillon): ModeleRemplissage {
  return {
    nom: brouillon.nom,
    annee: brouillon.annee,
    sources: brouillon.sources.map(({ id, libelle, empreinte }) => ({ id, libelle, empreinte })),
    regles: brouillon.regles.map(nettoyer),
  };
}

export function depuisModele(modele: ModeleRemplissage): Brouillon {
  return {
    nom: modele.nom,
    annee: modele.annee,
    sources: modele.sources.map((source) => ({ ...source, fichier: null })),
    regles: modele.regles,
    gabarit: null,
  };
}

export function problemes(brouillon: Brouillon): ProblemeModele[] {
  return verifierModele(versModele(brouillon));
}

/** Fichiers à reprendre dans l'écran « Remplir », si chaque source et le gabarit en ont un. */
export function fichiersPourRemplir(
  brouillon: Brouillon,
): { sources: Record<string, string>; gabarit: string } | null {
  if (brouillon.gabarit === null || brouillon.sources.some((s) => s.fichier === null)) {
    return null;
  }
  return {
    sources: Object.fromEntries(
      brouillon.sources.map((source) => [source.id, source.fichier?.chemin ?? '']),
    ),
    gabarit: brouillon.gabarit.chemin,
  };
}
