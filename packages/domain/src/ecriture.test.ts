import { describe, expect, it } from 'vitest';
import { controlerEquilibre, type LigneEcriture } from './ecriture.js';
import { centimes } from './montant.js';

function ligne(compte: string, debit: number, credit: number): LigneEcriture {
  return { compte, debit: centimes(debit), credit: centimes(credit) };
}

describe('controlerEquilibre', () => {
  it('valide une écriture dont débits et crédits sont égaux', () => {
    const lignes = [ligne('607000', 10000, 0), ligne('445660', 2000, 0), ligne('401000', 0, 12000)];
    expect(controlerEquilibre(lignes)).toEqual({ equilibree: true });
  });

  it('signale un écart positif quand les débits dépassent les crédits', () => {
    const lignes = [ligne('607000', 10000, 0), ligne('401000', 0, 9999)];
    expect(controlerEquilibre(lignes)).toEqual({ equilibree: false, ecart: 1 });
  });

  it('signale un écart négatif quand les crédits dépassent les débits', () => {
    const lignes = [ligne('607000', 100, 0), ligne('401000', 0, 250)];
    expect(controlerEquilibre(lignes)).toEqual({ equilibree: false, ecart: -150 });
  });

  it('considère une écriture vide comme équilibrée', () => {
    expect(controlerEquilibre([])).toEqual({ equilibree: true });
  });
});
