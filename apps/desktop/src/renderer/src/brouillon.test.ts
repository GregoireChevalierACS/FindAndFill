import type { ModeleRemplissage, Regle } from '@findandfill/domain';
import { describe, expect, it } from 'vitest';
import type { ApercuFeuille } from '../../shared/api.js';
import {
  ajouterRegle,
  ajouterSource,
  appliquerClic,
  brouillonVide,
  choisirEntetes,
  depuisModele,
  empreinteDuFichier,
  fichiersPourRemplir,
  identifiant,
  identifiantLibre,
  majRegle,
  problemes,
  regleDeType,
  remplacerFichierSource,
  renommerSource,
  retirerRegle,
  retirerSource,
  versModele,
  type Brouillon,
} from './brouillon.js';
import { decrireProbleme } from './messages.js';

const VENTES: ApercuFeuille = {
  nom: 'Ventes',
  lignes: [
    ['Export'],
    [],
    ['Date', 'Code affaire', 'Montant HT', 'TVA'],
    ['2026-01-05', 'AF1', 10, 2],
  ],
  ligneEntetesProposee: 2,
};
const NOTES: ApercuFeuille = {
  nom: 'Notes',
  lignes: [['Remarque', 'Auteur']],
  ligneEntetesProposee: 0,
};
const CSV: ApercuFeuille = { nom: '', lignes: [['Fournisseur', 'Débit']], ligneEntetesProposee: 0 };

const GABARIT = {
  chemin: 'C:\\R\\reporting.xlsx',
  onglets: [{ nom: 'CA', grille: [] }],
};

function avecVentes(): Brouillon {
  return ajouterSource(brouillonVide(2026), 'C:\\Exports\\ventes 2026.xlsx', [VENTES, NOTES]);
}

describe('identifiants', () => {
  it.each([
    ['Export des ventes', 'export-des-ventes'],
    ['Trésorerie (FEC)', 'tresorerie-fec'],
    ['---', 'element'],
  ])('%s → %s', (libelle, attendu) => {
    expect(identifiant(libelle)).toBe(attendu);
  });

  it('trouve le premier identifiant libre', () => {
    expect(identifiantLibre('ventes', [])).toBe('ventes');
    expect(identifiantLibre('ventes', ['ventes'])).toBe('ventes-2');
    expect(identifiantLibre('ventes', ['ventes', 'ventes-2'])).toBe('ventes-3');
  });
});

describe('sources', () => {
  it('ajoute une source avec la première feuille et sa ligne d’en-têtes proposée', () => {
    const [source] = avecVentes().sources;
    expect(source).toMatchObject({
      id: 'ventes-2026',
      libelle: 'ventes 2026',
      empreinte: { onglet: 'Ventes', entetes: ['Date', 'Code affaire', 'Montant HT', 'TVA'] },
      fichier: { chemin: 'C:\\Exports\\ventes 2026.xlsx', onglet: 'Ventes', ligneEntetes: 2 },
    });
  });

  it('donne des identifiants distincts au même fichier ajouté deux fois', () => {
    const b = ajouterSource(avecVentes(), '/exports/ventes 2026.xlsx', [VENTES]);
    expect(b.sources.map((s) => s.id)).toEqual(['ventes-2026', 'ventes-2026-2']);
  });

  it('omet l’onglet pour un CSV, et accepte un fichier sans extension ni feuille', () => {
    const csv = ajouterSource(brouillonVide(2026), '/x/achats.csv', [CSV]);
    expect(csv.sources[0]?.empreinte).toEqual({ entetes: ['Fournisseur', 'Débit'] });
    const vide = ajouterSource(brouillonVide(2026), 'brut', []);
    expect(vide.sources[0]).toMatchObject({
      id: 'brut',
      libelle: 'brut',
      empreinte: { entetes: [] },
    });
  });

  it('reprend la ligne proposée en changeant d’onglet, et accepte un choix manuel', () => {
    let b = choisirEntetes(avecVentes(), 'ventes-2026', { onglet: 'Notes' });
    expect(b.sources[0]?.empreinte).toEqual({ onglet: 'Notes', entetes: ['Remarque', 'Auteur'] });
    b = choisirEntetes(b, 'ventes-2026', { onglet: 'Ventes', ligneEntetes: 0 });
    expect(b.sources[0]?.empreinte).toEqual({ onglet: 'Ventes', entetes: ['Export'] });
    b = choisirEntetes(b, 'ventes-2026', { ligneEntetes: 3 });
    expect(b.sources[0]?.fichier?.onglet).toBe('Ventes');
    expect(b.sources[0]?.empreinte.entetes).toEqual(['2026-01-05', 'AF1', '10', '2']);
  });

  it('donne des en-têtes vides sans ligne choisie ou pour un onglet inconnu', () => {
    expect(
      empreinteDuFichier({ chemin: 'x', feuilles: [VENTES], onglet: 'Ventes', ligneEntetes: null }),
    ).toEqual({
      onglet: 'Ventes',
      entetes: [],
    });
    expect(
      empreinteDuFichier({ chemin: 'x', feuilles: [CSV], onglet: '', ligneEntetes: null }),
    ).toEqual({
      entetes: [],
    });
    expect(empreinteDuFichier({ chemin: 'x', feuilles: [], onglet: 'Z', ligneEntetes: 0 })).toEqual(
      {
        entetes: [],
      },
    );
  });

  it('ne touche pas une source sans fichier', () => {
    const b = depuisModele({
      nom: 'M',
      annee: 2026,
      sources: [{ id: 's', libelle: 'S', empreinte: { entetes: ['A'] } }],
      regles: [],
    });
    expect(choisirEntetes(b, 's', { ligneEntetes: 1 })).toEqual(b);
  });

  it('renomme, remplace le fichier en gardant l’identifiant, et retire une source', () => {
    let b = renommerSource(avecVentes(), 'ventes-2026', 'Ventes');
    b = remplacerFichierSource(b, 'ventes-2026', '/x/autre.csv', [CSV]);
    expect(b.sources[0]).toMatchObject({
      id: 'ventes-2026',
      libelle: 'Ventes',
      empreinte: { entetes: ['Fournisseur', 'Débit'] },
    });
    b = renommerSource(b, 'inconnue', 'Z');
    expect(b.sources[0]?.libelle).toBe('Ventes');
    expect(retirerSource(b, 'ventes-2026').sources).toEqual([]);
  });
});

