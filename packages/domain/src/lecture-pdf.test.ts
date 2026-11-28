import { describe, expect, it } from 'vitest';
import {
  lirePdfParZones,
  verifierModeleDeLecturePdf,
  type ChampPdf,
  type FragmentDeTexte,
  type ModeleDeLecturePdf,
  type TexteDuPdf,
} from './lecture-pdf.js';

const fragment = (
  texte: string,
  x: number,
  y: number,
  { page = 1, largeur = 60, hauteur = 10 }: Partial<FragmentDeTexte> = {},
): FragmentDeTexte => ({ page, x, y, largeur, hauteur, texte });

const pdf = (...fragments: FragmentDeTexte[]): TexteDuPdf => ({ pages: 2, fragments });

/** Une facture fournisseur : le fournisseur à droite, les références et les totaux en dessous. */
const FACTURE = [
  fragment('FACTURE', 50, 100, { hauteur: 18 }),
  fragment('Chauffage Services SARL ', 300, 50, { largeur: 120 }),
  fragment('8 avenue du Port', 300, 62, { largeur: 90 }),
  fragment('compta@chauffage.test', 300, 74, { largeur: 110 }),
  fragment('N° : F-2027-0042', 50, 130, { largeur: 80 }),
  fragment('Date : 15/03/2027', 50, 145, { largeur: 80 }),
  fragment('Délai : 30 jours', 50, 160, { largeur: 80 }),
  fragment('Total HT', 400, 500, { largeur: 40 }),
  fragment('1 000,00 €', 490, 500, { largeur: 50 }),
  fragment('Total HT', 450, 200, { largeur: 40 }),
  fragment('Total TTC', 400, 518, { largeur: 45 }),
  fragment('1 200,00 €', 490, 518, { largeur: 50 }),
];

const ANCRES: ModeleDeLecturePdf['ancres'] = [
  { id: 'titre', texte: 'FACTURE', position: { page: 1, x: 50, y: 100 } },
  { id: 'numero', texte: 'N°', position: { page: 1, x: 50, y: 130 } },
  { id: 'date', texte: 'Date', position: { page: 1, x: 50, y: 145 } },
  { id: 'delai', texte: 'Délai', position: { page: 1, x: 50, y: 160 } },
  { id: 'ht', texte: 'Total HT', position: { page: 1, x: 400, y: 500 } },
  { id: 'ttc', texte: 'Total TTC', position: { page: 1, x: 400, y: 518 } },
];

const apres = (ancre: string, type: ChampPdf['type'] = 'texte'): ChampPdf => ({
  zone: { nature: 'apres-ancre', ancre },
  type,
});

const FOURNISSEUR = { page: 1, x: 290, y: 45, largeur: 250, hauteur: 45 };

const MODELE: ModeleDeLecturePdf = {
  tolerance: 10,
  ancres: ANCRES,
  champs: {
    fournisseur: { zone: { nature: 'rectangle', rectangle: FOURNISSEUR, ligne: 0 }, type: 'texte' },
    courriel: { zone: { nature: 'rectangle', rectangle: FOURNISSEUR, ligne: -1 }, type: 'texte' },
    numero: apres('numero'),
    date: apres('date', 'date'),
    delai: apres('delai', 'entier'),
    totalHt: apres('ht', 'montant'),
    totalTtc: apres('ttc', 'montant'),
  },
};

const unChamp = (champ: ChampPdf, ...fragments: FragmentDeTexte[]) =>
  lirePdfParZones(pdf(...FACTURE, ...fragments), {
    ...MODELE,
    champs: { champ },
  });

