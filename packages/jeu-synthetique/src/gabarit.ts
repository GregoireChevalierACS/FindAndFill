import type ExcelJS from 'exceljs';
import {
  enteteEnGras,
  FORMAT_MONTANT,
  FORMAT_POURCENTAGE,
  nouveauClasseur,
  versOctets,
} from './classeur.js';
import { MOIS_COURTS } from './dates.js';
import { adresse, lettreColonne } from './format.js';
import { EXERCICE, SOCIETE, type JeuDeDonnees } from './modele.js';

/**
 * Gabarit du reporting mensuel à la direction, tel que les comptables le remplissent à la main.
 * Les cellules de saisie sont vides ; les totaux et ratios sont des formules à préserver.
 * La disposition est décrite par les fonctions `cellule*`, partagées avec les résultats attendus.
 */
export const ONGLETS = {
  ca: 'CA par affaire',
  carnet: 'Carnet de commandes',
  tresorerie: 'Trésorerie',
  achats: 'Achats',
} as const;

const PREMIERE_LIGNE = 4;
const COLONNE_JANVIER = 3;
const COLONNE_TOTAL_ANNEE = COLONNE_JANVIER + 12;

/** Cellule d'un tableau mensuel : ligne de rang donné (à partir de 0), mois de 1 à 12. */
function celluleMensuelle(rang: number, mois: number): string {
  return adresse(COLONNE_JANVIER + mois - 1, PREMIERE_LIGNE + rang);
}

/** Cellule du CA HT d'une affaire pour un mois. */
export const celluleCa = celluleMensuelle;
/** Cellule des achats HT d'un fournisseur pour un mois. */
export const celluleAchats = celluleMensuelle;

export function celluleCarnet(rangAffaire: number, champ: 'commande' | 'facture'): string {
  return adresse(champ === 'commande' ? 3 : 4, PREMIERE_LIGNE + rangAffaire);
}

export const CELLULE_SOLDE_INITIAL = 'C3';
const PREMIERE_LIGNE_TRESORERIE = 6;

export function celluleTresorerie(mois: number, champ: 'encaissements' | 'decaissements'): string {
  return adresse(champ === 'encaissements' ? 2 : 3, PREMIERE_LIGNE_TRESORERIE + mois - 1);
}

function titre(feuille: ExcelJS.Worksheet, texte: string): void {
  feuille.getCell('A1').value = texte;
  feuille.getCell('A1').font = { bold: true, size: 13 };
}

/** Tableau lignes × 12 mois, avec total par ligne et ligne de total. */
function tableauMensuel(
  feuille: ExcelJS.Worksheet,
  libelles: readonly (readonly [string, string])[],
  entetes: readonly [string, string],
): void {
  enteteEnGras(feuille.insertRow(3, [...entetes, ...MOIS_COURTS, 'Total']));
  const derniere = PREMIERE_LIGNE + libelles.length - 1;
  const lettreTotal = lettreColonne(COLONNE_TOTAL_ANNEE);
  libelles.forEach(([code, nom], rang) => {
    const ligne = PREMIERE_LIGNE + rang;
    feuille.getCell(adresse(1, ligne)).value = code;
    feuille.getCell(adresse(2, ligne)).value = nom;
    feuille.getCell(`${lettreTotal}${ligne}`).value = {
      formula: `SUM(${celluleMensuelle(rang, 1)}:${celluleMensuelle(rang, 12)})`,
    };
  });
  const ligneTotal = derniere + 1;
  feuille.getCell(adresse(1, ligneTotal)).value = 'Total';
  for (let colonne = COLONNE_JANVIER; colonne <= COLONNE_TOTAL_ANNEE; colonne++) {
    const lettre = lettreColonne(colonne);
    feuille.getCell(adresse(colonne, ligneTotal)).value = {
      formula: `SUM(${lettre}${PREMIERE_LIGNE}:${lettre}${derniere})`,
    };
    feuille.getColumn(colonne).numFmt = FORMAT_MONTANT;
    feuille.getColumn(colonne).width = 13;
  }
  feuille.getRow(ligneTotal).font = { bold: true };
  feuille.getColumn(1).width = 12;
  feuille.getColumn(2).width = 28;
}

function feuilleCa(classeur: ExcelJS.Workbook, jeu: JeuDeDonnees): void {
  const feuille = classeur.addWorksheet(ONGLETS.ca);
  titre(feuille, `Chiffre d'affaires HT par affaire — ${EXERCICE} (€)`);
  tableauMensuel(
    feuille,
    jeu.affaires.map((affaire) => [affaire.code, affaire.client.nom] as const),
    ['Affaire', 'Client'],
  );
}

