import { lirePdfParZones, type ModeleDeLecturePdf } from '@findandfill/domain';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { coefficients, lecteurPdf, lirePdfTexte } from './pdf-texte.js';

type Dessin = (document: PDFKit.PDFDocument) => void;

/** Un PDF produit par pdfkit : positions en points, depuis le haut de la page. */
function unPdf(dessin: Dessin): Promise<Uint8Array> {
  const document = new PDFDocument({ size: 'A4', margin: 50 });
  const morceaux: Buffer[] = [];
  document.on('data', (morceau: Buffer) => morceaux.push(morceau));
  return new Promise((resolve) => {
    document.on('end', () => {
      resolve(new Uint8Array(Buffer.concat(morceaux)));
    });
    dessin(document);
    document.end();
  });
}

const facture: Dessin = (document) => {
  document.font('Helvetica').fontSize(10);
  document.text('Chauffage Services SARL', 300, 50);
  document.text('compta@chauffage.test', 300, 62);
  document.font('Helvetica-Bold').fontSize(18).text('FACTURE', 50, 100);
  document.font('Helvetica').fontSize(10);
  document.text('N° : F-2027-0042', 50, 130);
  document.text('Total TTC', 350, 500, { width: 100, align: 'right' });
  document.text('1 200,00 €', 460, 500, { width: 85, align: 'right' });
};

// Positions relevées par pdf.js : quelques points au-dessus de celles données à pdfkit.
const MODELE: ModeleDeLecturePdf = {
  tolerance: 5,
  ancres: [
    { id: 'titre', texte: 'FACTURE', position: { page: 1, x: 50, y: 95 } },
    { id: 'numero', texte: 'N°', position: { page: 1, x: 50, y: 127 } },
    { id: 'ttc', texte: 'Total TTC', position: { page: 1, x: 407, y: 497 } },
  ],
  champs: {
    numero: { zone: { nature: 'apres-ancre', ancre: 'numero' }, type: 'texte' },
    totalTtc: { zone: { nature: 'apres-ancre', ancre: 'ttc' }, type: 'montant' },
    courriel: {
      zone: {
        nature: 'rectangle',
        rectangle: { page: 1, x: 290, y: 40, largeur: 250, hauteur: 40 },
        ligne: -1,
      },
      type: 'texte',
    },
  },
};

describe('lirePdfTexte', () => {
  it('donne chaque ligne avec sa position, depuis le haut de la page', async () => {
    const { pages, fragments } = await lirePdfTexte(await unPdf(facture));
    expect(pages).toBe(1);
    expect(fragments.map((f) => f.texte)).toEqual([
      'Chauffage Services SARL',
      'compta@chauffage.test',
      'FACTURE',
      'N° : F-2027-0042',
      'Total TTC',
      '1 200,00 €',
    ]);
    const titre = fragments.find((f) => f.texte === 'FACTURE');
    expect(titre).toMatchObject({ page: 1, x: 50, hauteur: 18 });
    // pdfkit place le haut de la ligne, pdf.js la ligne de base : quelques points d'écart.
    expect(titre?.y).toBeGreaterThan(90);
    expect(titre?.y).toBeLessThan(105);
    expect(titre?.largeur).toBeGreaterThan(50);
  });

  it('numérote les pages à partir de 1', async () => {
    const { pages, fragments } = await lirePdfTexte(
      await unPdf((document) => {
        document.text('Première', 50, 50);
        document.addPage().text('Seconde', 50, 50);
      }),
    );
    expect(pages).toBe(2);
    expect(fragments.map(({ page, texte }) => [page, texte])).toEqual([
      [1, 'Première'],
      [2, 'Seconde'],
    ]);
  });

  it('ne trouve aucun fragment dans un PDF sans texte, comme un PDF scanné', async () => {
    const scanne = await unPdf((document) => {
      document.rect(50, 50, 200, 100).fill('#888');
    });
    expect(await lirePdfTexte(scanne)).toEqual({ pages: 1, fragments: [] });
  });

  it('laisse intact le tableau d’octets reçu', async () => {
    const octets = await unPdf(facture);
    const copie = octets.slice();
    await lirePdfTexte(octets);
    expect(octets).toEqual(copie);
  });
});

describe('coefficients', () => {
  it('garde une matrice de nombres telle quelle', () => {
    expect(coefficients([2, 3, 4, 5, 6, 7])).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('remplace un coefficient manquant par celui de l’identité, un autre type par 0', () => {
    expect(coefficients([])).toEqual([1, 0, 0, 1, 0, 0]);
    expect(coefficients(['x', null, 4])).toEqual([0, 0, 4, 1, 0, 0]);
  });
});

describe('lecteurPdf', () => {
  it('lit les champs d’un PDF texte avec un modèle de zones', async () => {
    const texte = await lecteurPdf.lire({ nom: 'facture.pdf', octets: await unPdf(facture) });
    const resultat = lirePdfParZones(texte, MODELE);
    expect(resultat).toMatchObject({
      ok: true,
      champs: {
        numero: { valeur: 'F-2027-0042' },
        totalTtc: { valeur: 120000 },
        courriel: { valeur: 'compta@chauffage.test' },
      },
    });
  });

  it('refuse un fichier qui n’est pas un PDF, en le nommant', async () => {
    await expect(
      lecteurPdf.lire({ nom: 'faux.pdf', octets: new TextEncoder().encode('pas un PDF') }),
    ).rejects.toThrow(/^PDF illisible : « faux\.pdf » \(.+\)\.$/);
  });
});
