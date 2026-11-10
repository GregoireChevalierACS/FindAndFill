import type { FichierEntrant, LecteurSources } from '@findandfill/application';
import type { Classeur, ValeurCellule } from '@findandfill/domain';
import ExcelJS from 'exceljs';
import { lireTexteDelimite } from './texte-delimite.js';

/** Convertit une valeur de cellule ExcelJS en valeur neutre ; les dates deviennent AAAA-MM-JJ. */
export function valeurExcel(valeur: ExcelJS.CellValue): ValeurCellule {
  if (valeur === null || valeur === undefined) {
    return null;
  }
  if (typeof valeur === 'number' || typeof valeur === 'string') {
    return valeur;
  }
  if (typeof valeur === 'boolean') {
    return valeur ? 'VRAI' : 'FAUX';
  }
  if (valeur instanceof Date) {
    return valeur.toISOString().slice(0, 10);
  }
  if ('richText' in valeur) {
    return valeur.richText.map((morceau) => morceau.text).join('');
  }
  if ('error' in valeur) {
    return valeur.error;
  }
  if ('formula' in valeur || 'sharedFormula' in valeur) {
    return valeurExcel(valeur.result);
  }
  if ('text' in valeur) {
    return typeof valeur.text === 'string' ? valeur.text : valeurExcel(valeur.text);
  }
  return null;
}

export async function lireXlsx(octets: Uint8Array): Promise<Classeur> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(octets as unknown as ArrayBuffer);
  return {
    feuilles: classeur.worksheets.map((feuille) => ({
      nom: feuille.name,
      lignes: Array.from({ length: feuille.rowCount }, (_, index) => {
        const ligne = feuille.getRow(index + 1);
        return Array.from({ length: ligne.cellCount }, (_, colonne) =>
          valeurExcel(ligne.getCell(colonne + 1).value),
        );
      }),
    })),
  };
}

const EXCEL = /\.(xlsx|xlsm)$/i;
const TEXTE = /\.(csv|tsv|txt)$/i;

/** Choisit le lecteur selon l'extension du fichier. */
export const lecteurSources: LecteurSources = {
  async lire(fichier: FichierEntrant): Promise<Classeur> {
    if (EXCEL.test(fichier.nom)) {
      return lireXlsx(fichier.octets);
    }
    if (TEXTE.test(fichier.nom)) {
      return Promise.resolve(lireTexteDelimite(fichier.octets));
    }
    throw new Error(
      `Format non pris en charge : « ${fichier.nom} » (attendu : .xlsx, .xlsm, .csv, .tsv ou .txt).`,
    );
  },
};
