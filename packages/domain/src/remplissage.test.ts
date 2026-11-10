import { describe, expect, it } from 'vitest';
import type { Classeur, ValeurCellule } from './classeur.js';
import type { ModeleRemplissage, Regle, SourceDuModele } from './modele-remplissage.js';
import { calculerRemplissage, type CelluleARemplir, type VueCible } from './remplissage.js';

type CelluleFactice = string | { formule: string };

/** Cible factice : onglet → adresse → texte ou formule. */
function vue(onglets: Record<string, Record<string, CelluleFactice>>): VueCible {
  return {
    onglets: () => Object.keys(onglets),
    colonne(onglet, colonne) {
      const lettre = String.fromCharCode(64 + colonne);
      const resultat = new Map<number, string>();
      for (const [adresse, contenu] of Object.entries(onglets[onglet] ?? {})) {
        const [, lettres, ligne] = /^([A-Z]+)(\d+)$/.exec(adresse) ?? [];
        if (lettres === lettre && typeof contenu === 'string') {
          resultat.set(Number(ligne), contenu);
        }
      }
      return new Map([...resultat].sort(([a], [b]) => a - b));
    },
    contenu(onglet, adresse) {
      const contenu = onglets[onglet]?.[adresse];
      if (contenu === undefined) return 'vide';
      return typeof contenu === 'string' ? 'valeur' : 'formule';
    },
  };
}

const VENTES: SourceDuModele = {
  id: 'ventes',
  libelle: 'Export des ventes',
  empreinte: { onglet: 'Ventes', entetes: ['Date', 'Affaire', 'HT', 'Type'] },
};

function ventes(lignes: ValeurCellule[][]): Classeur {
  return {
    feuilles: [
      { nom: 'Ventes', lignes: [['Export'], ['Date', 'Affaire', 'HT', 'Type'], ...lignes] },
    ],
  };
}

const CA: Regle = {
  id: 'ca',
  type: 'mensuel-par-cle',
  source: 'ventes',
  cle: 'Affaire',
  date: 'Date',
  montant: { plus: 'HT' },
  cible: { onglet: 'CA', colonneCles: 'A', premiereColonneMois: 'C' },
};

const CIBLE_CA = vue({
  CA: {
    A3: 'Affaire',
    C3: 'janv.',
    A4: 'AF1',
    A5: 'AF2',
    A6: 'AF2',
    A7: 'Total',
    O4: { formule: 'SUM(C4:N4)' },
  },
});

function modele(regles: Regle[], sources: SourceDuModele[] = [VENTES]): ModeleRemplissage {
  return { nom: 'Test', annee: 2026, sources, regles };
}

function parAdresse(cellules: readonly CelluleARemplir[]): Record<string, number> {
  return Object.fromEntries(cellules.map((c) => [`${c.onglet}!${c.adresse}`, c.valeur]));
}

