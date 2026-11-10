/**
 * Recette de la phase 1 : chaque cas du jeu synthétique passe par la vraie chaîne
 * (cas d'usage + adapters de fichiers), et le résultat est relu par un outil indépendant (ExcelJS).
 */
import { preparerRemplissage, type FichierEntrant } from '@findandfill/application';
import type { ChangementStructure, ModeleRemplissage } from '@findandfill/domain';
import { genererJeuComplet, type Attendu, type Cas } from '@findandfill/jeu-synthetique';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { lecteurSources, ouvreurGabaritXlsx } from './index.js';

const PORTS = { lecteur: lecteurSources, ouvreur: ouvreurGabaritXlsx };
let fichiers: Map<string, Buffer>;
let cas: readonly Cas[];

beforeAll(async () => {
  const jeu = await genererJeuComplet();
  fichiers = new Map(jeu.fichiers.map((f) => [f.chemin, f.contenu]));
  cas = jeu.manifeste.cas;
});

function entrant(chemin: string): FichierEntrant {
  const octets = fichiers.get(chemin);
  if (octets === undefined) throw new Error(`Fichier absent du jeu : ${chemin}`);
  return { nom: chemin, octets: new Uint8Array(octets) };
}

function json(chemin: string): unknown {
  return JSON.parse(Buffer.from(entrant(chemin).octets).toString('utf8'));
}

async function classeur(octets: Uint8Array): Promise<ExcelJS.Workbook> {
  const lu = new ExcelJS.Workbook();
  await lu.xlsx.load(octets as unknown as ArrayBuffer);
  return lu;
}

/** Formules du classeur, par « onglet!adresse ». */
function formules(lu: ExcelJS.Workbook): Map<string, string> {
  const resultat = new Map<string, string>();
  for (const feuille of lu.worksheets) {
    feuille.eachRow((ligne) => {
      ligne.eachCell((cellule) => {
        if (cellule.formula) resultat.set(`${feuille.name}!${cellule.address}`, cellule.formula);
      });
    });
  }
  return resultat;
}

const remplissages = [
  'ca-par-affaire',
  'carnet-commandes',
  'tresorerie',
  'achats-par-fournisseur',
  'ca-par-affaire-macros',
  'reporting-complet-macros',
];

describe.each(remplissages)('recette « %s »', (id) => {
  let unCas: Extract<Cas, { type: 'remplissage' }>;
  let sortie: Uint8Array;
  let preparation: Awaited<ReturnType<typeof preparerRemplissage>>;

  beforeAll(async () => {
    const trouve = cas.find((c) => c.id === id);
    if (trouve?.type !== 'remplissage') throw new Error(`Cas inconnu : ${id}`);
    unCas = trouve;
    preparation = await preparerRemplissage(
      {
        modele: json(unCas.modele) as ModeleRemplissage,
        sources: new Map(
          Object.entries(unCas.sources).map(([source, chemin]) => [source, entrant(chemin)]),
        ),
        gabarit: entrant(unCas.gabarit),
      },
      PORTS,
    );
    if (!preparation.ok) throw new Error(JSON.stringify(preparation.erreurs, null, 2));
    sortie = await preparation.confirmer();
  });

  it('prépare le remplissage sans erreur ni avertissement', () => {
    expect(preparation.ok && preparation.avertissements).toEqual([]);
  });

  it('écrit exactement les cellules attendues, au centime près', async () => {
    const attendu = json(unCas.attendu) as Attendu;
    const lu = await classeur(sortie);
    const ecrites = preparation.ok
      ? preparation.cellules.map((c) => `${c.onglet}!${c.adresse}`)
      : [];
    expect(new Set(ecrites)).toEqual(
      new Set(attendu.cellules.map((c) => `${c.onglet}!${c.adresse}`)),
    );
    for (const { onglet, adresse, valeur } of attendu.cellules) {
      const lue = lu.getWorksheet(onglet)?.getCell(adresse).value;
      expect(typeof lue, `${onglet}!${adresse}`).toBe('number');
      expect(Math.round(Number(lue) * 100), `${onglet}!${adresse}`).toBe(Math.round(valeur * 100));
    }
  });

  it('conserve toutes les formules du gabarit', async () => {
    const avant = formules(await classeur(entrant(unCas.gabarit).octets));
    expect(avant.size).toBeGreaterThan(0);
    expect(formules(await classeur(sortie))).toEqual(avant);
  });

  it('demande à Excel de recalculer à l’ouverture', async () => {
    const zip = await JSZip.loadAsync(sortie);
    expect(await zip.file('xl/workbook.xml')?.async('string')).toContain('fullCalcOnLoad="1"');
  });

  it('conserve les macros à l’octet près', async () => {
    const avant = await JSZip.loadAsync(entrant(unCas.gabarit).octets);
    const apres = await JSZip.loadAsync(sortie);
    const projetAvant = await avant.file('xl/vbaProject.bin')?.async('uint8array');
    expect(await apres.file('xl/vbaProject.bin')?.async('uint8array')).toEqual(projetAvant);
    expect(projetAvant !== undefined).toBe(unCas.gabarit.endsWith('.xlsm'));
    for (const chemin of ['[Content_Types].xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) {
      expect(await apres.file(chemin)?.async('string'), chemin).toBe(
        await avant.file(chemin)?.async('string'),
      );
    }
  });
});

const NATURE_ATTENDUE: Record<string, ChangementStructure['nature']> = {
  'colonne-ajoutee': 'colonnes-ajoutees',
  'onglet-renomme': 'onglet-introuvable',
  'colonnes-deplacees': 'colonnes-deplacees',
};

describe.each([
  'variante-colonne-ajoutee',
  'variante-onglet-renomme',
  'variante-colonnes-deplacees',
])('recette « %s »', (id) => {
  it('bloque le remplissage et décrit le changement de structure', async () => {
    const variante = cas.find((c) => c.id === id);
    if (variante?.type !== 'changement-structure') throw new Error(`Cas inconnu : ${id}`);
    const remplissageDeReference = cas.find(
      (c) => c.type === 'remplissage' && c.modele === variante.modele,
    );
    if (remplissageDeReference?.type !== 'remplissage') throw new Error('Cas de référence absent');

    const preparation = await preparerRemplissage(
      {
        modele: json(variante.modele) as ModeleRemplissage,
        sources: new Map([[variante.idSource, entrant(variante.source)]]),
        gabarit: entrant(remplissageDeReference.gabarit),
      },
      PORTS,
    );

    expect(preparation.ok).toBe(false);
    const [erreur] = preparation.ok ? [] : preparation.erreurs;
    expect(erreur?.nature).toBe('structure-modifiee');
    const natures =
      erreur?.nature === 'structure-modifiee' ? erreur.changements.map((c) => c.nature) : [];
    expect(natures).toContain(NATURE_ATTENDUE[variante.changement.nature]);
    if (
      erreur?.nature === 'structure-modifiee' &&
      variante.changement.nature === 'colonne-ajoutee'
    ) {
      expect(erreur.changements).toContainEqual({
        nature: 'colonnes-ajoutees',
        colonnes: [variante.changement.colonne],
      });
    }
    if (
      erreur?.nature === 'structure-modifiee' &&
      variante.changement.nature === 'onglet-renomme'
    ) {
      expect(erreur.changements).toContainEqual({
        nature: 'onglet-introuvable',
        onglet: variante.changement.avant,
        ongletsDisponibles: [variante.changement.apres],
      });
    }
  });
});
