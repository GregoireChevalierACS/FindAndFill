import ExcelJS from 'exceljs';
import { SOCIETE } from './modele.js';
import { DATE_FIGEE, normaliserArchive } from './normaliser.js';

export const FORMAT_MONTANT = '#,##0.00';
export const FORMAT_DATE = 'dd/mm/yyyy';
export const FORMAT_POURCENTAGE = '0.0%';

export function nouveauClasseur(): ExcelJS.Workbook {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = SOCIETE.nom;
  classeur.lastModifiedBy = SOCIETE.nom;
  classeur.created = DATE_FIGEE;
  classeur.modified = DATE_FIGEE;
  return classeur;
}

export async function versOctets(classeur: ExcelJS.Workbook): Promise<Buffer> {
  const brut = await classeur.xlsx.writeBuffer();
  return normaliserArchive(new Uint8Array(brut));
}

export function enteteEnGras(ligne: ExcelJS.Row): void {
  ligne.font = { bold: true };
  ligne.eachCell((cellule) => {
    cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cellule.border = { bottom: { style: 'thin' } };
  });
}
