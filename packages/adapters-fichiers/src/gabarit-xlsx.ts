import type { FichierEntrant, GabaritOuvert, OuvreurGabarit } from '@findandfill/application';
import { lireAdresse, type CelluleARemplir } from '@findandfill/domain';
import JSZip from 'jszip';
import { decoderEntites, elements, lireAttributs, texteDesRuns } from './xml.js';

/**
 * Gabarit Excel (.xlsx ou .xlsm) lu et écrit en retouchant uniquement le XML des cellules visées.
 * Tout le reste de l'archive — macros, mises en forme, formules, graphiques — est conservé tel quel.
 */

interface CelluleXml {
  readonly colonne: number;
  readonly attributs: Map<string, string>;
  readonly contenu: string | null;
  readonly brut: string;
}

interface LigneXml {
  readonly numero: number;
  readonly attributs: Map<string, string>;
  readonly attributsBruts: string;
  readonly cellules: CelluleXml[];
}

interface FeuilleXml {
  readonly chemin: string;
  readonly lignes: Map<number, LigneXml>;
}

const SHEET_DATA = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/;

class FormatNonPrisEnCharge extends Error {}

async function lireTexte(zip: JSZip, chemin: string): Promise<string> {
  const fichier = zip.file(chemin);
  if (fichier === null) {
    throw new FormatNonPrisEnCharge(`Classeur incomplet : « ${chemin} » est absent.`);
  }
  return fichier.async('string');
}

function analyserLignes(xml: string): Map<number, LigneXml> {
  const lignes = new Map<number, LigneXml>();
  const donnees = SHEET_DATA.exec(xml);
  for (const ligne of elements(donnees?.[1] ?? '', 'row')) {
    const attributs = lireAttributs(ligne.attributs);
    const numero = Number(attributs.get('r'));
    if (!Number.isInteger(numero) || numero < 1) {
      throw new FormatNonPrisEnCharge('Ligne sans numéro : format de feuille non pris en charge.');
    }
    const cellules = [
      ...(ligne.contenu ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g),
    ].map(([brut, bruts = '', contenu]) => {
      const attributsCellule = lireAttributs(bruts);
      const reference = attributsCellule.get('r');
      if (reference === undefined) {
        throw new FormatNonPrisEnCharge(
          'Cellule sans référence : format de feuille non pris en charge.',
        );
      }
      return {
        colonne: lireAdresse(reference).colonne,
        attributs: attributsCellule,
        contenu: contenu ?? null,
        brut,
      };
    });
    lignes.set(numero, { numero, attributs, attributsBruts: ligne.attributs, cellules });
  }
  return lignes;
}

function texteCellule(cellule: CelluleXml, chaines: readonly string[]): string {
  const contenu = cellule.contenu ?? '';
  const type = cellule.attributs.get('t');
  if (type === 'inlineStr') {
    return texteDesRuns(contenu);
  }
  const valeur = decoderEntites(/<v>([\s\S]*?)<\/v>/.exec(contenu)?.[1] ?? '');
  return type === 's' ? (chaines[Number(valeur)] ?? '') : valeur;
}

function nature(cellule: CelluleXml | undefined): 'vide' | 'valeur' | 'formule' {
  const contenu = cellule?.contenu ?? '';
  if (/<f\b/.test(contenu)) {
    return 'formule';
  }
  return /<v>|<is>/.test(contenu) ? 'valeur' : 'vide';
}

/** Style que prendrait une cellule saisie à la main : celui de la ligne, sinon celui de la colonne. */
function styleParDefaut(xml: string, ligne: LigneXml | undefined, colonne: number): string | null {
  if (ligne?.attributs.get('customFormat') === '1' && ligne.attributs.has('s')) {
    return ligne.attributs.get('s') ?? null;
  }
  for (const { attributs } of elements(xml, 'col')) {
    const lus = lireAttributs(attributs);
    if (Number(lus.get('min')) <= colonne && colonne <= Number(lus.get('max'))) {
      return lus.get('style') ?? null;
    }
  }
  return null;
}

function nombreXml(valeur: number): string {
  const texte = String(valeur);
  if (!Number.isFinite(valeur) || /e/i.test(texte)) {
    throw new RangeError(`Valeur non inscriptible : ${texte}`);
  }
  return texte;
}

