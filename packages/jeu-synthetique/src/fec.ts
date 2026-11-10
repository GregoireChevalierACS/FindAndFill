import { versFec } from './dates.js';
import { montantTexte } from './format.js';
import { FIN_EXERCICE, SOCIETE, type JeuDeDonnees } from './modele.js';

/** Les 18 colonnes du fichier des écritures comptables (article A47 A-1 du LPF). */
export const COLONNES_FEC = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
] as const;

export function nomFichierFec(): string {
  return `${SOCIETE.siren}FEC${versFec(FIN_EXERCICE)}.txt`;
}

/** FEC au format texte : tabulations, dates AAAAMMJJ, montants à virgule, fins de ligne CRLF. */
export function genererFec(jeu: JeuDeDonnees): string {
  const lignes = jeu.ecritures.flatMap((ecriture) =>
    ecriture.lignes.map((ligne) =>
      [
        ecriture.journal.code,
        ecriture.journal.libelle,
        ecriture.numero,
        versFec(ecriture.date),
        ligne.compte,
        ligne.compteLibelle,
        ligne.auxiliaire?.numero ?? '',
        ligne.auxiliaire?.libelle ?? '',
        ecriture.piece,
        versFec(ecriture.date),
        ecriture.libelle,
        montantTexte(ligne.debit),
        montantTexte(ligne.credit),
        '',
        '',
        versFec(ecriture.date),
        ligne.devise === null ? '' : montantTexte(ligne.devise.montant),
        ligne.devise?.code ?? '',
      ].join('\t'),
    ),
  );
  return [COLONNES_FEC.join('\t'), ...lignes].map((ligne) => `${ligne}\r\n`).join('');
}
