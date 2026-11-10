import type { ModeleRemplissage, Regle, SourceDuModele } from '@findandfill/domain';
import { COLONNES_FEC } from './fec.js';
import { ONGLETS } from './gabarit.js';
import { EXERCICE } from './modele.js';
import {
  COLONNES_ACHATS,
  COLONNES_CARNET,
  COLONNES_VENTES,
  ONGLET_CARNET,
  ONGLET_VENTES,
} from './sources.js';

/**
 * Modèles de remplissage tels qu'un comptable les configurerait pour le jeu synthétique.
 * Ils servent de référence aux tests de recette et d'exemples dans l'application.
 */

const SOURCES = {
  ventes: {
    id: 'ventes',
    libelle: 'Export des ventes (Excel)',
    empreinte: { onglet: ONGLET_VENTES, entetes: [...COLONNES_VENTES] },
  },
  carnet: {
    id: 'carnet',
    libelle: 'Carnet de commandes (Excel)',
    empreinte: { onglet: ONGLET_CARNET, entetes: [...COLONNES_CARNET] },
  },
  fec: {
    id: 'fec',
    libelle: 'Fichier des écritures comptables (FEC)',
    empreinte: { entetes: [...COLONNES_FEC] },
  },
  achats: {
    id: 'achats',
    libelle: 'Export des achats (CSV)',
    empreinte: { entetes: [...COLONNES_ACHATS] },
  },
} as const satisfies Record<string, SourceDuModele>;

const BANQUE = { colonne: 'CompteNum', operateur: 'egal', valeur: '512000' } as const;

const REGLES = {
  ca: [
    {
      id: 'ca-mensuel',
      type: 'mensuel-par-cle',
      source: 'ventes',
      cle: 'Code affaire',
      date: 'Date',
      montant: { plus: 'Montant HT EUR' },
      cible: { onglet: ONGLETS.ca, colonneCles: 'A', premiereColonneMois: 'C' },
    },
  ],
  carnet: [
    {
      id: 'carnet-commande',
      type: 'par-cle',
      source: 'carnet',
      cle: 'Code affaire',
      montant: { plus: 'Commandé EUR' },
      cible: { onglet: ONGLETS.carnet, colonneCles: 'A', colonne: 'C' },
    },
    {
      id: 'carnet-facture',
      type: 'par-cle',
      source: 'carnet',
      cle: 'Code affaire',
      montant: { plus: 'Facturé à date EUR' },
      cible: { onglet: ONGLETS.carnet, colonneCles: 'A', colonne: 'D' },
    },
  ],
  tresorerie: [
    {
      id: 'tresorerie-solde-initial',
      type: 'total',
      source: 'fec',
      montant: { plus: 'Debit', moins: 'Credit' },
      filtres: [{ colonne: 'JournalCode', operateur: 'egal', valeur: 'AN' }, BANQUE],
      cible: { onglet: ONGLETS.tresorerie, adresse: 'C3' },
    },
    {
      id: 'tresorerie-encaissements',
      type: 'mensuel',
      source: 'fec',
      date: 'EcritureDate',
      montant: { plus: 'Debit' },
      filtres: [{ colonne: 'JournalCode', operateur: 'different', valeur: 'AN' }, BANQUE],
      cible: { onglet: ONGLETS.tresorerie, colonne: 'B', ligneJanvier: 6 },
    },
    {
      id: 'tresorerie-decaissements',
      type: 'mensuel',
      source: 'fec',
      date: 'EcritureDate',
      montant: { plus: 'Credit' },
      filtres: [{ colonne: 'JournalCode', operateur: 'different', valeur: 'AN' }, BANQUE],
      cible: { onglet: ONGLETS.tresorerie, colonne: 'C', ligneJanvier: 6 },
    },
  ],
  achats: [
    {
      id: 'achats-mensuel',
      type: 'mensuel-par-cle',
      source: 'achats',
      cle: 'Fournisseur',
      date: 'Date',
      montant: { plus: 'Montant HT' },
      cible: { onglet: ONGLETS.achats, colonneCles: 'B', premiereColonneMois: 'C' },
    },
  ],
} as const satisfies Record<string, readonly Regle[]>;

function modele(
  nom: string,
  sources: readonly SourceDuModele[],
  regles: readonly Regle[],
): ModeleRemplissage {
  return { nom, annee: EXERCICE, sources, regles };
}

/** Modèle de chaque cas de remplissage du catalogue, par identifiant de cas. */
export const MODELES_DE_REFERENCE: Readonly<Record<string, ModeleRemplissage>> = {
  'ca-par-affaire': modele('CA par affaire', [SOURCES.ventes], REGLES.ca),
  'carnet-commandes': modele('Carnet de commandes', [SOURCES.carnet], REGLES.carnet),
  tresorerie: modele('Trésorerie', [SOURCES.fec], REGLES.tresorerie),
  'achats-par-fournisseur': modele('Achats par fournisseur', [SOURCES.achats], REGLES.achats),
  'ca-par-affaire-macros': modele('CA par affaire', [SOURCES.ventes], REGLES.ca),
  'reporting-complet-macros': modele(
    'Reporting direction complet',
    [SOURCES.ventes, SOURCES.carnet, SOURCES.fec, SOURCES.achats],
    [...REGLES.ca, ...REGLES.carnet, ...REGLES.tresorerie, ...REGLES.achats],
  ),
};