function celluleNombre(reference: string, style: string | null, valeur: number): string {
  const attributStyle = style === null ? '' : ` s="${style}"`;
  return `<c r="${reference}"${attributStyle}><v>${nombreXml(valeur)}</v></c>`;
}

function ecrireDansFeuille(xml: string, feuille: FeuilleXml, valeurs: Map<string, number>): string {
  const parLigne = new Map<number, Map<number, { reference: string; valeur: number }>>();
  for (const [reference, valeur] of valeurs) {
    const { ligne, colonne } = lireAdresse(reference);
    const cellules =
      parLigne.get(ligne) ?? new Map<number, { reference: string; valeur: number }>();
    cellules.set(colonne, { reference, valeur });
    parLigne.set(ligne, cellules);
  }

  const numeros = [...new Set([...feuille.lignes.keys(), ...parLigne.keys()])].sort(
    (a, b) => a - b,
  );
  const lignesXml = numeros.map((numero) => {
    const existante = feuille.lignes.get(numero);
    const aEcrire = parLigne.get(numero);
    if (aEcrire === undefined && existante !== undefined) {
      return `<row${existante.attributsBruts}>${existante.cellules.map((c) => c.brut).join('')}</row>`;
    }
    const cellules = new Map<number, string>(
      (existante?.cellules ?? []).map((cellule) => [cellule.colonne, cellule.brut]),
    );
    for (const [colonne, { reference, valeur }] of aEcrire ?? []) {
      const actuelle = existante?.cellules.find((cellule) => cellule.colonne === colonne);
      if (nature(actuelle) === 'formule') {
        throw new Error(`La cellule ${reference} contient une formule : écriture refusée.`);
      }
      const style = actuelle?.attributs.get('s') ?? styleParDefaut(xml, existante, colonne);
      cellules.set(colonne, celluleNombre(reference, style, valeur));
    }
    // L'attribut « spans » est une indication d'optimisation : on le retire des lignes modifiées.
    const attributs = (existante?.attributsBruts ?? ` r="${numero}"`).replace(
      /\sspans="[^"]*"/,
      '',
    );
    const contenu = [...cellules]
      .sort(([a], [b]) => a - b)
      .map(([, brut]) => brut)
      .join('');
    return `<row${attributs}>${contenu}</row>`;
  });

  const nouvelles = `<sheetData>${lignesXml.join('')}</sheetData>`;
  return xml.replace(SHEET_DATA, () => nouvelles);
}

const APRES_CALC_PR =
  /<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/;

/** Demande à Excel de tout recalculer à l'ouverture, pour que les totaux suivent les valeurs écrites. */
function forcerRecalcul(xml: string): string {
  const calcPr = /<calcPr\b([^>]*?)\/?>/.exec(xml);
  if (calcPr === null) {
    return xml.replace(APRES_CALC_PR, (suite) => `<calcPr fullCalcOnLoad="1"/>${suite}`);
  }
  const attributs = calcPr[1]?.replace(/\sfullCalcOnLoad="[^"]*"/, '') ?? '';
  return xml.replace(calcPr[0], `<calcPr${attributs} fullCalcOnLoad="1"/>`);
}

function cheminCible(cible: string): string {
  return cible.startsWith('/') ? cible.slice(1) : `xl/${cible}`;
}

/** Cellule d'une grille d'aperçu : texte affiché, et formule à ne jamais écraser. */
export interface CelluleGrille {
  readonly texte: string;
  readonly formule: boolean;
}

/** Gabarit Excel ouvert, avec en plus une grille d'aperçu pour l'éditeur de modèle. */
export interface GabaritXlsx extends GabaritOuvert {
  /** Les premières lignes et colonnes d'un onglet, à partir de A1. Vide pour un onglet inconnu. */
  grille(onglet: string, lignes: number, colonnes: number): CelluleGrille[][];
}

function celluleGrille(cellule: CelluleXml | undefined, chaines: readonly string[]): CelluleGrille {
  if (cellule === undefined) {
    return { texte: '', formule: false };
  }
  const formule = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(cellule.contenu ?? '');
  if (formule !== null || nature(cellule) === 'formule') {
    return { texte: `=${decoderEntites(formule?.[1] ?? '…')}`, formule: true };
  }
  return { texte: texteCellule(cellule, chaines), formule: false };
}

