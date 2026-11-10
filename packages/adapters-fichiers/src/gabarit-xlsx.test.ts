import { centimes, type CelluleARemplir } from '@findandfill/domain';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ouvreurGabaritXlsx, ouvrirGabaritXlsx } from './gabarit-xlsx.js';

const RELS = `<Relationships xmlns="r">
<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="worksheet" Target="/xl/worksheets/autre.xml"/>
</Relationships>`;

const CLASSEUR = `<workbook xmlns:r="rel"><sheets>
<sheet name="CA &amp; marge" sheetId="1" r:id="rId1"/>
<sheet name="Vide" sheetId="2" r:id="rId2"/>
<sheet name="Orpheline" sheetId="3" r:id="rId9"/>
</sheets><calcPr calcId="171027" fullCalcOnLoad="0"/></workbook>`;

const CHAINES =
  '<sst><si><t>AF1</t></si><si><r><t>AF</t></r><r><t>2</t></r></si><si><t>Total</t></si></sst>';

const FEUILLE = `<worksheet><cols><col min="1" max="2" width="12"/><col min="3" max="14" style="7"/></cols>
<sheetData><row r="3" spans="1:15"><c r="A3" t="s"><v>0</v></c><c r="B3" s="1"/><c r="D3" t="s" s="2"><v>1</v></c></row><row r="5" s="9" customFormat="1"><c r="A5" t="inlineStr"><is><t>AF3</t></is></c></row><row r="6"><c r="A6" t="s"><v>2</v></c><c r="C6"><f>SUM(C3:C5)</f><v>0</v></c><c r="E6" t="str"><v>  </v></c></row></sheetData>
<pageMargins/></worksheet>`;

async function archive(parties: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [chemin, contenu] of Object.entries(parties)) zip.file(chemin, contenu);
  return zip.generateAsync({ type: 'uint8array' });
}

const PARTIES = {
  'xl/workbook.xml': CLASSEUR,
  'xl/_rels/workbook.xml.rels': RELS,
  'xl/sharedStrings.xml': CHAINES,
  'xl/worksheets/sheet1.xml': FEUILLE,
  'xl/worksheets/autre.xml': '<worksheet><sheetData/></worksheet>',
  'xl/vbaProject.bin': 'MACROS',
};

function sans(chemin: string): Record<string, string> {
  return Object.fromEntries(Object.entries(PARTIES).filter(([nom]) => nom !== chemin));
}

function cellule(onglet: string, adresse: string, euros: number): CelluleARemplir {
  return {
    onglet,
    adresse,
    valeur: centimes(Math.round(euros * 100)),
    provenance: { regle: 'r', source: 's', lignes: [] },
  };
}

async function partie(octets: Uint8Array, chemin: string): Promise<string | undefined> {
  return (await JSZip.loadAsync(octets)).file(chemin)?.async('string');
}

