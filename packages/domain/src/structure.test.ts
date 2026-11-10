import { describe, expect, it } from 'vitest';
import type { Classeur, ValeurCellule } from './classeur.js';
import { LIGNES_EXPLOREES, repererTableau } from './structure.js';

const ENTETES = ['Date', 'Affaire', 'Montant'];

function classeur(nom: string, lignes: ValeurCellule[][]): Classeur {
  return {
    feuilles: [
      { nom: 'Autre', lignes: [] },
      { nom, lignes },
    ],
  };
}

describe('repererTableau', () => {
  it('trouve les en-têtes sous un titre et des lignes vides', () => {
    const resultat = repererTableau(
      classeur('Ventes', [['Export des ventes'], [], [' Date ', 'Affaire', 'Montant', null, '']]),
      { onglet: 'Ventes', entetes: ENTETES },
    );
    expect(resultat).toEqual({
      ok: true,
      tableau: {
        feuille: expect.objectContaining({ nom: 'Ventes' }) as unknown,
        ligneEntetes: 2,
        colonnes: new Map([
          ['Date', 0],
          ['Affaire', 1],
          ['Montant', 2],
        ]),
      },
    });
  });

  it('prend la première feuille quand aucun onglet n’est fixé (CSV, FEC)', () => {
    const resultat = repererTableau(
      { feuilles: [{ nom: '', lignes: [ENTETES] }] },
      { entetes: ENTETES },
    );
    expect(resultat.ok).toBe(true);
  });

  it('accepte des en-têtes numériques', () => {
    const resultat = repererTableau(
      { feuilles: [{ nom: '', lignes: [['Code', 2026]] }] },
      { entetes: ['Code', '2026'] },
    );
    expect(resultat.ok).toBe(true);
  });

  it('ne cherche pas au-delà de la limite de lignes explorées', () => {
    const vides: ValeurCellule[][] = Array.from({ length: LIGNES_EXPLOREES }, () => []);
    expect(
      repererTableau(classeur('V', [...vides.slice(1), ENTETES]), { onglet: 'V', entetes: ENTETES })
        .ok,
    ).toBe(true);
    expect(
      repererTableau(classeur('V', [...vides, ENTETES]), { onglet: 'V', entetes: ENTETES }),
    ).toEqual({
      ok: false,
      changements: [{ nature: 'entetes-introuvables' }],
    });
  });

  it('signale un onglet renommé avec la liste des onglets disponibles', () => {
    expect(
      repererTableau(classeur('Carnet', [ENTETES]), { onglet: 'Commandes', entetes: ENTETES }),
    ).toEqual({
      ok: false,
      changements: [
        {
          nature: 'onglet-introuvable',
          onglet: 'Commandes',
          ongletsDisponibles: ['Autre', 'Carnet'],
        },
      ],
    });
  });

  it('signale un classeur vide', () => {
    expect(repererTableau({ feuilles: [] }, { entetes: ENTETES })).toEqual({
      ok: false,
      changements: [{ nature: 'onglet-introuvable', onglet: '', ongletsDisponibles: [] }],
    });
  });

  it('signale une colonne ajoutée sans la confondre avec un déplacement', () => {
    expect(
      repererTableau(classeur('V', [['Titre'], ['Date', 'Commercial', 'Affaire', 'Montant']]), {
        onglet: 'V',
        entetes: ENTETES,
      }),
    ).toEqual({
      ok: false,
      changements: [{ nature: 'colonnes-ajoutees', colonnes: ['Commercial'] }],
    });
  });

  it('signale une colonne supprimée', () => {
    expect(
      repererTableau(classeur('V', [['Date', 'Montant']]), { onglet: 'V', entetes: ENTETES }),
    ).toEqual({
      ok: false,
      changements: [{ nature: 'colonnes-supprimees', colonnes: ['Affaire'] }],
    });
  });

  it('signale des colonnes déplacées', () => {
    expect(
      repererTableau(classeur('V', [['Montant', 'Date', 'Affaire']]), {
        onglet: 'V',
        entetes: ENTETES,
      }),
    ).toEqual({
      ok: false,
      changements: [{ nature: 'colonnes-deplacees', colonnes: ['Date', 'Affaire', 'Montant'] }],
    });
  });

  it('signale un ajout et un déplacement simultanés', () => {
    expect(
      repererTableau(classeur('V', [['Affaire', 'Date', 'Montant', 'TVA']]), {
        onglet: 'V',
        entetes: ENTETES,
      }),
    ).toEqual({
      ok: false,
      changements: [
        { nature: 'colonnes-ajoutees', colonnes: ['TVA'] },
        { nature: 'colonnes-deplacees', colonnes: ['Date', 'Affaire'] },
      ],
    });
  });

  it('signale une suppression et un ajout simultanés', () => {
    expect(
      repererTableau(classeur('V', [['Date', 'Client', 'Montant']]), {
        onglet: 'V',
        entetes: ENTETES,
      }),
    ).toEqual({
      ok: false,
      changements: [
        { nature: 'colonnes-ajoutees', colonnes: ['Client'] },
        { nature: 'colonnes-supprimees', colonnes: ['Affaire'] },
      ],
    });
  });

  it('considère une colonne vide insérée comme un décalage', () => {
    expect(
      repererTableau(classeur('V', [['Date', null, 'Affaire', 'Montant']]), {
        onglet: 'V',
        entetes: ENTETES,
      }),
    ).toEqual({
      ok: false,
      changements: [{ nature: 'colonnes-deplacees', colonnes: ['Affaire', 'Montant'] }],
    });
  });

  it('retient la ligne la plus ressemblante, la première en cas d’égalité', () => {
    const resultat = repererTableau(
      classeur('V', [
        ['Date', 'X'],
        ['Date', 'Affaire', 'Y'],
        ['Date', 'Affaire', 'Z'],
      ]),
      { onglet: 'V', entetes: ENTETES },
    );
    expect(resultat).toEqual({
      ok: false,
      changements: [
        { nature: 'colonnes-ajoutees', colonnes: ['Y'] },
        { nature: 'colonnes-supprimees', colonnes: ['Montant'] },
      ],
    });
  });

  it('ne devine pas face à des en-têtes en double', () => {
    expect(
      repererTableau(classeur('V', [['Date', 'Date']]), { onglet: 'V', entetes: ['Date'] }),
    ).toEqual({
      ok: false,
      changements: [{ nature: 'entetes-introuvables' }],
    });
  });
});
