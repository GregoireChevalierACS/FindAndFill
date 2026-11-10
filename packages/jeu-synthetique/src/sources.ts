import { commandeEur, factureEur } from './agregats.js';
import {
  enteteEnGras,
  FORMAT_DATE,
  FORMAT_MONTANT,
  nouveauClasseur,
  versOctets,
} from './classeur.js';
import { versDate, versFrancais } from './dates.js';
import { enEuros, montantTexte } from './format.js';
import { EXERCICE, SOCIETE, type JeuDeDonnees } from './modele.js';

const MENTION_EDITION = `Édité le 05/01/2027 — ${SOCIETE.mention}`;
const COMMERCIAUX = ['M. Durand', 'Mme Klein', 'M. Weber'] as const;

export const ONGLET_VENTES = 'Ventes';
export const ONGLET_CARNET = `Commandes ${EXERCICE}`;
export const ONGLET_CARNET_RENOMME = `Carnet ${EXERCICE}`;
export const LIGNE_ENTETE_VENTES = 4;
export const LIGNE_ENTETE_CARNET = 3;

export const COLONNES_VENTES = [
  'N° facture',
  'Date',
  'Code affaire',
  'Client',
  'Pays',
  'Devise',
  'Montant devise',
  'Montant HT EUR',
  'TVA EUR',
  'TTC EUR',
] as const;
export const COLONNE_AJOUTEE_VENTES = 'Commercial';

export interface OptionsVentes {
  /** Variante : ajoute une colonne « Commercial » après « Client ». */
  readonly colonneAjoutee?: boolean;
}

/** Export Excel des ventes, tel qu'un ERP le produit : titre, ligne vide, puis tableau. */
export async function exporterVentes(
  jeu: JeuDeDonnees,
  options: OptionsVentes = {},
): Promise<Buffer> {
  const ajout = options.colonneAjoutee === true;
  const classeur = nouveauClasseur();
  const feuille = classeur.addWorksheet(ONGLET_VENTES);
  feuille.getCell('A1').value = `${SOCIETE.nom} — Export des ventes ${EXERCICE}`;
  feuille.getCell('A1').font = { bold: true, size: 13 };
  feuille.getCell('A2').value = MENTION_EDITION;

  const entetes: string[] = [...COLONNES_VENTES];
  if (ajout) {
    entetes.splice(entetes.indexOf('Client') + 1, 0, COLONNE_AJOUTEE_VENTES);
  }
  enteteEnGras(feuille.insertRow(LIGNE_ENTETE_VENTES, entetes));

  for (const vente of jeu.ventes) {
    const { client } = vente.affaire;
    const valeurs: (string | number | Date)[] = [
      vente.numero,
      versDate(vente.date),
      vente.affaire.code,
      client.nom,
      client.pays,
      client.devise,
      enEuros(vente.echeance.montantDevise),
      enEuros(vente.htEur),
      enEuros(vente.tvaEur),
      enEuros(vente.ttcEur),
    ];
    if (ajout) {
      valeurs.splice(4, 0, COMMERCIAUX[jeu.clients.indexOf(client) % COMMERCIAUX.length] ?? '');
    }
    feuille.addRow(valeurs);
  }

  entetes.forEach((entete, index) => {
    const colonne = feuille.getColumn(index + 1);
    colonne.width = Math.max(12, entete.length + 4);
    if (entete === 'Date') {
      colonne.numFmt = FORMAT_DATE;
    } else if (entete.startsWith('Montant') || entete.endsWith('EUR')) {
      colonne.numFmt = FORMAT_MONTANT;
    }
  });
  feuille.getColumn(entetes.indexOf('Client') + 1).width = 28;
  return versOctets(classeur);
}

export const COLONNES_CARNET = [
  'Code affaire',
  'Client',
  'Désignation',
  'Date commande',
  'Devise',
  'Commandé devise',
  'Commandé EUR',
  'Facturé à date EUR',
  'Reste à facturer EUR',
] as const;