describe('ouvrirGabaritXlsx — lecture', () => {
  it('liste les onglets reliés à une feuille, noms décodés', async () => {
    const gabarit = await ouvrirGabaritXlsx(await archive(PARTIES));
    expect(gabarit.onglets()).toEqual(['CA & marge', 'Vide']);
  });

  it('lit une colonne : chaînes partagées, texte enrichi, chaînes en ligne, cellules vides ignorées', async () => {
    const gabarit = await ouvrirGabaritXlsx(await archive(PARTIES));
    expect(gabarit.colonne('CA & marge', 1)).toEqual(
      new Map([
        [3, 'AF1'],
        [5, 'AF3'],
        [6, 'Total'],
      ]),
    );
    expect(gabarit.colonne('CA & marge', 4)).toEqual(new Map([[3, 'AF2']]));
    expect(gabarit.colonne('CA & marge', 5)).toEqual(new Map());
    expect(gabarit.colonne('Inconnu', 1)).toEqual(new Map());
  });

  it('distingue cellules vides, valeurs et formules', async () => {
    const gabarit = await ouvrirGabaritXlsx(await archive(PARTIES));
    expect(gabarit.contenu('CA & marge', 'A3')).toBe('valeur');
    expect(gabarit.contenu('CA & marge', 'A5')).toBe('valeur');
    expect(gabarit.contenu('CA & marge', 'B3')).toBe('vide');
    expect(gabarit.contenu('CA & marge', 'Z99')).toBe('vide');
    expect(gabarit.contenu('CA & marge', 'C6')).toBe('formule');
    expect(gabarit.contenu('Inconnu', 'A1')).toBe('vide');
  });

  it('fonctionne sans table de chaînes partagées', async () => {
    const gabarit = await ouvrirGabaritXlsx(await archive(sans('xl/sharedStrings.xml')));
    expect(gabarit.colonne('CA & marge', 1)).toEqual(new Map([[5, 'AF3']]));
  });

  it.each([
    ['xl/workbook.xml', '« xl/workbook.xml » est absent'],
    ['xl/worksheets/sheet1.xml', '« xl/worksheets/sheet1.xml » est absent'],
  ])('refuse un classeur sans %s', async (chemin, message) => {
    await expect(ouvrirGabaritXlsx(await archive(sans(chemin)))).rejects.toThrow(message);
  });

  it.each([
    ['<sheetData><row><c r="A1"/></row></sheetData>', 'Ligne sans numéro'],
    ['<sheetData><row r="0"/></sheetData>', 'Ligne sans numéro'],
    ['<sheetData><row r="1"><c t="s"><v>0</v></c></row></sheetData>', 'Cellule sans référence'],
  ])('refuse une feuille non prise en charge', async (donnees, message) => {
    const feuille = `<worksheet>${donnees}</worksheet>`;
    await expect(
      ouvrirGabaritXlsx(await archive({ ...PARTIES, 'xl/worksheets/sheet1.xml': feuille })),
    ).rejects.toThrow(message);
  });

  it('refuse un fichier qui n’est pas un classeur Excel', async () => {
    await expect(
      ouvreurGabaritXlsx.ouvrir({ nom: 'reporting.ods', octets: new Uint8Array() }),
    ).rejects.toThrow('Le gabarit doit être un classeur .xlsx ou .xlsm : « reporting.ods ».');
    const ouvert = await ouvreurGabaritXlsx.ouvrir({
      nom: 'REPORTING.XLSM',
      octets: await archive(PARTIES),
    });
    expect(ouvert.onglets()).toHaveLength(2);
  });
});

