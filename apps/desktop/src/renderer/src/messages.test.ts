import type { ModeleRemplissage } from '@findandfill/domain';
import { describe, expect, it } from 'vitest';
import type { ErreurInterface } from '../../shared/api.js';
import {
  decrireAvertissement,
  decrireChangement,
  decrireErreur,
  formaterMontant,
  nomDeFichier,
  resumerLignes,
} from './messages.js';

const MODELE: ModeleRemplissage = {
  nom: 'Test',
  annee: 2026,
  sources: [{ id: 'ventes', libelle: 'Export des ventes', empreinte: { entetes: ['A'] } }],
  regles: [],
};

/** Intl utilise des espaces insécables : on les normalise pour comparer. */
const espaces = (texte: string) => texte.replace(/\s/g, ' ');

describe('formats', () => {
  it('écrit les montants en euros à la française', () => {
    expect(espaces(formaterMontant(123456))).toBe('1 234,56 €');
    expect(espaces(formaterMontant(-5))).toBe('-0,05 €');
  });

  it('extrait le nom d’un chemin Windows ou Unix', () => {
    expect(nomDeFichier('C:\\Compta\\ventes.xlsx')).toBe('ventes.xlsx');
    expect(nomDeFichier('/tmp/achats.csv')).toBe('achats.csv');
    expect(nomDeFichier('seul.txt')).toBe('seul.txt');
  });

  it.each([
    [[], 'aucune ligne'],
    [[7], 'ligne 7'],
    [[3, 3], 'ligne 3'],
    [[5, 3, 4, 9], 'lignes 3 à 5, 9'],
    [[1, 3, 5, 7], 'lignes 1, 3, 5, 7'],
    [[1, 3, 5, 7, 9, 10], '6 lignes (1 à 10)'],
  ])('résume %j en « %s »', (lignes, attendu) => {
    expect(resumerLignes(lignes)).toBe(attendu);
  });
});

describe('decrireChangement', () => {
  it.each([
    [
      {
        nature: 'onglet-introuvable',
        onglet: 'Commandes',
        ongletsDisponibles: ['Carnet', 'Notes'],
      },
      'L’onglet « Commandes » est introuvable. Onglets présents : « Carnet », « Notes ».',
    ],
    [
      { nature: 'onglet-introuvable', onglet: '', ongletsDisponibles: [] },
      'Le fichier ne contient aucune feuille.',
    ],
    [
      { nature: 'entetes-introuvables' },
      'La ligne d’en-têtes attendue est introuvable dans les 30 premières lignes.',
    ],
    [
      { nature: 'colonnes-ajoutees', colonnes: ['Commercial'] },
      'Colonne(s) ajoutée(s) : « Commercial ».',
    ],
    [
      { nature: 'colonnes-supprimees', colonnes: ['TVA', 'TTC'] },
      'Colonne(s) disparue(s) : « TVA », « TTC ».',
    ],
    [{ nature: 'colonnes-deplacees', colonnes: ['HT'] }, 'Colonne(s) déplacée(s) : « HT ».'],
  ] as const)('décrit %j', (changement, attendu) => {
    expect(decrireChangement(changement)).toBe(attendu);
  });
});

describe('decrireErreur', () => {
  const cas: [ErreurInterface, string, string[], RegExp][] = [
    [
      { nature: 'modele-invalide', detail: 'nom : requis' },
      'Le modèle est invalide.',
      ['nom : requis'],
      /corrigez-le/,
    ],
    [
      { nature: 'fichier-illisible', fichier: 'C:\\x\\ventes.xlsx', detail: 'zip corrompu' },
      'Impossible de lire « ventes.xlsx ».',
      ['zip corrompu'],
      /endommagé/,
    ],
    [
      { nature: 'source-absente', source: 'ventes' },
      'Aucun fichier choisi pour « Export des ventes ».',
      [],
      /Choisissez/,
    ],
    [
      {
        nature: 'structure-modifiee',
        source: 'ventes',
        changements: [{ nature: 'colonnes-ajoutees', colonnes: ['X'] }],
      },
      'La structure de « Export des ventes » a changé : rien n’a été rempli.',
      ['Colonne(s) ajoutée(s) : « X ».'],
      /bon fichier/,
    ],
    [
      { nature: 'source-inconnue', regle: 'ca', source: 'achats' },
      'La règle « ca » utilise la source « achats », absente du modèle.',
      [],
      /corrigez-le/,
    ],
    [
      { nature: 'colonne-inconnue', regle: 'ca', colonne: 'HT' },
      'La règle « ca » utilise la colonne « HT », absente de sa source.',
      [],
      /corrigez-le/,
    ],
    [
      { nature: 'onglet-cible-introuvable', regle: 'ca', onglet: 'CA' },
      'L’onglet « CA » est introuvable dans le gabarit.',
      ['Règle « ca ».'],
      /bon gabarit/,
    ],
    [
      { nature: 'valeur-illisible', regle: 'ca', ligne: 12, colonne: 'HT', valeur: 'douze' },
      'Valeur illisible ligne 12, colonne « HT » : « douze ».',
      ['Règle « ca ».'],
      /Corrigez cette cellule/,
    ],
    [
      { nature: 'cible-formule', regle: 'ca', onglet: 'CA', adresse: 'O4' },
      'La cellule CA!O4 du gabarit contient une formule.',
      ['Règle « ca ».'],
      /cellules de saisie/,
    ],
    [
      { nature: 'cible-en-double', regle: 'ca', onglet: 'CA', adresse: 'C4' },
      'Plusieurs règles écrivent dans la cellule CA!C4.',
      ['Règle « ca ».'],
      /corrigez-le/,
    ],
  ];

  it.each(cas)('décrit %j', (erreur, titre, details, conseil) => {
    const message = decrireErreur(erreur, MODELE);
    expect(message.titre).toBe(titre);
    expect(message.details).toEqual(details);
    expect(message.conseil).toMatch(conseil);
  });

  it('se rabat sur l’identifiant de source sans modèle', () => {
    expect(decrireErreur({ nature: 'source-absente', source: 'ventes' }, null).titre).toBe(
      'Aucun fichier choisi pour « ventes ».',
    );
  });
});

describe('decrireAvertissement', () => {
  it('décrit une clé absente du gabarit, vide ou non', () => {
    expect(
      espaces(
        decrireAvertissement(
          {
            nature: 'cle-absente-de-la-cible',
            regle: 'ca',
            cle: 'AF99',
            montant: 150000 as never,
            lignes: [4, 5],
          },
          MODELE,
        ),
      ),
    ).toBe(
      '« AF99 » n’a pas de ligne dans le gabarit : 1 500,00 € non reportés (lignes 4 à 5, règle « ca »).',
    );
    expect(
      decrireAvertissement(
        {
          nature: 'cle-absente-de-la-cible',
          regle: 'ca',
          cle: '',
          montant: 0 as never,
          lignes: [2],
        },
        MODELE,
      ),
    ).toMatch(/^\(vide\) n’a pas de ligne/);
  });

  it('décrit des lignes hors exercice', () => {
    expect(decrireAvertissement({ nature: 'hors-periode', regle: 'ca', lignes: [3] }, MODELE)).toBe(
      'ligne 3 hors de l’exercice 2026 ignorée(s) (règle « ca »).',
    );
    expect(decrireAvertissement({ nature: 'hors-periode', regle: 'ca', lignes: [3] }, null)).toBe(
      'ligne 3 hors de l’exercice  ignorée(s) (règle « ca »).',
    );
  });
});
