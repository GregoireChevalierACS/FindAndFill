import { describe, expect, it } from 'vitest';
import type { Feuille } from './classeur.js';
import type { ModeleRemplissage, Regle } from './modele-remplissage.js';
import { empreinteDeLigne, LIGNES_EXPLOREES, proposerLigneEntetes } from './structure.js';
import { verifierModele } from './verification.js';

describe('proposerLigneEntetes', () => {
  it('trouve les en-têtes d’un export Excel sous un titre', () => {
    const feuille: Feuille = {
      nom: 'Ventes',
      lignes: [
        ['Export des ventes 2026'],
        [],
        ['N° facture', 'Date', 'Client', 'Montant'],
        ['FV-1', '2026-01-05', 'Lefort', 1200],
        ['FV-2', '2026-01-06', 'Hollmann', 300],
      ],
    };
    expect(proposerLigneEntetes(feuille)).toBe(2);
  });

  it('ne compte ni les montants ni les dates écrits en texte (CSV)', () => {
    const feuille: Feuille = {
      nom: '',
      lignes: [
        ['Date', 'Fournisseur', 'Montant HT'],
        ['04/01/2026', 'Transports Kessler', '97 278,12'],
        ['05/01/2026', 'Inox Process', '16 305,06'],
      ],
    };
    expect(proposerLigneEntetes(feuille)).toBe(0);
  });

  it('préfère la plus haute en cas d’égalité, et ignore les nombres', () => {
    expect(
      proposerLigneEntetes({
        nom: '',
        lignes: [
          [1, 2, 3],
          ['a', 'b'],
          ['c', 'd', 4],
        ],
      }),
    ).toBe(1);
  });

  it('ne regarde que les premières lignes', () => {
    const vides = Array.from({ length: LIGNES_EXPLOREES }, () => [1]);
    expect(proposerLigneEntetes({ nom: '', lignes: [...vides, ['a', 'b']] })).toBeNull();
    expect(proposerLigneEntetes({ nom: '', lignes: [...vides.slice(1), ['a', 'b']] })).toBe(
      LIGNES_EXPLOREES - 1,
    );
  });

  it('renvoie null pour une feuille sans texte', () => {
    expect(proposerLigneEntetes({ nom: '', lignes: [] })).toBeNull();
    expect(proposerLigneEntetes({ nom: '', lignes: [[null, '  ', 12]] })).toBeNull();
  });
});

describe('empreinteDeLigne', () => {
  const feuille: Feuille = { nom: 'V', lignes: [['Titre'], [' Date ', 'Montant', null, '']] };

  it('retient les en-têtes nettoyés et l’onglet', () => {
    expect(empreinteDeLigne(feuille, 1, 'V')).toEqual({
      onglet: 'V',
      entetes: ['Date', 'Montant'],
    });
  });

  it('omet l’onglet pour un CSV, et donne des en-têtes vides hors de la feuille', () => {
    expect(empreinteDeLigne(feuille, 0)).toEqual({ entetes: ['Titre'] });
    expect(empreinteDeLigne(feuille, 9)).toEqual({ entetes: [] });
  });
});

const VENTES = {
  id: 'ventes',
  libelle: 'Ventes',
  empreinte: { entetes: ['Date', 'Affaire', 'HT', 'Avoir', 'Type'] },
};

const CA: Regle = {
  id: 'ca',
  type: 'mensuel-par-cle',
  source: 'ventes',
  cle: 'Affaire',
  date: 'Date',
  montant: { plus: 'HT', moins: 'Avoir' },
  filtres: [{ colonne: 'Type', operateur: 'egal', valeur: 'F' }],
  cible: { onglet: 'CA', colonneCles: 'A', premiereColonneMois: 'C' },
};

function modele(regles: Regle[], sources = [VENTES]): ModeleRemplissage {
  return { nom: 'M', annee: 2026, sources, regles };
}

