import { lireDate, type DateIso } from './dates.js';
import { lireMontant, type Centimes } from './montant.js';

/**
 * Un morceau de texte d'une page PDF, tel que l'adapter l'extrait : position et taille en points,
 * origine en haut à gauche de la page (y croît vers le bas), pages numérotées à partir de 1.
 */
export interface FragmentDeTexte {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly texte: string;
}

/** Le texte d'un PDF, sans interprétation. Un PDF scanné n'a aucun fragment. */
export interface TexteDuPdf {
  readonly pages: number;
  readonly fragments: readonly FragmentDeTexte[];
}

export interface Point {
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

export interface Rectangle extends Point {
  readonly largeur: number;
  readonly hauteur: number;
}

/**
 * Libellé fixe de la mise en page (« Total TTC », « N° »), cherché près de sa position habituelle.
 * Un fragment le contient s'il est ce libellé, ou s'il commence par lui suivi d'un séparateur
 * (« N° : D-2027-0001 »). Quand le libellé figure plusieurs fois, la plus proche l'emporte ;
 * à égalité, la première dans l'ordre du texte.
 */
export interface AncrePdf {
  readonly id: string;
  readonly texte: string;
  readonly position: Point;
}

/**
 * Où lire un champ :
 * - `rectangle` : les fragments dont le centre est dans le rectangle, ligne par ligne ; `ligne`
 *   n'en garde qu'une (à partir de 0, ou depuis la fin si elle est négative : -1 est la dernière) ;
 * - `apres-ancre` : la suite de la ligne de l'ancre, à sa droite (« N° : D-2027-0001 » donne
 *   « D-2027-0001 », « Total TTC      5 133,63 € » donne « 5 133,63 € »).
 */
export type ZonePdf =
  | { readonly nature: 'rectangle'; readonly rectangle: Rectangle; readonly ligne?: number }
  | { readonly nature: 'apres-ancre'; readonly ancre: string };

/**
 * Conversion du texte lu : `montant` accepte le symbole € ou EUR ; `date` les formats de
 * `lireDate` ; `entier`, un nombre éventuellement suivi d'une unité (« 90 jours »).
 */
export type TypeDeChampPdf = 'texte' | 'montant' | 'date' | 'entier';

export interface ChampPdf {
  readonly zone: ZonePdf;
  readonly type: TypeDeChampPdf;
}

/**
 * Modèle de lecture d'une mise en page de PDF texte. Les ancres sont son empreinte : si l'une
 * manque ou a bougé de plus que la tolérance, la mise en page a changé et rien n'est lu.
 */
export interface ModeleDeLecturePdf {
  /** Écart admis, en points, sur chaque axe, entre la position d'une ancre et celle du modèle. */
  readonly tolerance: number;
  readonly ancres: readonly AncrePdf[];
  readonly champs: Readonly<Record<string, ChampPdf>>;
}

export type ChangementDeMiseEnPage =
  | { readonly nature: 'aucun-texte' }
  | { readonly nature: 'ancre-introuvable'; readonly ancre: string; readonly texte: string }
  | {
      readonly nature: 'ancre-deplacee';
      readonly ancre: string;
      readonly texte: string;
      readonly attendue: Point;
      readonly trouvee: Point;
    };

export type ErreurDeChamp =
  | { readonly nature: 'ancre-inconnue'; readonly champ: string; readonly ancre: string }
  | { readonly nature: 'champ-vide'; readonly champ: string }
  | {
      readonly nature: 'champ-illisible';
      readonly champ: string;
      readonly type: TypeDeChampPdf;
      readonly texte: string;
    };

/** Valeur lue, avec son texte d'origine et les fragments dont elle vient (piste d'audit). */
export type ChampLu = (
  | { readonly type: 'texte'; readonly valeur: string }
  | { readonly type: 'montant'; readonly valeur: Centimes }
  | { readonly type: 'date'; readonly valeur: DateIso }
  | { readonly type: 'entier'; readonly valeur: number }
) & { readonly texte: string; readonly fragments: readonly FragmentDeTexte[] };

export type ResultatLecturePdf =
  | { readonly ok: true; readonly champs: Readonly<Record<string, ChampLu>> }
  | {
      readonly ok: false;
      readonly changements: readonly ChangementDeMiseEnPage[];
      readonly erreurs: readonly ErreurDeChamp[];
    };

interface AncreTrouvee {
  readonly fragment: FragmentDeTexte;
  /** Ce qui suit le libellé dans le même fragment. */
  readonly suite: string;
}

const SEPARATEUR = /^[^\p{L}\p{N}]/u;
const DEBUT_DE_VALEUR = /^[\s:]+/u;
const DEVISE = /\s*(?:€|EUR)$/u;
const ENTIER = /^(\d+)(?:\s+\p{L}+)?$/u;

/** Ce qui suit le libellé dans le fragment, ou `null` s'il ne commence pas par ce libellé. */
function suiteApresLibelle(fragment: FragmentDeTexte, libelle: string): string | null {
  const texte = fragment.texte.trim();
  if (!texte.startsWith(libelle)) return null;
  const suite = texte.slice(libelle.length);
  return suite === '' || SEPARATEUR.test(suite) ? suite : null;
}

function ecart(fragment: FragmentDeTexte, position: Point): number {
  return fragment.page === position.page
    ? Math.max(Math.abs(fragment.x - position.x), Math.abs(fragment.y - position.y))
    : Number.POSITIVE_INFINITY;
}

/**
 * Fragments d'une même page regroupés en lignes, de haut en bas, chacune de gauche à droite. Un
 * fragment rejoint la ligne en cours s'il commence moins d'une demi-hauteur sous son premier.
 */
function enLignes(fragments: readonly FragmentDeTexte[]): FragmentDeTexte[][] {
  const tries = [...fragments].sort((a, b) => a.y - b.y);
  const lignes: FragmentDeTexte[][] = [];
  for (const fragment of tries) {
    const courante = lignes.at(-1);
    const premier = courante?.[0];
    if (
      courante !== undefined &&
      premier !== undefined &&
      fragment.y - premier.y < premier.hauteur / 2
    ) {
      courante.push(fragment);
    } else {
      lignes.push([fragment]);
    }
  }
  return lignes.map((ligne) => ligne.sort((a, b) => a.x - b.x));
}

const texteDeLaLigne = (ligne: readonly FragmentDeTexte[]): string =>
  ligne.map((fragment) => fragment.texte.trim()).join(' ');

function dansLeRectangle(fragment: FragmentDeTexte, rectangle: Rectangle): boolean {
  const centreX = fragment.x + fragment.largeur / 2;
  const centreY = fragment.y + fragment.hauteur / 2;
  return (
    fragment.page === rectangle.page &&
    centreX >= rectangle.x &&
    centreX <= rectangle.x + rectangle.largeur &&
    centreY >= rectangle.y &&
    centreY <= rectangle.y + rectangle.hauteur
  );
}

interface TexteDeZone {
  readonly texte: string;
  readonly fragments: readonly FragmentDeTexte[];
}

function lireLeRectangle(
  fragments: readonly FragmentDeTexte[],
  rectangle: Rectangle,
  ligne: number | undefined,
): TexteDeZone {
  const lignes = enLignes(fragments.filter((fragment) => dansLeRectangle(fragment, rectangle)));
  const retenues = ligne === undefined ? lignes : [lignes.at(ligne) ?? []];
  return {
    texte: retenues.map(texteDeLaLigne).join('\n'),
    fragments: retenues.flat(),
  };
}

function lireApresLAncre(fragments: readonly FragmentDeTexte[], ancre: AncreTrouvee): TexteDeZone {
  const { fragment } = ancre;
  const aDroite = fragments
    .filter(
      (autre) =>
        autre.page === fragment.page &&
        autre.x >= fragment.x + fragment.largeur &&
        Math.abs(autre.y - fragment.y) < fragment.hauteur / 2,
    )
    .sort((a, b) => a.x - b.x);
  const suite = ancre.suite.replace(DEBUT_DE_VALEUR, '');
  const morceaux = [suite, ...aDroite.map((autre) => autre.texte.trim())];
  return {
    texte: morceaux.join(' '),
    fragments: [fragment, ...aDroite],
  };
}

function convertir(type: TypeDeChampPdf, { texte, fragments }: TexteDeZone): ChampLu | null {
  const origine = { texte, fragments };
  switch (type) {
    case 'texte':
      return { type, valeur: texte, ...origine };
    case 'montant': {
      const valeur = lireMontant(texte.replace(DEVISE, ''));
      return valeur === null ? null : { type, valeur, ...origine };
    }
    case 'date': {
      const valeur = lireDate(texte);
      return valeur === null ? null : { type, valeur, ...origine };
    }
    case 'entier': {
      const nombre = ENTIER.exec(texte)?.[1];
      return nombre === undefined ? null : { type, valeur: Number(nombre), ...origine };
    }
  }
}

/**
 * Repère les ancres du modèle. Renvoie les changements de mise en page, ou chaque ancre trouvée.
 */
function repererLesAncres(
  texte: TexteDuPdf,
  ancres: readonly AncrePdf[],
  tolerance: number,
): { changements: ChangementDeMiseEnPage[]; trouvees: Map<string, AncreTrouvee> } {
  const changements: ChangementDeMiseEnPage[] = [];
  const trouvees = new Map<string, AncreTrouvee>();
  for (const ancre of ancres) {
    let meilleure: (AncreTrouvee & { readonly ecart: number }) | undefined;
    for (const fragment of texte.fragments) {
      const suite = suiteApresLibelle(fragment, ancre.texte);
      const distance = ecart(fragment, ancre.position);
      if (suite !== null && (meilleure === undefined || distance < meilleure.ecart)) {
        meilleure = { fragment, suite, ecart: distance };
      }
    }
    if (meilleure === undefined) {
      changements.push({ nature: 'ancre-introuvable', ancre: ancre.id, texte: ancre.texte });
    } else if (meilleure.ecart > tolerance) {
      const { page, x, y } = meilleure.fragment;
      changements.push({
        nature: 'ancre-deplacee',
        ancre: ancre.id,
        texte: ancre.texte,
        attendue: ancre.position,
        trouvee: { page, x, y },
      });
    } else {
      trouvees.set(ancre.id, meilleure);
    }
  }
  return { changements, trouvees };
}

/**
 * Lit les champs d'un PDF texte selon un modèle. Si la mise en page ne correspond pas au modèle
 * (ancre absente ou déplacée, aucun texte), aucun champ n'est lu : un devis d'une autre mise en
 * page est refusé, jamais lu de travers. Un champ vide ou illisible est une erreur, pas un défaut.
 */
export function lirePdfParZones(texte: TexteDuPdf, modele: ModeleDeLecturePdf): ResultatLecturePdf {
  if (texte.fragments.length === 0) {
    return { ok: false, changements: [{ nature: 'aucun-texte' }], erreurs: [] };
  }
  const { changements, trouvees } = repererLesAncres(texte, modele.ancres, modele.tolerance);
  if (changements.length > 0) return { ok: false, changements, erreurs: [] };

  const erreurs: ErreurDeChamp[] = [];
  const champs: Record<string, ChampLu> = {};
  for (const [nom, { zone, type }] of Object.entries(modele.champs)) {
    let lu: TexteDeZone;
    if (zone.nature === 'rectangle') {
      lu = lireLeRectangle(texte.fragments, zone.rectangle, zone.ligne);
    } else {
      const ancre = trouvees.get(zone.ancre);
      if (ancre === undefined) {
        erreurs.push({ nature: 'ancre-inconnue', champ: nom, ancre: zone.ancre });
        continue;
      }
      lu = lireApresLAncre(texte.fragments, ancre);
    }
    const brut = lu.texte.trim();
    if (brut === '') {
      erreurs.push({ nature: 'champ-vide', champ: nom });
      continue;
    }
    const champ = convertir(type, { texte: brut, fragments: lu.fragments });
    if (champ === null) {
      erreurs.push({ nature: 'champ-illisible', champ: nom, type, texte: brut });
      continue;
    }
    champs[nom] = champ;
  }
  return erreurs.length > 0 ? { ok: false, changements: [], erreurs } : { ok: true, champs };
}

export type ProblemeModelePdf =
  | { readonly nature: 'aucun-champ' }
  | { readonly nature: 'tolerance-invalide'; readonly tolerance: number }
  | { readonly nature: 'ancre-en-double'; readonly ancre: string }
  | { readonly nature: 'ancre-vide'; readonly ancre: string }
  | { readonly nature: 'ancre-inconnue'; readonly champ: string; readonly ancre: string }
  | { readonly nature: 'rectangle-invalide'; readonly champ: string };

const rectangleValide = ({ page, largeur, hauteur }: Rectangle): boolean =>
  Number.isInteger(page) && page >= 1 && largeur > 0 && hauteur > 0;

/** Vérifications d'un modèle de lecture sans ouvrir aucun PDF. */
export function verifierModeleDeLecturePdf(modele: ModeleDeLecturePdf): ProblemeModelePdf[] {
  const problemes: ProblemeModelePdf[] = [];
  const champs = Object.entries(modele.champs);
  if (champs.length === 0) problemes.push({ nature: 'aucun-champ' });
  if (!(modele.tolerance >= 0 && Number.isFinite(modele.tolerance))) {
    problemes.push({ nature: 'tolerance-invalide', tolerance: modele.tolerance });
  }
  const ids = new Set<string>();
  for (const ancre of modele.ancres) {
    if (ids.has(ancre.id)) problemes.push({ nature: 'ancre-en-double', ancre: ancre.id });
    ids.add(ancre.id);
    if (ancre.texte.trim() === '') problemes.push({ nature: 'ancre-vide', ancre: ancre.id });
  }
  for (const [nom, { zone }] of champs) {
    if (zone.nature === 'apres-ancre' && !ids.has(zone.ancre)) {
      problemes.push({ nature: 'ancre-inconnue', champ: nom, ancre: zone.ancre });
    }
    if (zone.nature === 'rectangle' && !rectangleValide(zone.rectangle)) {
      problemes.push({ nature: 'rectangle-invalide', champ: nom });
    }
  }
  return problemes;
}