describe('lirePdfParZones', () => {
  it('lit chaque champ et le convertit selon son type', () => {
    const resultat = lirePdfParZones(pdf(...FACTURE), MODELE);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const valeurs = Object.fromEntries(
      Object.entries(resultat.champs).map(([nom, champ]) => [nom, champ.valeur]),
    );
    expect(valeurs).toEqual({
      fournisseur: 'Chauffage Services SARL',
      courriel: 'compta@chauffage.test',
      numero: 'F-2027-0042',
      date: '2027-03-15',
      delai: 30,
      totalHt: 100000,
      totalTtc: 120000,
    });
    expect(resultat.champs['totalTtc']).toMatchObject({ type: 'montant', texte: '1 200,00 €' });
  });

  it('garde l’origine de chaque valeur : l’ancre et les fragments lus', () => {
    const resultat = lirePdfParZones(pdf(...FACTURE), MODELE);
    if (!resultat.ok) throw new Error('lecture refusée');
    expect(resultat.champs['totalTtc']?.fragments.map((f) => f.texte)).toEqual([
      'Total TTC',
      '1 200,00 €',
    ]);
    expect(resultat.champs['courriel']?.fragments).toEqual([FACTURE[3]]);
  });

  it('prend l’ancre la plus proche quand son libellé figure plusieurs fois', () => {
    // « Total HT » est aussi l'en-tête d'une colonne, plus haut : sa ligne n'a pas de montant.
    const resultat = unChamp(apres('ht', 'montant'));
    expect(resultat).toMatchObject({ ok: true, champs: { champ: { valeur: 100000 } } });
  });

  it('à égalité de distance, prend la première ancre du texte', () => {
    const egales = [
      fragment('Total HT', 400, 495, { largeur: 40 }),
      fragment('1,00', 490, 495),
      fragment('Total HT', 400, 505, { largeur: 40 }),
      fragment('2,00', 490, 505),
    ];
    const resultat = lirePdfParZones(pdf(...FACTURE.filter((f) => f.y !== 500), ...egales), {
      ...MODELE,
      champs: { ht: apres('ht', 'montant') },
    });
    expect(resultat).toMatchObject({ ok: true, champs: { ht: { valeur: 100 } } });
  });

  describe('mise en page', () => {
    it('refuse un PDF sans texte, comme un PDF scanné', () => {
      expect(lirePdfParZones(pdf(), MODELE)).toEqual({
        ok: false,
        changements: [{ nature: 'aucun-texte' }],
        erreurs: [],
      });
    });

    it('refuse une mise en page dont une ancre a été renommée, sans rien lire', () => {
      const renommee = FACTURE.map((f) =>
        f.texte === 'Total TTC' ? { ...f, texte: 'Montant TTC' } : f,
      );
      expect(lirePdfParZones(pdf(...renommee), MODELE)).toEqual({
        ok: false,
        changements: [{ nature: 'ancre-introuvable', ancre: 'ttc', texte: 'Total TTC' }],
        erreurs: [],
      });
    });

    it.each([
      ['un mot plus long', 'Dates : 15/03/2027'],
      ['un libellé collé', 'Date15/03/2027'],
      ['un libellé ailleurs dans le texte', 'La Date : 15/03/2027'],
    ])('ne prend pas pour l’ancre %s', (_cas, texte) => {
      const sansDate = FACTURE.map((f) => (f.texte.startsWith('Date') ? { ...f, texte } : f));
      expect(lirePdfParZones(pdf(...sansDate), MODELE)).toMatchObject({
        ok: false,
        changements: [{ nature: 'ancre-introuvable', ancre: 'date' }],
      });
    });

    it('reconnaît l’ancre seule, ou entourée d’espaces', () => {
      const seule = FACTURE.map((f) =>
        f.texte.startsWith('Date') ? { ...f, texte: '  Date ' } : f,
      );
      expect(
        lirePdfParZones(pdf(...seule, fragment('15/03/2027', 130, 145)), {
          ...MODELE,
          champs: { date: apres('date', 'date') },
        }),
      ).toMatchObject({ ok: true, champs: { date: { valeur: '2027-03-15' } } });
    });

    it.each([
      ['à droite', { x: 60, y: 100 }, true],
      ['à gauche', { x: 40, y: 100 }, true],
      ['plus bas', { x: 50, y: 110 }, true],
      ['plus haut', { x: 50, y: 90 }, true],
      ['trop à droite', { x: 61, y: 100 }, false],
      ['trop bas', { x: 50, y: 111 }, false],
      ['trop haut', { x: 50, y: 89 }, false],
      ['trop à gauche', { x: 39, y: 100 }, false],
    ])('admet une ancre décalée %s dans la tolérance (%j)', (_cas, position, admise) => {
      const decalee = FACTURE.map((f) => (f.texte === 'FACTURE' ? { ...f, ...position } : f));
      const resultat = lirePdfParZones(pdf(...decalee), MODELE);
      expect(resultat.ok).toBe(admise);
      if (!admise) {
        expect(resultat).toEqual({
          ok: false,
          changements: [
            {
              nature: 'ancre-deplacee',
              ancre: 'titre',
              texte: 'FACTURE',
              attendue: { page: 1, x: 50, y: 100 },
              trouvee: { page: 1, ...position },
            },
          ],
          erreurs: [],
        });
      }
    });

    it('admet, pour une ancre, sa propre tolérance à la place de celle du modèle', () => {
      const plusBas = FACTURE.map((f) =>
        f.texte.startsWith('Total') && f.y > 400 ? { ...f, y: f.y + 100 } : f,
      ).map((f) => (f.texte.endsWith('€') ? { ...f, y: f.y + 100 } : f));
      const tolerant = (tolerance: number): ModeleDeLecturePdf => ({
        ...MODELE,
        ancres: ANCRES.map((ancre) =>
          ancre.id === 'ttc' || ancre.id === 'ht' ? { ...ancre, tolerance } : ancre,
        ),
      });
      expect(lirePdfParZones(pdf(...plusBas), tolerant(100))).toMatchObject({
        ok: true,
        champs: { totalTtc: { valeur: 120000 } },
      });
      expect(lirePdfParZones(pdf(...plusBas), tolerant(99))).toMatchObject({
        ok: false,
        changements: [{ ancre: 'ht' }, { ancre: 'ttc' }],
      });
      // La tolérance propre ne vaut que pour son ancre.
      const titreDecale = FACTURE.map((f) => (f.texte === 'FACTURE' ? { ...f, y: 120 } : f));
      expect(lirePdfParZones(pdf(...titreDecale), tolerant(100))).toMatchObject({
        ok: false,
        changements: [{ ancre: 'titre' }],
      });
    });

    it('signale une ancre passée sur une autre page', () => {
      const ailleurs = FACTURE.map((f) => (f.texte === 'FACTURE' ? { ...f, page: 2 } : f));
      expect(lirePdfParZones(pdf(...ailleurs), MODELE)).toMatchObject({
        ok: false,
        changements: [{ nature: 'ancre-deplacee', trouvee: { page: 2, x: 50, y: 100 } }],
      });
    });

    it('signale chaque changement, comme des blocs échangés', () => {
      const echangee = FACTURE.map((f) =>
        f.texte.startsWith('N°') || f.texte === 'Total TTC' ? { ...f, x: f.x + 200 } : f,
      );
      expect(lirePdfParZones(pdf(...echangee), MODELE)).toMatchObject({
        ok: false,
        changements: [
          { nature: 'ancre-deplacee', ancre: 'numero' },
          { nature: 'ancre-deplacee', ancre: 'ttc' },
        ],
      });
    });
  });

  describe('zone rectangulaire', () => {
    const zone = (ligne?: number): ChampPdf => ({
      zone:
        ligne === undefined
          ? { nature: 'rectangle', rectangle: FOURNISSEUR }
          : { nature: 'rectangle', rectangle: FOURNISSEUR, ligne },
      type: 'texte',
    });

    it('lit les lignes de haut en bas, chacune de gauche à droite', () => {
      const resultat = unChamp(zone(), fragment('SIRET 123', 430, 49.5, { largeur: 50 }));
      expect(resultat).toMatchObject({
        ok: true,
        champs: {
          champ: {
            valeur: 'Chauffage Services SARL SIRET 123\n8 avenue du Port\ncompta@chauffage.test',
          },
        },
      });
    });

    it('rattache un fragment à la ligne s’il commence moins d’une demi-hauteur plus bas', () => {
      const proche = unChamp(zone(0), fragment('(siège)', 430, 54.9, { largeur: 30 }));
      expect(proche).toMatchObject({
        champs: { champ: { valeur: 'Chauffage Services SARL (siège)' } },
      });
      const nouvelle = unChamp(zone(1), fragment('(siège)', 430, 55, { largeur: 30 }));
      expect(nouvelle).toMatchObject({ champs: { champ: { valeur: '(siège)' } } });
    });

    it('ne garde que les fragments dont le centre est dans le rectangle', () => {
      // Rectangle : x de 290 à 540, y de 45 à 90 ; fragments de 10 de large et 10 de haut.
      const petit = { largeur: 10, hauteur: 10 };
      const resultat = unChamp(
        zone(),
        fragment('gauche', 285, 50, petit),
        fragment('dehors-gauche', 284, 80, petit),
        fragment('droite', 535, 60, petit),
        fragment('dehors-droite', 536, 70, petit),
        fragment('haut', 400, 40, petit),
        fragment('dehors-haut', 420, 39, petit),
        fragment('bas', 460, 85, petit),
        fragment('dehors-bas', 480, 86, petit),
        fragment('autre page', 400, 60, { ...petit, page: 2 }),
      );
      if (!resultat.ok) throw new Error('lecture refusée');
      const lu = resultat.champs['champ']?.texte ?? '';
      for (const dedans of ['gauche', 'droite', 'haut', 'bas']) {
        expect(lu.split(/[\n ]/)).toContain(dedans);
      }
      expect(lu).not.toMatch(/dehors|autre page/);
    });

    it('signale une ligne absente comme un champ vide', () => {
      expect(unChamp(zone(3))).toEqual({
        ok: false,
        changements: [],
        erreurs: [{ nature: 'champ-vide', champ: 'champ' }],
      });
      expect(unChamp(zone(-4))).toMatchObject({ erreurs: [{ nature: 'champ-vide' }] });
      expect(unChamp(zone(-3))).toMatchObject({
        champs: { champ: { valeur: 'Chauffage Services SARL' } },
      });
    });
  });

  describe('après une ancre', () => {
    it('lit la suite de la ligne, à droite de l’ancre, dans l’ordre', () => {
      const resultat = unChamp(
        apres('ttc'),
        fragment('(dont TVA)', 600, 518),
        fragment('à gauche', 300, 518),
        fragment('ligne suivante', 490, 523),
        fragment('ligne précédente', 490, 513),
        fragment('juste au-dessus', 560, 513.1),
        fragment('juste au-dessous', 580, 522.9),
        fragment('accolé ', 445, 518, { largeur: 1 }),
        fragment('chevauchant', 444.9, 518, { largeur: 1 }),
        fragment('autre page', 600, 518, { page: 2 }),
      );
      expect(resultat).toMatchObject({
        ok: true,
        champs: {
          champ: { valeur: 'accolé 1 200,00 € juste au-dessus juste au-dessous (dont TVA)' },
        },
      });
    });

    it('ne garde, d’un séparateur, que ce qui précède la valeur', () => {
      const lire = (texte: string) =>
        lirePdfParZones(pdf(...FACTURE, fragment(texte, 50, 300)), {
          ...MODELE,
          ancres: [...ANCRES, { id: 'ref', texte: 'Réf.', position: { page: 1, x: 50, y: 300 } }],
          champs: { ref: apres('ref') },
        });
      expect(lire('Réf./A : 1')).toMatchObject({ champs: { ref: { valeur: '/A : 1' } } });
    });

    it('enlève le séparateur entre le libellé et la valeur', () => {
      const resultat = lirePdfParZones(pdf(...FACTURE, fragment('Réf. :: A-1', 50, 300)), {
        ...MODELE,
        ancres: [...ANCRES, { id: 'ref', texte: 'Réf.', position: { page: 1, x: 50, y: 300 } }],
        champs: { ref: apres('ref') },
      });
      expect(resultat).toMatchObject({ ok: true, champs: { ref: { valeur: 'A-1' } } });
    });

    it('signale une ancre sans valeur comme un champ vide', () => {
      expect(unChamp(apres('titre'))).toMatchObject({
        erreurs: [{ nature: 'champ-vide', champ: 'champ' }],
      });
    });

    it('signale un champ qui renvoie à une ancre inconnue du modèle', () => {
      expect(unChamp(apres('inconnue'))).toEqual({
        ok: false,
        changements: [],
        erreurs: [{ nature: 'ancre-inconnue', champ: 'champ', ancre: 'inconnue' }],
      });
    });
  });

  describe('conversions', () => {
    const lire = (type: ChampPdf['type'], valeur: string) =>
      lirePdfParZones(pdf(fragment('Valeur', 50, 50), fragment(valeur, 120, 50)), {
        tolerance: 0,
        ancres: [{ id: 'v', texte: 'Valeur', position: { page: 1, x: 50, y: 50 } }],
        champs: { v: apres('v', type) },
      });

    it.each([
      ['montant', '1 234,56 €', 123456],
      ['montant', '-670,00 €', -67000],
      ['montant', '12,5 EUR', 1250],
      ['montant', '12€', 1200],
      ['montant', '99', 9900],
      ['date', '01/02/2027', '2027-02-01'],
      ['date', '2027-02-01', '2027-02-01'],
      ['entier', '90 jours', 90],
      ['entier', '3', 3],
      ['entier', '90  jours', 90],
      ['texte', 'tel quel', 'tel quel'],
    ] as const)('lit un %s : « %s »', (type, texte, valeur) => {
      expect(lire(type, texte)).toMatchObject({ ok: true, champs: { v: { type, valeur, texte } } });
    });

    it.each([
      ['montant', '12,345 €'],
      ['montant', '€ 12'],
      ['montant', '12 €uros'],
      ['date', '31/02/2027'],
      ['entier', 'trente jours'],
      ['entier', '30 jours ouvrés'],
      ['entier', '2,5 jours'],
      ['entier', 'environ 30'],
    ] as const)('refuse un %s illisible : « %s »', (type, texte) => {
      expect(lire(type, texte)).toEqual({
        ok: false,
        changements: [],
        erreurs: [{ nature: 'champ-illisible', champ: 'v', type, texte }],
      });
    });
  });

  it('rassemble les erreurs de tous les champs', () => {
    const resultat = lirePdfParZones(pdf(...FACTURE), {
      ...MODELE,
      champs: { a: apres('titre'), b: apres('numero', 'montant'), c: apres('date', 'date') },
    });
    expect(resultat).toMatchObject({
      ok: false,
      erreurs: [
        { nature: 'champ-vide', champ: 'a' },
        { nature: 'champ-illisible', champ: 'b', texte: 'F-2027-0042' },
      ],
    });
  });
});

