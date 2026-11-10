import { describe, expect, it } from 'vitest';
import { additionner, centimes, lireMontant } from './montant.js';

describe('centimes', () => {
  it('accepte un entier', () => {
    expect(centimes(12345)).toBe(12345);
    expect(centimes(-1)).toBe(-1);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuse %s',
    (valeur) => {
      expect(() => centimes(valeur)).toThrow(
        new RangeError(
          `Montant invalide : ${String(valeur)} n'est pas un nombre entier de centimes.`,
        ),
      );
    },
  );
});

describe('additionner', () => {
  it('additionne des montants', () => {
    expect(additionner([centimes(10), centimes(20), centimes(-5)])).toBe(25);
  });

  it('vaut zéro pour une liste vide', () => {
    expect(additionner([])).toBe(0);
  });

  it('refuse un total hors des entiers sûrs', () => {
    expect(() => additionner([centimes(Number.MAX_SAFE_INTEGER), centimes(1)])).toThrow(RangeError);
  });
});

describe('lireMontant', () => {
  it.each([
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['1 234,56', 123456],
    ['1 234,56', 123456],
    ['1 234,56', 123456],
    ['  42  ', 4200],
    ['12,5', 1250],
    ['0,05', 5],
    ['+7', 700],
    ['-12,50', -1250],
    ['-0', 0],
  ])('lit « %s » comme %i centimes', (texte, attendu) => {
    expect(Object.is(lireMontant(texte), attendu)).toBe(true);
  });

  it.each(['', 'abc', '12,345', '1,2,3', '12,', ',5', '--1', '1e3', '12 €', 'x12', '12x'])(
    'refuse « %s »',
    (texte) => {
      expect(lireMontant(texte)).toBeNull();
    },
  );

  it('refuse un montant trop grand pour être exact', () => {
    expect(lireMontant('90071992547409,92')).toBeNull();
  });

  it('accepte le plus grand montant exact', () => {
    expect(lireMontant('90071992547409,91')).toBe(Number.MAX_SAFE_INTEGER);
  });
});