describe('ouvrirGabaritXlsx — écriture', () => {
  it('remplace une valeur existante en gardant son style', async () => {
    const octets = await archive(PARTIES);
    const sortie = await (
      await ouvrirGabaritXlsx(octets)
    ).ecrire([cellule('CA & marge', 'D3', 1234.5)]);
    const xml = await partie(sortie, 'xl/worksheets/sheet1.xml');
    expect(xml).toContain('<c r="D3" s="2"><v>1234.5</v></c>');
    expect(xml).not.toContain('t="s" s="2"');
  });

  it('crée les cellules et lignes manquantes, dans l’ordre, avec le style de la ligne ou de la colonne', async () => {
    const sortie = await (
      await ouvrirGabaritXlsx(await archive(PARTIES))
    ).ecrire([
      cellule('CA & marge', 'C3', 1),
      cellule('CA & marge', 'B3', 2),
      cellule('CA & marge', 'O3', 3),
      cellule('CA & marge', 'B5', -4.25),
      cellule('CA & marge', 'C4', 0),
      cellule('CA & marge', 'A1', 5),
      cellule('CA & marge', 'C9', 6),
    ]);
    const xml = (await partie(sortie, 'xl/worksheets/sheet1.xml')) ?? '';
    const donnees = /<sheetData>([\s\S]*)<\/sheetData>/.exec(xml)?.[1];
    expect(donnees).toBe(
      [
        '<row r="1"><c r="A1"><v>5</v></c></row>',
        '<row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3" s="1"><v>2</v></c><c r="C3" s="7"><v>1</v></c><c r="D3" t="s" s="2"><v>1</v></c><c r="O3"><v>3</v></c></row>',
        '<row r="4"><c r="C4" s="7"><v>0</v></c></row>',
        '<row r="5" s="9" customFormat="1"><c r="A5" t="inlineStr"><is><t>AF3</t></is></c><c r="B5" s="9"><v>-4.25</v></c></row>',
        '<row r="6"><c r="A6" t="s"><v>2</v></c><c r="C6"><f>SUM(C3:C5)</f><v>0</v></c><c r="E6" t="str"><v>  </v></c></row>',
        '<row r="9"><c r="C9" s="7"><v>6</v></c></row>',
      ].join(''),
    );
    expect(xml).toContain('<pageMargins/>');
  });

  it('remplit une feuille sans données', async () => {
    const sortie = await (
      await ouvrirGabaritXlsx(await archive(PARTIES))
    ).ecrire([cellule('Vide', 'B2', 7)]);
    expect(await partie(sortie, 'xl/worksheets/autre.xml')).toBe(
      '<worksheet><sheetData><row r="2"><c r="B2"><v>7</v></c></row></sheetData></worksheet>',
    );
  });

  it('ne touche à rien d’autre et demande un recalcul complet', async () => {
    const octets = await archive(PARTIES);
    const sortie = await (await ouvrirGabaritXlsx(octets)).ecrire([cellule('CA & marge', 'C3', 1)]);
    expect(await partie(sortie, 'xl/vbaProject.bin')).toBe('MACROS');
    expect(await partie(sortie, 'xl/worksheets/autre.xml')).toBe(
      '<worksheet><sheetData/></worksheet>',
    );
    expect(await partie(sortie, 'xl/workbook.xml')).toContain(
      '<calcPr calcId="171027" fullCalcOnLoad="1"/>',
    );
    expect(await partie(octets, 'xl/workbook.xml')).toBe(CLASSEUR);
  });

  it.each([
    [
      '<workbook><sheets/></workbook>',
      '<workbook><sheets/><calcPr fullCalcOnLoad="1"/></workbook>',
    ],
    [
      '<workbook><sheets/><extLst/></workbook>',
      '<workbook><sheets/><calcPr fullCalcOnLoad="1"/><extLst/></workbook>',
    ],
    [
      '<workbook><sheets/><calcPr></calcPr></workbook>',
      '<workbook><sheets/><calcPr fullCalcOnLoad="1"/></calcPr></workbook>',
    ],
  ])('ajoute la demande de recalcul à %s', async (avant, apres) => {
    const sortie = await (
      await ouvrirGabaritXlsx(await archive({ ...PARTIES, 'xl/workbook.xml': avant }))
    ).ecrire([]);
    expect(await partie(sortie, 'xl/workbook.xml')).toBe(apres);
  });

  it('refuse d’écraser une formule, un onglet inconnu ou une valeur non inscriptible', async () => {
    const gabarit = await ouvrirGabaritXlsx(await archive(PARTIES));
    await expect(gabarit.ecrire([cellule('CA & marge', 'C6', 1)])).rejects.toThrow(
      'La cellule C6 contient une formule',
    );
    await expect(gabarit.ecrire([cellule('Inconnu', 'A1', 1)])).rejects.toThrow(
      'Onglet introuvable dans le gabarit : « Inconnu ».',
    );
    // 1e-7 € ne peut pas venir du domaine (centimes entiers), mais l'adapter doit refuser l'écriture exponentielle.
    const minuscule = { ...cellule('Vide', 'A1', 0), valeur: 0.00001 as CelluleARemplir['valeur'] };
    await expect(gabarit.ecrire([minuscule])).rejects.toThrow(
      /^Valeur non inscriptible : 1(\.0+1)?e-7$/,
    );
  });
});