describe('verifierModeleDeLecturePdf', () => {
  it('ne signale rien pour un modèle complet', () => {
    expect(verifierModeleDeLecturePdf(MODELE)).toEqual([]);
    expect(verifierModeleDeLecturePdf({ ...MODELE, tolerance: 0 })).toEqual([]);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse la tolérance %d', (tolerance) => {
    expect(verifierModeleDeLecturePdf({ ...MODELE, tolerance })).toEqual([
      { nature: 'tolerance-invalide', tolerance },
    ]);
  });

  it('signale un modèle sans champ, des ancres en double ou vides', () => {
    const position = { page: 1, x: 0, y: 0 };
    expect(
      verifierModeleDeLecturePdf({
        tolerance: 5,
        ancres: [
          { id: 'a', texte: 'A', position },
          { id: 'a', texte: 'B', position },
          { id: 'b', texte: '  ', position },
        ],
        champs: {},
      }),
    ).toEqual([
      { nature: 'aucun-champ' },
      { nature: 'ancre-en-double', ancre: 'a' },
      { nature: 'ancre-vide', ancre: 'b' },
    ]);
  });

  it.each([-1, Number.NaN])('refuse la tolérance %d d’une ancre', (tolerance) => {
    const ancres = ANCRES.map((ancre) => (ancre.id === 'ttc' ? { ...ancre, tolerance } : ancre));
    expect(verifierModeleDeLecturePdf({ ...MODELE, ancres })).toEqual([
      { nature: 'tolerance-invalide', tolerance, ancre: 'ttc' },
    ]);
    expect(
      verifierModeleDeLecturePdf({
        ...MODELE,
        ancres: ANCRES.map((ancre) => ({ ...ancre, tolerance: 0 })),
      }),
    ).toEqual([]);
  });

  it('signale un champ après une ancre inconnue', () => {
    expect(verifierModeleDeLecturePdf({ ...MODELE, champs: { x: apres('nulle-part') } })).toEqual([
      { nature: 'ancre-inconnue', champ: 'x', ancre: 'nulle-part' },
    ]);
  });

  it.each([
    ['page 0', { page: 0 }],
    ['page non entière', { page: 1.5 }],
    ['largeur nulle', { largeur: 0 }],
    ['hauteur nulle', { hauteur: 0 }],
  ])('signale un rectangle invalide : %s', (_cas, surcharge) => {
    const rectangle = { ...FOURNISSEUR, ...surcharge };
    expect(
      verifierModeleDeLecturePdf({
        ...MODELE,
        champs: { x: { zone: { nature: 'rectangle', rectangle }, type: 'texte' } },
      }),
    ).toEqual([{ nature: 'rectangle-invalide', champ: 'x' }]);
  });
});
