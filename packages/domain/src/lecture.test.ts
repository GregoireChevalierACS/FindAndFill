import { describe, expect, it } from 'vitest';
import { texteCellule } from './classeur.js';
import {
  COLONNE_MAX,
  ecrireAdresse,
  lettresColonne,
  lireAdresse,
  numeroColonne,
} from './colonnes.js';
import { anneeDe, lireDate, moisDe } from './dates.js';
import { montantDeCellule } from './montant.js';

describe('texteCellule', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['  Code   affaire ', 'Code affaire'],
    ['a b', 'a b'],
    [12.5, '12.5'],
    [0, '0'],
  ])('%j → %j', (valeur, attendu) => {
    expect(texteCellule(valeur)).toBe(attendu);
  });
});

describe('colonnes', () => {
  it.each([
    ['A', 1],
    ['Z', 26],
    ['AA', 27],
    ['AZ', 52],
    ['BA', 53],
    ['ZZ', 702],
    ['AAA', 703],
    ['XFD', COLONNE_MAX],
  ])('%s ↔ %i', (lettres, numero) => {
    expect(numeroColonne(lettres)).toBe(numero);
    expect(lettresColonne(numero)).toBe(lettres);
  });

  it.each(['', 'a', 'A1', 'AAAA', 'XFE', 'ZZZ'])('refuse la colonne « %s »', (lettres) => {
    expect(() => numeroColonne(lettres)).toThrow(`Colonne invalide : « ${lettres} »`);
  });

  it.each([0, -1, 1.5, COLONNE_MAX + 1])('refuse le numéro %s', (numero) => {
    expect(() => lettresColonne(numero)).toThrow(`Numéro de colonne invalide : ${numero}`);
  });

  it('lit et écrit une adresse', () => {
    expect(lireAdresse('C12')).toEqual({ colonne: 3, ligne: 12 });
    expect(lireAdresse('XFD1048576')).toEqual({ colonne: COLONNE_MAX, ligne: 1048576 });
    expect(ecrireAdresse({ colonne: 28, ligne: 4 })).toBe('AB4');
  });

  it.each(['', 'C', '12', 'C0', 'c12', 'C12 ', '$C$12', 'C12345678'])(
    'refuse l’adresse « %s »',
    (adresse) => {
      expect(() => lireAdresse(adresse)).toThrow(`Adresse invalide : « ${adresse} »`);
    },
  );
});

describe('lireDate', () => {
  it.each([
    ['2026-03-04', '2026-03-04'],
    ['2026-03-04T00:00:00.000Z', '2026-03-04'],
    ['2026-03-04 12:30:00', '2026-03-04'],
    ['04/03/2026', '2026-03-04'],
    ['4/3/2026', '2026-03-04'],
    ['04.03.2026', '2026-03-04'],
    ['04-03-2026', '2026-03-04'],
    ['20260304', '2026-03-04'],
    [' 20261231 ', '2026-12-31'],
    ['29/02/2024', '2024-02-29'],
    ['29/02/2000', '2000-02-29'],
    ['01/01/2026', '2026-01-01'],
  ])('lit %j', (texte, attendu) => {
    expect(lireDate(texte)).toBe(attendu);
  });

  it.each([
    null,
    '',
    'demain',
    45000,
    '2026-13-01',
    '2026-00-10',
    '2026-02-29',
    '29/02/1900',
    '32/01/2026',
    '00/01/2026',
    '31/04/2026',
    '2026/03/04',
    '20261301',
    'x2026-03-04',
  ])('refuse %j', (valeur) => {
    expect(lireDate(valeur)).toBeNull();
  });

  it('extrait le mois et l’année', () => {
    expect(moisDe('2026-11-30')).toBe(11);
    expect(anneeDe('2026-11-30')).toBe(2026);
  });
});

describe('montantDeCellule', () => {
  it.each([
    [1234.56, 123456],
    [0.1 + 0.2, 30],
    [-12.5, -1250],
    [-0.001, 0],
    [null, 0],
    ['', 0],
    ['   ', 0],
    ['1 234,56', 123456],
    ['-7', -700],
  ])('%j → %i centimes', (valeur, attendu) => {
    expect(Object.is(montantDeCellule(valeur), attendu)).toBe(true);
  });

  it.each(['abc', '12 €', Number.NaN, Number.POSITIVE_INFINITY, 1e300])('refuse %j', (valeur) => {
    expect(montantDeCellule(valeur)).toBeNull();
  });
});