describe('calculerRemplissage — règle mensuelle par clé', () => {
  const sources = new Map([
    [
      'ventes',
      ventes([
        ['2026-01-05', 'AF1', 1000.5, 'Facture'],
        [],
        ['2026-01-20', 'AF1', '200,25', 'Facture'],
        ['2026-03-01', ' AF2 ', 50, 'Facture'],
        ['2026-03-02', 'AF2', 999, 'Brouillon'],
      ]),
    ],
  ]);
  const regle: Regle = {
    ...CA,
    filtres: [{ colonne: 'Type', operateur: 'egal', valeur: 'Facture' }],
  };
  const resultat = calculerRemplissage(modele([regle]), sources, CIBLE_CA);

  it('cumule par clé et par mois et écrit les douze mois de chaque ligne touchée', () => {
    if (!resultat.ok) throw new Error(JSON.stringify(resultat.erreurs));
    const cellules = parAdresse(resultat.cellules);
    expect(resultat.cellules).toHaveLength(24);
    expect(cellules['CA!C4']).toBe(120075);
    expect(cellules['CA!D4']).toBe(0);
    expect(cellules['CA!N4']).toBe(0);
    expect(cellules['CA!E5']).toBe(5000);
    expect(cellules['CA!C5']).toBe(0);
    expect(cellules['CA!C6']).toBeUndefined();
    expect(resultat.avertissements).toEqual([]);
  });

  it('garde la trace des lignes sources de chaque valeur', () => {
    if (!resultat.ok) throw new Error('échec');
    const c4 = resultat.cellules.find((c) => c.adresse === 'C4');
    expect(c4?.provenance).toEqual({ regle: 'ca', source: 'ventes', lignes: [3, 5] });
    expect(resultat.cellules.find((c) => c.adresse === 'D4')?.provenance.lignes).toEqual([]);
  });

  it('applique un filtre « différent de »', () => {
    const exclus = calculerRemplissage(
      modele([
        { ...CA, filtres: [{ colonne: 'Type', operateur: 'different', valeur: 'Facture' }] },
      ]),
      sources,
      CIBLE_CA,
    );
    expect(exclus.ok && parAdresse(exclus.cellules)).toMatchObject({ 'CA!E5': 99900 });
    expect(exclus.ok && exclus.cellules).toHaveLength(12);
  });

  it('signale les clés absentes de la cible avec leur montant', () => {
    const r = calculerRemplissage(
      modele([CA]),
      new Map([
        [
          'ventes',
          ventes([
            ['2026-01-05', 'AF9', 10, ''],
            ['2026-02-05', 'AF9', 5, ''],
            ['2026-02-05', '', 1, ''],
          ]),
        ],
      ]),
      CIBLE_CA,
    );
    expect(r).toEqual({
      ok: true,
      cellules: [],
      avertissements: [
        {
          nature: 'cle-absente-de-la-cible',
          regle: 'ca',
          cle: 'AF9',
          montant: 1500,
          lignes: [3, 4],
        },
        { nature: 'cle-absente-de-la-cible', regle: 'ca', cle: '', montant: 100, lignes: [5] },
      ],
    });
  });

  it('écarte et signale les lignes d’un autre exercice', () => {
    const r = calculerRemplissage(
      modele([CA]),
      new Map([
        [
          'ventes',
          ventes([
            ['2025-12-31', 'AF1', 10, ''],
            ['2026-01-01', 'AF1', 1, ''],
          ]),
        ],
      ]),
      CIBLE_CA,
    );
    expect(r.ok && parAdresse(r.cellules)['CA!C4']).toBe(100);
    expect(r.ok && r.avertissements).toEqual([
      { nature: 'hors-periode', regle: 'ca', lignes: [3] },
    ]);
  });
});