export interface OptionsCarnet {
  /** Variante : l'onglet porte un autre nom. */
  readonly ongletRenomme?: boolean;
}

/** Carnet de commandes au 31/12 : une ligne par affaire. */
export async function exporterCarnet(
  jeu: JeuDeDonnees,
  options: OptionsCarnet = {},
): Promise<Buffer> {
  const classeur = nouveauClasseur();
  const feuille = classeur.addWorksheet(
    options.ongletRenomme === true ? ONGLET_CARNET_RENOMME : ONGLET_CARNET,
  );
  feuille.getCell('A1').value = `Carnet de commandes au 31/12/${EXERCICE}`;
  feuille.getCell('A1').font = { bold: true, size: 13 };
  enteteEnGras(feuille.insertRow(LIGNE_ENTETE_CARNET, [...COLONNES_CARNET]));

  for (const affaire of jeu.affaires) {
    const commande = commandeEur(affaire);
    const facture = factureEur(jeu, affaire);
    feuille.addRow([
      affaire.code,
      affaire.client.nom,
      affaire.designation,
      versDate(affaire.dateCommande),
      affaire.client.devise,
      enEuros(affaire.echeances.reduce((total, e) => total + e.montantDevise, 0)),
      enEuros(commande),
      enEuros(facture),
      enEuros(commande - facture),
    ]);
  }
  COLONNES_CARNET.forEach((entete, index) => {
    const colonne = feuille.getColumn(index + 1);
    colonne.width = Math.max(12, entete.length + 4);
    if (entete === 'Date commande') {
      colonne.numFmt = FORMAT_DATE;
    } else if (index >= 5) {
      colonne.numFmt = FORMAT_MONTANT;
    }
  });
  feuille.getColumn(2).width = 28;
  feuille.getColumn(3).width = 26;
  return versOctets(classeur);
}

export const COLONNES_ACHATS = [
  'Date',
  'N° pièce',
  'Fournisseur',
  'Compte',
  'Code affaire',
  'Libellé',
  'Montant HT',
  'TVA',
  'Montant TTC',
] as const;

/** Ordre de la variante : montants avant les imputations. */
export const COLONNES_ACHATS_DEPLACEES = [
  'Date',
  'N° pièce',
  'Fournisseur',
  'Montant TTC',
  'Montant HT',
  'TVA',
  'Compte',
  'Code affaire',
  'Libellé',
] as const;

/** Marque d'ordre des octets UTF-8, que mettent Excel et beaucoup d'ERP en tête de CSV. */
export const BOM = String.fromCharCode(0xfeff);

type ColonneAchat = (typeof COLONNES_ACHATS)[number];

function champCsv(valeur: string): string {
  return /[;"\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur;
}

export interface OptionsAchats {
  /** Variante : colonnes dans un autre ordre. */
  readonly colonnesDeplacees?: boolean;
}

/** Export CSV « à la française » : point-virgule, virgule décimale, espace des milliers, BOM, CRLF. */
export function exporterAchats(jeu: JeuDeDonnees, options: OptionsAchats = {}): string {
  const colonnes: readonly ColonneAchat[] =
    options.colonnesDeplacees === true ? COLONNES_ACHATS_DEPLACEES : COLONNES_ACHATS;
  const lignes = jeu.achats.map((achat) => {
    const valeurs: Record<ColonneAchat, string> = {
      Date: versFrancais(achat.date),
      'N° pièce': achat.numero,
      Fournisseur: achat.fournisseur.nom,
      Compte: achat.fournisseur.compte,
      'Code affaire': achat.affaire?.code ?? '',
      Libellé: achat.fournisseur.compteLibelle,
      'Montant HT': montantTexte(achat.ht, ' '),
      TVA: montantTexte(achat.tva, ' '),
      'Montant TTC': montantTexte(achat.ttc, ' '),
    };
    return colonnes.map((colonne) => champCsv(valeurs[colonne]));
  });
  return `${BOM}${[colonnes, ...lignes].map((ligne) => `${ligne.join(';')}\r\n`).join('')}`;
}
