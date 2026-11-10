import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { lireTexte, normaliserArchive } from './normaliser.js';
import { readFile } from 'node:fs/promises';
import { convertirEnXlsm, lireProjetVbaExemple } from './xlsm.js';

const TYPE_CLASSEUR = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';

async function archive(fichiers: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    zip.file(chemin, contenu);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

const MINIMAL = {
  '[Content_Types].xml': `<Types xmlns="t"><Override PartName="/xl/workbook.xml" ContentType="${TYPE_CLASSEUR}"/></Types>`,
  'xl/_rels/workbook.xml.rels': '<Relationships xmlns="r"></Relationships>',
  'xl/workbook.xml': '<workbook><fileVersion appName="xl"/><sheets/></workbook>',
  'xl/worksheets/sheet1.xml':
    '<worksheet xmlns="m"><sheetPr filterMode="false"/><sheetData/></worksheet>',
};

describe('convertirEnXlsm', () => {
  it('crée workbookPr quand il manque et complète un sheetPr existant', async () => {
    const xlsm = await convertirEnXlsm(await archive(MINIMAL), new Uint8Array([1, 2, 3]));
    const zip = await JSZip.loadAsync(xlsm);
    expect(await lireTexte(zip, 'xl/workbook.xml')).toBe(
      '<workbook><fileVersion appName="xl"/><workbookPr codeName="ThisWorkbook"/><sheets/></workbook>',
    );
    expect(await lireTexte(zip, 'xl/worksheets/sheet1.xml')).toContain(
      '<sheetPr codeName="Sheet1" filterMode="false"/>',
    );
    expect(zip.file('xl/worksheets/sheet2.xml')).toBeNull();
    expect(await zip.file('xl/vbaProject.bin')?.async('uint8array')).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('refuse un classeur dont le type principal est introuvable', async () => {
    const source = await archive({
      ...MINIMAL,
      '[Content_Types].xml': '<Types xmlns="t"></Types>',
    });
    await expect(convertirEnXlsm(source, new Uint8Array())).rejects.toThrow(
      'le type du classeur introuvable',
    );
  });

  it('refuse un classeur sans fichier de relations', async () => {
    const sansRelations: Record<string, string> = { ...MINIMAL };
    delete sansRelations['xl/_rels/workbook.xml.rels'];
    await expect(convertirEnXlsm(await archive(sansRelations), new Uint8Array())).rejects.toThrow(
      "Fichier absent de l'archive : xl/_rels/workbook.xml.rels",
    );
  });
});

describe('normaliserArchive', () => {
  it('met [Content_Types].xml en tête et fige les dates', async () => {
    const zip = new JSZip();
    zip.file('b.xml', 'b', { date: new Date(Date.UTC(2020, 0, 1)) });
    zip.file('[Content_Types].xml', 't');
    zip.file('a.xml', 'a');
    const resultat = await JSZip.loadAsync(
      await normaliserArchive(await zip.generateAsync({ type: 'uint8array' })),
    );
    expect(Object.keys(resultat.files)).toEqual(['[Content_Types].xml', 'a.xml', 'b.xml']);
    const dates = new Set(Object.values(resultat.files).map((f) => f.date.getTime()));
    expect(dates.size).toBe(1);
  });
});

describe('lireProjetVbaExemple', () => {
  it('redonne exactement ressources/vbaProject.bin (sinon : node scripts/encoder-projet-vba.mjs)', async () => {
    const fichier = await readFile(new URL('../ressources/vbaProject.bin', import.meta.url));
    expect(await lireProjetVbaExemple()).toEqual(new Uint8Array(fichier));
  });
});