describe('calculerRemplissage — autres règles', () => {
  const fec: SourceDuModele = {
    id: 'fec',
    libelle: 'FEC',
    empreinte: { entetes: ['Journal', 'Date', 'Compte', 'Debit', 'Credit'] },
  };
  const ecritures: Classeur = {
    feuilles: [
      {
        nom: '',
        lignes: [
          ['Journal', 'Date', 'Compte', 'Debit', 'Credit'],
          ['AN', '20260101', '512', '1000,00', '0,00'],
          ['BQ', '20260115', '512', '200,00', '0,00'],
          ['BQ', '20260116', '512', '0,00', '50,00'],
          ['BQ', '20260310', '512', '0,00', '25,00'],
          ['BQ', '20260310', '401', '25,00', '0,00'],
        ],
      },
    ],
  };
  const tresorerie = vue({ T: { A6: 'janv.', B3: 'Solde', C3: '' } });
  const regles: Regle[] = [
    {
      id: 'solde',
      type: 'total',
      source: 'fec',
      montant: { plus: 'Debit', moins: 'Credit' },
      filtres: [
        { colonne: 'Journal', operateur: 'egal', valeur: 'AN' },
        { colonne: 'Compte', operateur: 'egal', valeur: '512' },
      ],
      cible: { onglet: 'T', adresse: 'C3' },
    },
    {
      id: 'encaissements',
      type: 'mensuel',
      source: 'fec',
      date: 'Date',
      montant: { plus: 'Debit' },
      filtres: [
        { colonne: 'Journal', operateur: 'different', valeur: 'AN' },
        { colonne: 'Compte', operateur: 'egal', valeur: '512' },
      ],
      cible: { onglet: 'T', colonne: 'B', ligneJanvier: 6 },
    },
    {
      id: 'decaissements',
      type: 'mensuel',
      source: 'fec',
      date: 'Date',
      montant: { plus: 'Credit' },
      filtres: [
        { colonne: 'Journal', operateur: 'different', valeur: 'AN' },
        { colonne: 'Compte', operateur: 'egal', valeur: '512' },
      ],
      cible: { onglet: 'T', colonne: 'C', ligneJanvier: 6 },
    },
  ];

  it('calcule un total, et des mois en lignes avec des zéros', () => {
    const r = calculerRemplissage(modele(regles, [fec]), new Map([['fec', ecritures]]), tresorerie);
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    expect(r.cellules).toHaveLength(25);
    expect(parAdresse(r.cellules)).toMatchObject({
      'T!C3': 100000,
      'T!B6': 20000,
      'T!C6': 5000,
      'T!B7': 0,
      'T!C8': 2500,
      'T!B17': 0,
      'T!C17': 0,
    });
    expect(r.cellules.find((c) => c.adresse === 'C3')?.provenance).toEqual({
      regle: 'solde',
      source: 'fec',
      lignes: [2],
    });
  });

  it('écrit un total nul quand aucune ligne ne correspond', () => {
    const r = calculerRemplissage(
      modele(
        [
          {
            ...regles[0],
            filtres: [{ colonne: 'Journal', operateur: 'egal', valeur: 'ZZ' }],
          } as Regle,
        ],
        [fec],
      ),
      new Map([['fec', ecritures]]),
      tresorerie,
    );
    expect(r).toEqual({
      ok: true,
      cellules: [
        {
          onglet: 'T',
          adresse: 'C3',
          valeur: 0,
          provenance: { regle: 'solde', source: 'fec', lignes: [] },
        },
      ],
      avertissements: [],
    });
  });

  it('cumule par clé dans une colonne, en tolérant une ligne source courte', () => {
    const carnet: SourceDuModele = {
      id: 'carnet',
      libelle: 'Carnet',
      empreinte: { onglet: 'Commandes', entetes: ['Affaire', 'Commandé'] },
    };
    const r = calculerRemplissage(
      modele(
        [
          {
            id: 'commande',
            type: 'par-cle',
            source: 'carnet',
            cle: 'Affaire',
            montant: { plus: 'Commandé' },
            cible: { onglet: 'Carnet', colonneCles: 'A', colonne: 'C' },
          },
        ],
        [carnet],
      ),
      new Map([
        [
          'carnet',
          {
            feuilles: [
              {
                nom: 'Commandes',
                lignes: [['Affaire', 'Commandé'], ['AF1', 10], ['AF1'], ['AF2', 2.5]],
              },
            ],
          },
        ],
      ]),
      vue({ Carnet: { A4: 'AF1', A5: 'AF2', A6: 'AF3' } }),
    );
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    expect(r.cellules).toEqual([
      {
        onglet: 'Carnet',
        adresse: 'C4',
        valeur: 1000,
        provenance: { regle: 'commande', source: 'carnet', lignes: [2, 3] },
      },
      {
        onglet: 'Carnet',
        adresse: 'C5',
        valeur: 250,
        provenance: { regle: 'commande', source: 'carnet', lignes: [4] },
      },
    ]);
  });
});

