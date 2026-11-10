import { readFile } from 'node:fs/promises';
import type JSZip from 'jszip';
import { lireTexte, normaliserArchive } from './normaliser.js';

const TYPE_CLASSEUR = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
const TYPE_CLASSEUR_MACROS = 'application/vnd.ms-excel.sheet.macroEnabled.main+xml';
const TYPE_PROJET_VBA = 'application/vnd.ms-office.vbaProject';
const RELATION_VBA = 'http://schemas.microsoft.com/office/2006/relationships/vbaProject';
export const CHEMIN_PROJET_VBA = 'xl/vbaProject.bin';

/**
 * Projet VBA produit par Excel, tiré du projet XlsxWriter (licence BSD-2-Clause,
 * voir ressources/LICENCE-XlsxWriter.txt). Il contient le module « Module1 »
 * avec la macro `say_hello`, et les modules de document ThisWorkbook, Sheet1 et Sheet2.
 */
export async function lireProjetVbaExemple(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL('../ressources/vbaProject.bin', import.meta.url)));
}

function remplacerUneFois(
  texte: string,
  cherche: string | RegExp,
  par: string,
  quoi: string,
): string {
  const resultat = texte.replace(cherche, par);
  if (resultat === texte) {
    throw new Error(`Conversion en .xlsm impossible : ${quoi} introuvable.`);
  }
  return resultat;
}

/** Ajoute un attribut codeName à l'élément donné, ou crée l'élément en tête s'il manque. */
function poserNomDeCode(xml: string, element: string, apres: RegExp, nom: string): string {
  const existant = new RegExp(`<${element}(?=[\\s/>])`);
  if (existant.test(xml)) {
    return xml.replace(existant, `<${element} codeName="${nom}"`);
  }
  return remplacerUneFois(xml, apres, `$&<${element} codeName="${nom}"/>`, `<${element}>`);
}

async function retoucher(zip: JSZip, chemin: string, transformer: (xml: string) => string) {
  zip.file(chemin, transformer(await lireTexte(zip, chemin)));
}

/**
 * Transforme un classeur .xlsx en .xlsm contenant le projet VBA fourni.
 * Les deux premières feuilles reçoivent les noms de code Sheet1 et Sheet2,
 * attendus par les modules de document du projet.
 */
export async function convertirEnXlsm(xlsx: Uint8Array, projetVba: Uint8Array): Promise<Buffer> {
  return normaliserArchive(xlsx, async (zip) => {
    await retoucher(zip, '[Content_Types].xml', (xml) =>
      remplacerUneFois(
        remplacerUneFois(xml, TYPE_CLASSEUR, TYPE_CLASSEUR_MACROS, 'le type du classeur'),
        /<Types\b[^>]*>/,
        `$&<Default Extension="bin" ContentType="${TYPE_PROJET_VBA}"/>`,
        'la racine <Types>',
      ),
    );
    await retoucher(zip, 'xl/_rels/workbook.xml.rels', (xml) =>
      remplacerUneFois(
        xml,
        '</Relationships>',
        `<Relationship Id="rIdVbaProjet" Type="${RELATION_VBA}" Target="vbaProject.bin"/></Relationships>`,
        'la fin des relations',
      ),
    );
    await retoucher(zip, 'xl/workbook.xml', (xml) =>
      poserNomDeCode(xml, 'workbookPr', /<\/fileVersion>|<fileVersion\b[^>]*\/>/, 'ThisWorkbook'),
    );
    for (const [numero, nom] of [
      [1, 'Sheet1'],
      [2, 'Sheet2'],
    ] as const) {
      const chemin = `xl/worksheets/sheet${numero}.xml`;
      if (zip.file(chemin) !== null) {
        await retoucher(zip, chemin, (xml) =>
          poserNomDeCode(xml, 'sheetPr', /<worksheet\b[^>]*>/, nom),
        );
      }
    }
    zip.file(CHEMIN_PROJET_VBA, projetVba);
  });
}