describe('verifierModele', () => {
  it('ne signale rien pour un modèle cohérent', () => {
    const regles: Regle[] = [
      CA,
      {
        id: 'treso',
        type: 'mensuel',
        source: 'ventes',
        date: 'Date',
        montant: { plus: 'HT' },
        cible: { onglet: 'T', colonne: 'B', ligneJanvier: 6 },
      },
      {
        id: 'carnet',
        type: 'par-cle',
        source: 'ventes',
        cle: 'Affaire',
        montant: { plus: 'HT' },
        cible: { onglet: 'C', colonneCles: 'A', colonne: 'XFD' },
      },
      {
        id: 'solde',
        type: 'total',
        source: 'ventes',
        montant: { plus: 'HT' },
        cible: { onglet: 'T', adresse: 'C3' },
      },
    ];
    expect(verifierModele(modele(regles))).toEqual([]);
  });

  it('signale un modèle vide', () => {
    expect(verifierModele(modele([], []))).toEqual([
      { nature: 'aucune-source' },
      { nature: 'aucune-regle' },
    ]);
  });

  it('signale les identifiants en double, une seule fois chacun', () => {
    expect(verifierModele(modele([CA, CA, CA], [VENTES, VENTES]))).toEqual([
      { nature: 'identifiant-en-double', quoi: 'source', id: 'ventes' },
      { nature: 'identifiant-en-double', quoi: 'regle', id: 'ca' },
    ]);
  });

  it('signale des en-têtes vides ou en double', () => {
    const sources = [
      { id: 'a', libelle: 'A', empreinte: { entetes: ['', ''] } },
      { id: 'b', libelle: 'B', empreinte: { entetes: ['X', '', 'X', '', 'Y'] } },
    ];
    expect(
      verifierModele(
        modele(
          [{ ...CA, source: 'b', cle: 'X', date: 'Y', montant: { plus: 'Y' }, filtres: [] }],
          sources,
        ),
      ),
    ).toEqual([
      { nature: 'entetes-vides', source: 'a' },
      { nature: 'entete-en-double', source: 'b', entete: 'X' },
    ]);
  });

  it('signale une source inconnue sans vérifier ses colonnes', () => {
    expect(verifierModele(modele([{ ...CA, source: 'achats' }]))).toEqual([
      { nature: 'source-inconnue', regle: 'ca', source: 'achats' },
    ]);
  });

  it('signale chaque colonne inconnue une seule fois', () => {
    const regle: Regle = {
      ...CA,
      cle: 'Client',
      date: 'Jour',
      montant: { plus: 'TTC', moins: 'TTC' },
      filtres: [{ colonne: 'Statut', operateur: 'egal', valeur: '' }],
    };
    expect(verifierModele(modele([regle])).map((p) => 'colonne' in p && p.colonne)).toEqual([
      'TTC',
      'Client',
      'Jour',
      'Statut',
    ]);
  });

  it.each([
    [
      { ...CA, cible: { onglet: 'CA', colonneCles: 'a', premiereColonneMois: 'C' } },
      'colonneCles',
      'a',
    ],
    [
      { ...CA, cible: { onglet: 'CA', colonneCles: 'A', premiereColonneMois: 'XFC' } },
      'premiereColonneMois',
      'XFC',
    ],
    [
      { ...CA, cible: { onglet: 'CA', colonneCles: 'A', premiereColonneMois: 'XET' } },
      'premiereColonneMois',
      'XET',
    ],
    [
      {
        id: 'm',
        type: 'mensuel',
        source: 'ventes',
        date: 'Date',
        montant: { plus: 'HT' },
        cible: { onglet: 'T', colonne: '1', ligneJanvier: 6 },
      },
      'colonne',
      '1',
    ],
    [
      {
        id: 'm',
        type: 'mensuel',
        source: 'ventes',
        date: 'Date',
        montant: { plus: 'HT' },
        cible: { onglet: 'T', colonne: 'B', ligneJanvier: 0 },
      },
      'ligneJanvier',
      '0',
    ],
    [
      {
        id: 'm',
        type: 'mensuel',
        source: 'ventes',
        date: 'Date',
        montant: { plus: 'HT' },
        cible: { onglet: 'T', colonne: 'B', ligneJanvier: 1.5 },
      },
      'ligneJanvier',
      '1.5',
    ],
    [
      {
        id: 'p',
        type: 'par-cle',
        source: 'ventes',
        cle: 'Affaire',
        montant: { plus: 'HT' },
        cible: { onglet: 'C', colonneCles: '', colonne: 'C' },
      },
      'colonneCles',
      '',
    ],
    [
      {
        id: 'p',
        type: 'par-cle',
        source: 'ventes',
        cle: 'Affaire',
        montant: { plus: 'HT' },
        cible: { onglet: 'C', colonneCles: 'A', colonne: 'XFE' },
      },
      'colonne',
      'XFE',
    ],
    [
      {
        id: 't',
        type: 'total',
        source: 'ventes',
        montant: { plus: 'HT' },
        cible: { onglet: 'T', adresse: 'C0' },
      },
      'adresse',
      'C0',
    ],
  ] as [Regle, string, string][])('signale une cible invalide (%#)', (regle, champ, valeur) => {
    expect(verifierModele(modele([regle]))).toEqual([
      { nature: 'cible-invalide', regle: regle.id, champ, valeur },
    ]);
  });

  it('accepte la dernière colonne de départ possible pour douze mois', () => {
    expect(
      verifierModele(
        modele([{ ...CA, cible: { onglet: 'CA', colonneCles: 'A', premiereColonneMois: 'XES' } }]),
      ),
    ).toEqual([]);
  });
});