describe('calculerRemplissage — erreurs bloquantes', () => {
  const sources = new Map([['ventes', ventes([['2026-01-05', 'AF1', 10, '']])]]);

  it('signale une source absente', () => {
    expect(calculerRemplissage(modele([CA]), new Map(), CIBLE_CA)).toEqual({
      ok: false,
      erreurs: [{ nature: 'source-absente', source: 'ventes' }],
    });
  });

  it('signale une structure modifiée sans rien calculer', () => {
    const modifiee = new Map([
      [
        'ventes',
        {
          feuilles: [{ nom: 'Ventes', lignes: [['Date', 'Commercial', 'Affaire', 'HT', 'Type']] }],
        },
      ],
    ]);
    expect(calculerRemplissage(modele([CA]), modifiee, CIBLE_CA)).toEqual({
      ok: false,
      erreurs: [
        {
          nature: 'structure-modifiee',
          source: 'ventes',
          changements: [{ nature: 'colonnes-ajoutees', colonnes: ['Commercial'] }],
        },
      ],
    });
  });

  it('signale une règle sur une source non déclarée', () => {
    expect(calculerRemplissage(modele([{ ...CA, source: 'achats' }]), sources, CIBLE_CA)).toEqual({
      ok: false,
      erreurs: [{ nature: 'source-inconnue', regle: 'ca', source: 'achats' }],
    });
  });

  it('signale un onglet cible introuvable', () => {
    expect(
      calculerRemplissage(
        modele([{ ...CA, cible: { ...CA.cible, onglet: 'Chiffre' } }]),
        sources,
        CIBLE_CA,
      ),
    ).toEqual({
      ok: false,
      erreurs: [{ nature: 'onglet-cible-introuvable', regle: 'ca', onglet: 'Chiffre' }],
    });
  });

  it('signale chaque colonne inconnue de la règle', () => {
    const regle = {
      ...CA,
      cle: 'Client',
      montant: { plus: 'HT', moins: 'Avoir' },
      filtres: [{ colonne: 'Statut', operateur: 'egal', valeur: 'x' }],
    } as Regle;
    expect(calculerRemplissage(modele([regle]), sources, CIBLE_CA)).toEqual({
      ok: false,
      erreurs: ['Avoir', 'Statut', 'Client'].map((colonne) => ({
        nature: 'colonne-inconnue',
        regle: 'ca',
        colonne,
      })),
    });
  });

  it('signale les montants et dates illisibles avec leur ligne', () => {
    const r = calculerRemplissage(
      modele([CA]),
      new Map([
        [
          'ventes',
          ventes([
            ['2026-01-05', 'AF1', 'douze', ''],
            ['hier', 'AF1', 1, ''],
          ]),
        ],
      ]),
      CIBLE_CA,
    );
    expect(r).toEqual({
      ok: false,
      erreurs: [
        { nature: 'valeur-illisible', regle: 'ca', ligne: 3, colonne: 'HT', valeur: 'douze' },
        { nature: 'valeur-illisible', regle: 'ca', ligne: 4, colonne: 'Date', valeur: 'hier' },
      ],
    });
  });

  it('signale un débit ou un crédit illisible', () => {
    const regle: Regle = {
      id: 't',
      type: 'total',
      source: 'ventes',
      montant: { plus: 'HT', moins: 'Type' },
      cible: { onglet: 'CA', adresse: 'B2' },
    };
    const r = calculerRemplissage(modele([regle]), sources, CIBLE_CA);
    expect(r.ok).toBe(true);
    const illisible = calculerRemplissage(
      modele([regle]),
      new Map([['ventes', ventes([['2026-01-05', 'AF1', 10, 'x']])]]),
      CIBLE_CA,
    );
    expect(illisible).toEqual({
      ok: false,
      erreurs: [{ nature: 'valeur-illisible', regle: 't', ligne: 3, colonne: 'Type', valeur: 'x' }],
    });
  });

  it('refuse d’écraser une formule de la cible', () => {
    const regle: Regle = {
      id: 't',
      type: 'total',
      source: 'ventes',
      montant: { plus: 'HT' },
      cible: { onglet: 'CA', adresse: 'O4' },
    };
    expect(calculerRemplissage(modele([regle]), sources, CIBLE_CA)).toEqual({
      ok: false,
      erreurs: [{ nature: 'cible-formule', regle: 't', onglet: 'CA', adresse: 'O4' }],
    });
  });

  it('refuse que deux règles écrivent la même cellule, en le signalant une seule fois', () => {
    const regle: Regle = {
      id: 'bis',
      type: 'total',
      source: 'ventes',
      montant: { plus: 'HT' },
      cible: { onglet: 'CA', adresse: 'C4' },
    };
    const deux = new Map([
      [
        'ventes',
        ventes([
          ['2026-01-05', 'AF1', 10, ''],
          ['2026-01-06', 'AF1', 10, ''],
        ]),
      ],
    ]);
    expect(calculerRemplissage(modele([CA, regle]), deux, CIBLE_CA)).toEqual({
      ok: false,
      erreurs: [{ nature: 'cible-en-double', regle: 'bis', onglet: 'CA', adresse: 'C4' }],
    });
  });
});