describe('règles', () => {
  const base = { ...avecVentes(), gabarit: GABARIT };

  it.each([
    [
      'mensuel-par-cle',
      {
        cle: '',
        date: 'Date',
        cible: { onglet: 'CA', colonneCles: 'A', premiereColonneMois: 'C' },
      },
    ],
    ['mensuel', { date: 'Date', cible: { onglet: 'CA', colonne: 'B', ligneJanvier: 2 } }],
    ['par-cle', { cle: '', cible: { onglet: 'CA', colonneCles: 'A', colonne: 'C' } }],
    ['total', { cible: { onglet: 'CA', adresse: 'B2' } }],
  ] as const)('ajoute une règle « %s » pré-remplie', (type, attendu) => {
    const [regle] = ajouterRegle(base, type).regles;
    expect(regle).toEqual({
      id: 'regle',
      type,
      source: 'ventes-2026',
      montant: { plus: 'Montant HT' },
      ...attendu,
    });
  });

  it('numérote les règles et se contente de valeurs vides sans source ni gabarit', () => {
    const b = ajouterRegle(ajouterRegle(brouillonVide(2026), 'total'), 'total');
    expect(b.regles.map((r) => r.id)).toEqual(['regle', 'regle-2']);
    expect(b.regles[0]).toEqual({
      id: 'regle',
      type: 'total',
      source: '',
      montant: { plus: '' },
      cible: { onglet: '', adresse: 'B2' },
    });
  });

  it('change de type en gardant source, montant, filtres, clé, date et onglet', () => {
    const precedente: Regle = {
      id: 'ca',
      type: 'mensuel-par-cle',
      source: 'ventes',
      cle: 'Code affaire',
      date: 'Jour',
      montant: { plus: 'HT', moins: 'Avoir' },
      filtres: [{ colonne: 'Type', operateur: 'egal', valeur: 'F' }],
      cible: { onglet: 'CA', colonneCles: 'B', premiereColonneMois: 'D' },
    };
    const contexte = { id: 'ca', source: 'autre', entetes: ['Date'], onglet: 'Autre' };
    expect(regleDeType('par-cle', contexte, precedente)).toEqual({
      id: 'ca',
      type: 'par-cle',
      source: 'ventes',
      cle: 'Code affaire',
      montant: { plus: 'HT', moins: 'Avoir' },
      filtres: [{ colonne: 'Type', operateur: 'egal', valeur: 'F' }],
      cible: { onglet: 'CA', colonneCles: 'A', colonne: 'C' },
    });
    const total = regleDeType('total', contexte, precedente);
    expect(regleDeType('mensuel', contexte, total)).toMatchObject({ date: 'Date' });
    expect(regleDeType('mensuel-par-cle', contexte, total)).toMatchObject({
      cle: '',
      date: 'Date',
    });
  });

  it('modifie et retire une règle par sa position', () => {
    let b = ajouterRegle(ajouterRegle(base, 'total'), 'total');
    const [premiere] = b.regles;
    if (premiere === undefined) throw new Error('règle absente');
    b = majRegle(b, 1, { ...premiere, id: 'solde' });
    expect(b.regles.map((r) => r.id)).toEqual(['regle', 'solde']);
    expect(retirerRegle(b, 0).regles.map((r) => r.id)).toEqual(['solde']);
  });

  it.each([
    ['colonneCles', 'D'],
    ['premiereColonneMois', 'D'],
    ['colonne', 'D'],
    ['ligneJanvier', 7],
    ['adresse', 'D7'],
  ] as const)('applique un clic en D7 au champ %s', (champ, valeur) => {
    const regle = regleDeType('total', { id: 'r', source: 's', entetes: [], onglet: 'T' });
    expect(appliquerClic(regle, champ, 7, 4).cible).toMatchObject({ onglet: 'T', [champ]: valeur });
  });
});