export async function ouvrirGabaritXlsx(octets: Uint8Array): Promise<GabaritXlsx> {
  const zip = await JSZip.loadAsync(octets);
  const classeurXml = await lireTexte(zip, 'xl/workbook.xml');
  const relations = new Map(
    elements(await lireTexte(zip, 'xl/_rels/workbook.xml.rels'), 'Relationship').map((r) => {
      const attributs = lireAttributs(r.attributs);
      return [attributs.get('Id') ?? '', attributs.get('Target') ?? ''] as const;
    }),
  );
  const chemins = new Map<string, string>();
  for (const { attributs } of elements(classeurXml, 'sheet')) {
    const lus = lireAttributs(attributs);
    const idRelation = [...lus].find(([nom]) => nom.endsWith(':id'))?.[1] ?? '';
    const cible = relations.get(idRelation);
    if (cible !== undefined) {
      chemins.set(lus.get('name') ?? '', cheminCible(cible));
    }
  }
  const fichierChaines = zip.file('xl/sharedStrings.xml');
  const chaines =
    fichierChaines === null
      ? []
      : elements(await fichierChaines.async('string'), 'si').map((si) =>
          texteDesRuns(si.contenu ?? ''),
        );

  const feuilles = new Map<string, FeuilleXml>();
  const textes = new Map<string, string>();
  for (const [nom, chemin] of chemins) {
    const xml = await lireTexte(zip, chemin);
    textes.set(nom, xml);
    feuilles.set(nom, { chemin, lignes: analyserLignes(xml) });
  }

  const cellule = (onglet: string, reference: string): CelluleXml | undefined => {
    const { ligne, colonne } = lireAdresse(reference);
    return feuilles
      .get(onglet)
      ?.lignes.get(ligne)
      ?.cellules.find((c) => c.colonne === colonne);
  };

  return {
    onglets: () => [...chemins.keys()],
    colonne(onglet, colonne) {
      const resultat = new Map<number, string>();
      for (const ligne of feuilles.get(onglet)?.lignes.values() ?? []) {
        const trouvee = ligne.cellules.find((c) => c.colonne === colonne);
        const texte = trouvee === undefined ? '' : texteCellule(trouvee, chaines).trim();
        if (texte !== '') {
          resultat.set(ligne.numero, texte);
        }
      }
      return resultat;
    },
    contenu: (onglet, reference) => nature(cellule(onglet, reference)),
    grille(onglet, lignes, colonnes) {
      const feuille = feuilles.get(onglet);
      if (feuille === undefined) {
        return [];
      }
      return Array.from({ length: lignes }, (_, l) => {
        const ligne = feuille.lignes.get(l + 1);
        return Array.from({ length: colonnes }, (_, c) =>
          celluleGrille(
            ligne?.cellules.find((cellule) => cellule.colonne === c + 1),
            chaines,
          ),
        );
      });
    },
    async ecrire(cellules: readonly CelluleARemplir[]): Promise<Uint8Array> {
      const copie = await JSZip.loadAsync(octets);
      const parOnglet = new Map<string, Map<string, number>>();
      for (const { onglet, adresse, valeur } of cellules) {
        const valeurs = parOnglet.get(onglet) ?? new Map<string, number>();
        valeurs.set(adresse, valeur / 100);
        parOnglet.set(onglet, valeurs);
      }
      for (const [onglet, valeurs] of parOnglet) {
        const feuille = feuilles.get(onglet);
        if (feuille === undefined) {
          throw new Error(`Onglet introuvable dans le gabarit : « ${onglet} ».`);
        }
        copie.file(feuille.chemin, ecrireDansFeuille(textes.get(onglet) ?? '', feuille, valeurs));
      }
      copie.file('xl/workbook.xml', forcerRecalcul(classeurXml));
      return copie.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    },
  };
}

export const ouvreurGabaritXlsx = {
  async ouvrir(fichier: FichierEntrant): Promise<GabaritXlsx> {
    if (!/\.(xlsx|xlsm)$/i.test(fichier.nom)) {
      throw new Error(`Le gabarit doit être un classeur .xlsx ou .xlsm : « ${fichier.nom} ».`);
    }
    return ouvrirGabaritXlsx(fichier.octets);
  },
} satisfies OuvreurGabarit;
