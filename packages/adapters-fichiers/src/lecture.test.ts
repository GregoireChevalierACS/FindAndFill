import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { lecteurSources, lireXlsx, valeurExcel } from './lecteur-sources.js';
import { decoderTexte, decouper, detecterSeparateur, lireTexteDelimite } from './texte-delimite.js';
import { decoderEntites, elements, lireAttributs, texteDesRuns } from './xml.js';

const octets = (texte: string) => new TextEncoder().encode(texte);

describe('texte délimité', () => {
  it('décode l’UTF-8 avec ou sans BOM, sinon le Windows-1252', () => {
    expect(decoderTexte(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
    expect(decoderTexte(octets('Libellé'))).toBe('Libellé');
    expect(decoderTexte(new Uint8Array([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9, 0x80]))).toBe(
      'Libellé€',
    );
  });

  it.each([
    ['a;b;c\n1,5;2;3', ';'],
    ['a\tb\tc', '\t'],
    ['a|b|c', '|'],
    ['a,b,c', ','],
    ['"a;b",c', ','],
    ['a;b,c', ';'],
    ['a\tb;c', ';'],
    ['seul', ';'],
    ['a,b\r\nc;d;e;f', ','],
  ])('détecte le séparateur de %j', (texte, separateur) => {
    expect(detecterSeparateur(texte)).toBe(separateur);
  });

  it('découpe guillemets, guillemets doublés et retours à la ligne', () => {
    expect(decouper('a;"b;c";"d ""e"""\r\n"f\ng";;\rh\n', ';')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['f\ng', '', ''],
      ['h'],
    ]);
  });

  it('garde une dernière ligne sans fin de ligne, et rien pour un texte vide', () => {
    expect(decouper('a;b\nc', ';')).toEqual([['a', 'b'], ['c']]);
    expect(decouper('a;', ';')).toEqual([['a', '']]);
    expect(decouper('', ';')).toEqual([]);
  });

  it('lit un CSV en classeur à une feuille, les champs vides valant null', () => {
    expect(lireTexteDelimite(octets('﻿Date;Montant\r\n04/01/2026;\r\n'))).toEqual({
      feuilles: [
        {
          nom: '',
          lignes: [
            ['Date', 'Montant'],
            ['04/01/2026', null],
          ],
        },
      ],
    });
  });
});

describe('valeurExcel', () => {
  it.each([
    [null, null],
    [undefined, null],
    [12.5, 12.5],
    ['texte', 'texte'],
    [true, 'VRAI'],
    [false, 'FAUX'],
    [new Date(Date.UTC(2026, 2, 4)), '2026-03-04'],
    [{ richText: [{ text: 'a' }, { text: 'b' }] }, 'ab'],
    [{ error: '#N/A' }, '#N/A'],
    [{ formula: 'A1*2', result: 4 }, 4],
    [{ formula: 'A1', result: undefined }, null],
    [{ sharedFormula: 'A1', result: 'x' }, 'x'],
    [{ text: 'site', hyperlink: 'https://exemple.fr' }, 'site'],
    [{ text: { richText: [{ text: 'lien' }] }, hyperlink: 'https://exemple.fr' }, 'lien'],
    [{ autre: 1 }, null],
  ])('%j → %j', (valeur, attendu) => {
    expect(valeurExcel(valeur as ExcelJS.CellValue)).toEqual(attendu);
  });
});

describe('lecteurSources', () => {
  async function classeurExcel(): Promise<Uint8Array> {
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet('Ventes');
    feuille.getCell('A1').value = 'Titre';
    feuille.getCell('A3').value = 'Date';
    feuille.getCell('C3').value = 'Montant';
    feuille.getCell('A4').value = new Date(Date.UTC(2026, 0, 5));
    feuille.getCell('C4').value = { formula: '1+1', result: 2 };
    classeur.addWorksheet('Vide');
    return new Uint8Array(await classeur.xlsx.writeBuffer());
  }

  it('lit un classeur Excel avec ses lignes et colonnes vides', async () => {
    expect(await lireXlsx(await classeurExcel())).toEqual({
      feuilles: [
        {
          nom: 'Ventes',
          lignes: [['Titre'], [], ['Date', null, 'Montant'], ['2026-01-05', null, 2]],
        },
        { nom: 'Vide', lignes: [] },
      ],
    });
  });

  it('choisit le lecteur selon l’extension', async () => {
    const excel = await classeurExcel();
    expect((await lecteurSources.lire({ nom: 'v.XLSM', octets: excel })).feuilles).toHaveLength(2);
    expect(await lecteurSources.lire({ nom: 'fec.txt', octets: octets('A\tB') })).toEqual({
      feuilles: [{ nom: '', lignes: [['A', 'B']] }],
    });
    await expect(lecteurSources.lire({ nom: 'ventes.pdf', octets: excel })).rejects.toThrow(
      'Format non pris en charge : « ventes.pdf »',
    );
  });
});

describe('xml', () => {
  it('lit les attributs entre guillemets ou apostrophes, entités décodées', () => {
    expect(lireAttributs(` r="A1" s='3' x:id = "a&amp;b" vide=""`)).toEqual(
      new Map([
        ['r', 'A1'],
        ['s', '3'],
        ['x:id', 'a&b'],
        ['vide', ''],
      ]),
    );
  });

  it('décode les entités nommées et numériques', () => {
    expect(decoderEntites('&lt;a&gt; &quot;&apos;&amp;amp; &#233;&#xE9; &nbsp;')).toBe(
      `<a> "'&amp; éé &nbsp;`,
    );
  });

  it('assemble le texte enrichi sans la phonétique', () => {
    expect(
      texteDesRuns(
        '<r><t>Chiffre</t></r><r><t xml:space="preserve"> d&apos;affaires</t></r><rPh><t>x</t></rPh><t/>',
      ),
    ).toBe("Chiffre d'affaires");
  });

  it('extrait les éléments vides ou non', () => {
    expect(elements('<row r="1"/><row r="2"><c/></row><rows/>', 'row')).toEqual([
      { attributs: ' r="1"', contenu: null },
      { attributs: ' r="2"', contenu: '<c/>' },
    ]);
  });
});