describe('modèle', () => {
  it('produit un modèle propre : montant à retrancher vide et filtres vides retirés', () => {
    let b = ajouterRegle({ ...avecVentes(), nom: 'CA', gabarit: GABARIT }, 'total');
    const [regle] = b.regles;
    if (regle === undefined) throw new Error('règle absente');
    b = majRegle(b, 0, { ...regle, montant: { plus: 'Montant HT', moins: '' }, filtres: [] });
    b = ajouterRegle(b, 'total');
    const [, seconde] = b.regles;
    if (seconde === undefined) throw new Error('règle absente');
    const filtres = [{ colonne: 'TVA', operateur: 'different' as const, valeur: '0' }];
    b = majRegle(b, 1, { ...seconde, montant: { plus: 'Montant HT', moins: 'TVA' }, filtres });

    const modele = versModele(b);
    expect(modele.sources).toEqual([
      { id: 'ventes-2026', libelle: 'ventes 2026', empreinte: b.sources[0]?.empreinte },
    ]);
    expect(modele.regles[0]).toEqual({
      id: 'regle',
      type: 'total',
      source: 'ventes-2026',
      montant: { plus: 'Montant HT' },
      cible: { onglet: 'CA', adresse: 'B2' },
    });
    expect(modele.regles[1]).toMatchObject({
      montant: { plus: 'Montant HT', moins: 'TVA' },
      filtres,
    });
  });

  it('rouvre un modèle sans fichiers et le rend à l’identique', () => {
    const modele: ModeleRemplissage = {
      nom: 'M',
      annee: 2025,
      sources: [{ id: 's', libelle: 'S', empreinte: { entetes: ['A'] } }],
      regles: [
        {
          id: 'r',
          type: 'total',
          source: 's',
          montant: { plus: 'A' },
          cible: { onglet: 'T', adresse: 'C3' },
        },
      ],
    };
    const b = depuisModele(modele);
    expect(b.sources[0]?.fichier).toBeNull();
    expect(versModele(b)).toEqual(modele);
    expect(fichiersPourRemplir(b)).toBeNull();
  });

  it('donne les fichiers pour remplir quand tout est choisi', () => {
    expect(fichiersPourRemplir(avecVentes())).toBeNull();
    expect(fichiersPourRemplir({ ...avecVentes(), gabarit: GABARIT })).toEqual({
      sources: { 'ventes-2026': 'C:\\Exports\\ventes 2026.xlsx' },
      gabarit: 'C:\\R\\reporting.xlsx',
    });
  });

  it('liste les problèmes et les décrit en français', () => {
    const b = ajouterRegle(avecVentes(), 'mensuel-par-cle');
    const liste = problemes(b);
    expect(liste).toEqual([{ nature: 'colonne-inconnue', regle: 'regle', colonne: '' }]);
    expect(decrireProbleme(liste[0] ?? { nature: 'aucune-source' }, versModele(b))).toBe(
      'Règle « regle » : une colonne reste à choisir.',
    );
  });
});

describe('decrireProbleme', () => {
  const modele: ModeleRemplissage = {
    nom: 'M',
    annee: 2026,
    sources: [{ id: 'ventes', libelle: 'Export des ventes', empreinte: { entetes: ['A'] } }],
    regles: [],
  };

  it.each([
    [{ nature: 'aucune-source' }, 'Ajoutez au moins une source.'],
    [{ nature: 'aucune-regle' }, 'Ajoutez au moins une règle.'],
    [
      { nature: 'identifiant-en-double', quoi: 'source', id: 'v' },
      'Deux sources ont l’identifiant « v ».',
    ],
    [
      { nature: 'identifiant-en-double', quoi: 'regle', id: 'r' },
      'Deux règles ont l’identifiant « r » : renommez l’une d’elles.',
    ],
    [
      { nature: 'entetes-vides', source: 'ventes' },
      '« Export des ventes » : choisissez sa ligne d’en-têtes.',
    ],
    [
      { nature: 'entete-en-double', source: 'autre', entete: 'Date' },
      '« autre » : l’en-tête « Date » apparaît deux fois ; choisissez une autre ligne ou corrigez le fichier.',
    ],
    [{ nature: 'source-inconnue', regle: 'r', source: '' }, 'Règle « r » : choisissez sa source.'],
    [
      { nature: 'source-inconnue', regle: 'r', source: 'x' },
      'Règle « r » : la source « x » n’existe plus.',
    ],
    [
      { nature: 'colonne-inconnue', regle: 'r', colonne: 'HT' },
      'Règle « r » : la colonne « HT » est absente des en-têtes de sa source.',
    ],
    [
      { nature: 'cible-invalide', regle: 'r', champ: 'adresse', valeur: 'C0' },
      'Règle « r » : « C0 » n’est pas une valeur valide pour adresse.',
    ],
  ] as const)('décrit %j', (probleme, attendu) => {
    expect(decrireProbleme(probleme, modele)).toBe(attendu);
  });
});
