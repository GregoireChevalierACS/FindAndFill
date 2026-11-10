import { describe, expect, it } from 'vitest';
import { creerAlea } from './alea.js';
import {
  ajouterJours,
  anneeDe,
  dateIso,
  moisDe,
  versDate,
  versFec,
  versFrancais,
} from './dates.js';
import { adresse, enEuros, lettreColonne, montantTexte } from './format.js';

describe('creerAlea', () => {
  it('donne la même suite pour la même graine', () => {
    const a = creerAlea(42);
    const b = creerAlea(42);
    expect(Array.from({ length: 5 }, () => a.suivant())).toEqual(
      Array.from({ length: 5 }, () => b.suivant()),
    );
  });

  it('donne une autre suite pour une autre graine', () => {
    expect(creerAlea(1).suivant()).not.toBe(creerAlea(2).suivant());
  });

  it('reste dans [0, 1[ et dans les bornes entières demandées', () => {
    const alea = creerAlea(7);
    for (let i = 0; i < 1000; i++) {
      const x = alea.suivant();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = alea.entier(-3, 3);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('atteint les deux bornes', () => {
    const alea = creerAlea(3);
    const vus = new Set(Array.from({ length: 200 }, () => alea.entier(1, 3)));
    expect([...vus].sort()).toEqual([1, 2, 3]);
  });

  it.each([
    [2, 1],
    [1.5, 2],
    [0, Number.NaN],
  ])('refuse les bornes [%s, %s]', (min, max) => {
    expect(() => creerAlea(1).entier(min, max)).toThrow(RangeError);
  });

  it('choisit dans la liste et refuse une liste vide', () => {
    const alea = creerAlea(5);
    expect(['a', 'b']).toContain(alea.choisir(['a', 'b']));
    expect(() => alea.choisir([])).toThrow('liste vide');
  });

  it('respecte les probabilités extrêmes', () => {
    const alea = creerAlea(9);
    expect(alea.chance(0)).toBe(false);
    expect(alea.chance(1)).toBe(true);
  });
});

describe('dates', () => {
  it('construit et décale des dates sans fuseau horaire', () => {
    expect(dateIso(2026, 2, 28)).toBe('2026-02-28');
    expect(ajouterJours('2026-02-28', 1)).toBe('2026-03-01');
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('extrait le mois et l’année', () => {
    expect(moisDe('2026-11-30')).toBe(11);
    expect(anneeDe('2026-11-30')).toBe(2026);
  });

  it('convertit vers les formats utilisés', () => {
    expect(versDate('2026-03-04').toISOString()).toBe('2026-03-04T00:00:00.000Z');
    expect(versFec('2026-03-04')).toBe('20260304');
    expect(versFrancais('2026-03-04')).toBe('04/03/2026');
  });

  it('refuse une date mal formée', () => {
    expect(() => moisDe('04/03/2026')).toThrow('Date invalide');
  });
});

describe('format', () => {
  it('convertit les centimes en euros', () => {
    expect(enEuros(123456)).toBe(1234.56);
  });

  it.each([
    [0, '', '0,00'],
    [5, '', '0,05'],
    [123456, '', '1234,56'],
    [123456, ' ', '1 234,56'],
    [123456789, ' ', '1 234 567,89'],
    [-100050, ' ', '-1 000,50'],
  ])('écrit %i centimes « %s » → %s', (centimes, separateur, attendu) => {
    expect(montantTexte(centimes, separateur)).toBe(attendu);
  });

  it.each([
    [1, 'A'],
    [26, 'Z'],
    [27, 'AA'],
    [52, 'AZ'],
    [703, 'AAA'],
  ])('numérote la colonne %i en %s', (numero, lettres) => {
    expect(lettreColonne(numero)).toBe(lettres);
  });

  it('refuse un numéro de colonne invalide', () => {
    expect(() => lettreColonne(0)).toThrow(RangeError);
    expect(() => lettreColonne(1.5)).toThrow(RangeError);
  });

  it('compose une adresse', () => {
    expect(adresse(3, 12)).toBe('C12');
  });
});