function feuilleCarnet(classeur: ExcelJS.Workbook, jeu: JeuDeDonnees): void {
  const feuille = classeur.addWorksheet(ONGLETS.carnet);
  titre(feuille, `Carnet de commandes au 31/12/${EXERCICE} (€)`);
  enteteEnGras(
    feuille.insertRow(3, [
      'Affaire',
      'Client',
      'Commandé',
      'Facturé',
      'Reste à facturer',
      '% facturé',
    ]),
  );
  const derniere = PREMIERE_LIGNE + jeu.affaires.length - 1;
  jeu.affaires.forEach((affaire, rang) => {
    const ligne = PREMIERE_LIGNE + rang;
    feuille.getCell(`A${ligne}`).value = affaire.code;
    feuille.getCell(`B${ligne}`).value = affaire.client.nom;
    feuille.getCell(`E${ligne}`).value = { formula: `C${ligne}-D${ligne}` };
    feuille.getCell(`F${ligne}`).value = { formula: `IF(C${ligne}=0,0,D${ligne}/C${ligne})` };
  });
  const ligneTotal = derniere + 1;
  feuille.getCell(`A${ligneTotal}`).value = 'Total';
  for (const lettre of ['C', 'D', 'E']) {
    feuille.getCell(`${lettre}${ligneTotal}`).value = {
      formula: `SUM(${lettre}${PREMIERE_LIGNE}:${lettre}${derniere})`,
    };
    feuille.getColumn(lettre).numFmt = FORMAT_MONTANT;
    feuille.getColumn(lettre).width = 16;
  }
  feuille.getCell(`F${ligneTotal}`).value = {
    formula: `IF(C${ligneTotal}=0,0,D${ligneTotal}/C${ligneTotal})`,
  };
  feuille.getColumn('F').numFmt = FORMAT_POURCENTAGE;
  feuille.getRow(ligneTotal).font = { bold: true };
  feuille.getColumn(1).width = 12;
  feuille.getColumn(2).width = 28;
}

function feuilleTresorerie(classeur: ExcelJS.Workbook): void {
  const feuille = classeur.addWorksheet(ONGLETS.tresorerie);
  titre(feuille, `Trésorerie ${EXERCICE} — compte 512000 (€)`);
  feuille.getCell('B3').value = 'Solde initial';
  feuille.getCell('B3').font = { bold: true };
  feuille.getCell(CELLULE_SOLDE_INITIAL).numFmt = FORMAT_MONTANT;
  enteteEnGras(
    feuille.insertRow(PREMIERE_LIGNE_TRESORERIE - 1, [
      'Mois',
      'Encaissements',
      'Décaissements',
      'Variation',
      'Solde fin de mois',
    ]),
  );
  MOIS_COURTS.forEach((libelle, index) => {
    const ligne = PREMIERE_LIGNE_TRESORERIE + index;
    const precedent = index === 0 ? '$C$3' : `E${ligne - 1}`;
    feuille.getCell(`A${ligne}`).value = libelle;
    feuille.getCell(`D${ligne}`).value = { formula: `B${ligne}-C${ligne}` };
    feuille.getCell(`E${ligne}`).value = { formula: `${precedent}+D${ligne}` };
  });
  for (const lettre of ['B', 'C', 'D', 'E']) {
    feuille.getColumn(lettre).numFmt = FORMAT_MONTANT;
    feuille.getColumn(lettre).width = 18;
  }
  feuille.getColumn('A').width = 14;
}

function feuilleAchats(classeur: ExcelJS.Workbook, jeu: JeuDeDonnees): void {
  const feuille = classeur.addWorksheet(ONGLETS.achats);
  titre(feuille, `Achats HT par fournisseur — ${EXERCICE} (€)`);
  tableauMensuel(
    feuille,
    jeu.fournisseurs.map((fournisseur) => [fournisseur.code, fournisseur.nom] as const),
    ['Code', 'Fournisseur'],
  );
}

export async function genererGabarit(jeu: JeuDeDonnees): Promise<Buffer> {
  const classeur = nouveauClasseur();
  classeur.title = `Reporting direction ${EXERCICE}`;
  classeur.subject = SOCIETE.mention;
  feuilleCa(classeur, jeu);
  feuilleCarnet(classeur, jeu);
  feuilleTresorerie(classeur);
  feuilleAchats(classeur, jeu);
  return versOctets(classeur);
}
