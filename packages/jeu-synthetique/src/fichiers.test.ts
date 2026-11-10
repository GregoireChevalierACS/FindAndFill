import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  attendusAchats,
  attendusCa,
  attendusCarnet,
  attendusTresorerie,
  type CelluleAttendue,
} from './attendus.js';
import { CHEMINS, genererJeuComplet, type Attendu, type FichierGenere } from './catalogue.js';
import { COLONNES_FEC } from './fec.js';
import { ONGLETS } from './gabarit.js';
import { genererJeu } from './modele.js';
import {
  BOM,
  COLONNE_AJOUTEE_VENTES,
  COLONNES_ACHATS,
  COLONNES_ACHATS_DEPLACEES,
  COLONNES_CARNET,
  COLONNES_VENTES,
  LIGNE_ENTETE_CARNET,
  LIGNE_ENTETE_VENTES,
  ONGLET_CARNET,
  ONGLET_CARNET_RENOMME,
  ONGLET_VENTES,
} from './sources.js';
import { CHEMIN_PROJET_VBA, lireProjetVbaExemple } from './xlsm.js';

const jeu = genererJeu(2026);
let fichiers: Map<string, Buffer>;

beforeAll(async () => {
  const { fichiers: liste } = await genererJeuComplet(2026);
  fichiers = new Map(liste.map((f: FichierGenere) => [f.chemin, f.contenu]));
});

function fichier(chemin: string): Buffer {
  const contenu = fichiers.get(chemin);
  if (contenu === undefined) {
    throw new Error(`Fichier non généré : ${chemin}`);
  }
  return contenu;
}

async function classeur(chemin: string): Promise<ExcelJS.Workbook> {
  const lu = new ExcelJS.Workbook();
  await lu.xlsx.load(fichier(chemin) as unknown as ArrayBuffer);
  return lu;
}

function feuille(lu: ExcelJS.Workbook, nom: string): ExcelJS.Worksheet {
  const trouvee = lu.getWorksheet(nom);
  if (trouvee === undefined) {
    throw new Error(`Onglet absent : ${nom}`);
  }
  return trouvee;
}

function valeursLigne(f: ExcelJS.Worksheet, numero: number): unknown[] {
  const valeurs = f.getRow(numero).values;
  return Array.isArray(valeurs) ? valeurs.slice(1) : [];
}

/** Lecture indépendante d'un montant texte (« 1 234,56 ») en centimes. */
function centimesTexte(texte: string): number {
  return Math.round(Number(texte.replace(/\s/g, '').replace(',', '.')) * 100);
}

function centimesNombre(valeur: unknown): number {
  return Math.round(Number(valeur) * 100);
}

/** Agrège des montants par (clé de ligne, mois) et les compare aux cellules attendues. */
function verifierTableauMensuel(
  attendues: readonly CelluleAttendue[],
  libelles: readonly string[],
  mouvements: readonly { cle: string; mois: number; centimes: number }[],
): void {
  const cumuls = new Map<string, number>();
  for (const { cle, mois, centimes } of mouvements) {
    const k = `${cle}|${mois}`;
    cumuls.set(k, (cumuls.get(k) ?? 0) + centimes);
  }
  expect(attendues).toHaveLength(libelles.length * 12);
  attendues.forEach((cellule, index) => {
    const cle = libelles[Math.floor(index / 12)] ?? '';
    const mois = (index % 12) + 1;
    expect(centimesNombre(cellule.valeur), `${cle} mois ${mois}`).toBe(
      cumuls.get(`${cle}|${mois}`) ?? 0,
    );
  });
}

function lireCsv(contenu: Buffer): { entetes: string[]; lignes: Record<string, string>[] } {
  const texte = contenu.toString('utf8');
  expect(texte.startsWith(BOM)).toBe(true);
  const [entete = '', ...lignes] = texte
    .slice(1)
    .split('\r\n')
    .filter((l) => l !== '');
  const entetes = entete.split(';');
  return {
    entetes,
    lignes: lignes.map((ligne) => {
      const champs = ligne.split(';');
      return Object.fromEntries(entetes.map((e, i) => [e, champs[i] ?? '']));
    }),
  };
}

describe('FEC', () => {
  function lignesFec(): string[][] {
    const texte = fichier(CHEMINS.fec).toString('utf8');
    expect(texte.endsWith('\r\n')).toBe(true);
    return texte
      .split('\r\n')
      .filter((l) => l !== '')
      .map((l) => l.split('\t'));
  }

  it('a les 18 colonnes réglementaires sur chaque ligne', () => {
    const [entete, ...lignes] = lignesFec();
    expect(entete).toEqual([...COLONNES_FEC]);
    expect(lignes.length).toBe(jeu.ecritures.flatMap((e) => e.lignes).length);
    for (const ligne of lignes) {
      expect(ligne).toHaveLength(18);
      expect(ligne[3]).toMatch(/^2026\d{4}$/);
      expect(ligne[11]).toMatch(/^\d+,\d{2}$/);
      expect(ligne[12]).toMatch(/^\d+,\d{2}$/);
    }
  });

  it('est équilibré écriture par écriture', () => {
    const soldes = new Map<string, number>();
    for (const ligne of lignesFec().slice(1)) {
      const numero = ligne[2] ?? '';
      soldes.set(
        numero,
        (soldes.get(numero) ?? 0) + centimesTexte(ligne[11] ?? '') - centimesTexte(ligne[12] ?? ''),
      );
    }
    expect([...soldes.values()].every((solde) => solde === 0)).toBe(true);
  });

  it('donne, relu, la trésorerie attendue', () => {
    const banque = lignesFec()
      .slice(1)
      .filter((l) => l[4] === '512000');
    const attendues = attendusTresorerie(jeu);
    const aNouveau = banque.filter((l) => l[0] === 'AN');
    expect(centimesNombre(attendues[0]?.valeur)).toBe(
      aNouveau.reduce((s, l) => s + centimesTexte(l[11] ?? '') - centimesTexte(l[12] ?? ''), 0),
    );
    for (let mois = 1; mois <= 12; mois++) {
      const duMois = banque.filter((l) => l[0] !== 'AN' && Number(l[3]?.slice(4, 6)) === mois);
      const somme = (colonne: number) =>
        duMois.reduce((s, l) => s + centimesTexte(l[colonne] ?? ''), 0);
      expect(centimesNombre(attendues[2 * mois - 1]?.valeur)).toBe(somme(11));
      expect(centimesNombre(attendues[2 * mois]?.valeur)).toBe(somme(12));
    }
  });
});

describe('export des ventes', () => {
  it('a un titre, puis les en-têtes en ligne 4', async () => {
    const f = feuille(await classeur(CHEMINS.ventes), ONGLET_VENTES);
    expect(f.getCell('A1').text).toContain('Export des ventes 2026');
    expect(valeursLigne(f, LIGNE_ENTETE_VENTES)).toEqual([...COLONNES_VENTES]);
    expect(f.rowCount).toBe(LIGNE_ENTETE_VENTES + jeu.ventes.length);
  });

  it('donne, relu, le CA mensuel attendu par affaire', async () => {
    const f = feuille(await classeur(CHEMINS.ventes), ONGLET_VENTES);
    const mouvements = jeu.ventes.map((_, index) => {
      const [, date, affaire, , , , , ht] = valeursLigne(f, LIGNE_ENTETE_VENTES + 1 + index);
      return {
        cle: String(affaire),
        mois: (date as Date).getUTCMonth() + 1,
        centimes: centimesNombre(ht),
      };
    });
    verifierTableauMensuel(
      attendusCa(jeu),
      jeu.affaires.map((a) => a.code),
      mouvements,
    );
  });

  it('variante : ajoute seulement la colonne « Commercial » après « Client »', async () => {
    const reference = feuille(await classeur(CHEMINS.ventes), ONGLET_VENTES);
    const variante = feuille(await classeur(CHEMINS.ventesColonneAjoutee), ONGLET_VENTES);
    const entetes = valeursLigne(variante, LIGNE_ENTETE_VENTES);
    expect(entetes[4]).toBe(COLONNE_AJOUTEE_VENTES);
    for (let ligne = LIGNE_ENTETE_VENTES; ligne <= reference.rowCount; ligne++) {
      const sansAjout = valeursLigne(variante, ligne);
      sansAjout.splice(4, 1);
      expect(sansAjout).toEqual(valeursLigne(reference, ligne));
    }
  });
});

describe('carnet de commandes', () => {
  it('donne, relu, le commandé et le facturé attendus', async () => {
    const f = feuille(await classeur(CHEMINS.carnet), ONGLET_CARNET);
    expect(valeursLigne(f, LIGNE_ENTETE_CARNET)).toEqual([...COLONNES_CARNET]);
    const attendues = attendusCarnet(jeu);
    jeu.affaires.forEach((affaire, rang) => {
      const ligne = valeursLigne(f, LIGNE_ENTETE_CARNET + 1 + rang);
      expect(ligne[0]).toBe(affaire.code);
      expect(centimesNombre(ligne[6])).toBe(centimesNombre(attendues[2 * rang]?.valeur));
      expect(centimesNombre(ligne[7])).toBe(centimesNombre(attendues[2 * rang + 1]?.valeur));
      expect(centimesNombre(ligne[8])).toBe(centimesNombre(ligne[6]) - centimesNombre(ligne[7]));
    });
  });

  it('variante : seul le nom de l’onglet change', async () => {
    const reference = feuille(await classeur(CHEMINS.carnet), ONGLET_CARNET);
    const lu = await classeur(CHEMINS.carnetOngletRenomme);
    expect(lu.worksheets.map((w) => w.name)).toEqual([ONGLET_CARNET_RENOMME]);
    const variante = feuille(lu, ONGLET_CARNET_RENOMME);
    for (let ligne = 1; ligne <= reference.rowCount; ligne++) {
      expect(valeursLigne(variante, ligne)).toEqual(valeursLigne(reference, ligne));
    }
  });
});

describe('CSV des achats', () => {
  it('suit les conventions françaises', () => {
    const { entetes, lignes } = lireCsv(fichier(CHEMINS.achats));
    expect(entetes).toEqual([...COLONNES_ACHATS]);
    expect(lignes).toHaveLength(jeu.achats.length);
    expect(lignes[0]?.['Date']).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(lignes.some((l) => /^\d{1,3}( \d{3})+,\d{2}$/.test(l['Montant HT'] ?? ''))).toBe(true);
  });

  it('donne, relu, les achats mensuels attendus par fournisseur', () => {
    const { lignes } = lireCsv(fichier(CHEMINS.achats));
    const codeParNom = new Map(jeu.fournisseurs.map((f) => [f.nom, f.code]));
    verifierTableauMensuel(
      attendusAchats(jeu),
      jeu.fournisseurs.map((f) => f.code),
      lignes.map((l) => ({
        cle: codeParNom.get(l['Fournisseur'] ?? '') ?? '',
        mois: Number(l['Date']?.slice(3, 5)),
        centimes: centimesTexte(l['Montant HT'] ?? ''),
      })),
    );
  });

  it('variante : mêmes données, colonnes dans un autre ordre', () => {
    const reference = lireCsv(fichier(CHEMINS.achats));
    const variante = lireCsv(fichier(CHEMINS.achatsColonnesDeplacees));
    expect(variante.entetes).toEqual([...COLONNES_ACHATS_DEPLACEES]);
    expect(variante.entetes).not.toEqual(reference.entetes);
    expect(variante.lignes).toEqual(reference.lignes);
  });

  it('protège les champs contenant un point-virgule ou un guillemet', async () => {
    const { exporterAchats } = await import('./sources.js');
    const [premier] = jeu.achats;
    if (premier === undefined) throw new Error('aucun achat');
    const piege = {
      ...jeu,
      achats: [{ ...premier, fournisseur: { ...premier.fournisseur, nom: 'A;B "C"' } }],
    };
    expect(exporterAchats(piege)).toContain(';"A;B ""C""";');
  });
});

describe('gabarit de reporting', () => {
  it('a les quatre onglets attendus', async () => {
    const lu = await classeur(CHEMINS.gabarit);
    expect(lu.worksheets.map((w) => w.name)).toEqual(Object.values(ONGLETS));
  });

  it('laisse vides toutes les cellules à remplir', async () => {
    const lu = await classeur(CHEMINS.gabarit);
    const toutes = [
      ...attendusCa(jeu),
      ...attendusCarnet(jeu),
      ...attendusTresorerie(jeu),
      ...attendusAchats(jeu),
    ];
    for (const { onglet, adresse } of toutes) {
      expect(feuille(lu, onglet).getCell(adresse).value, `${onglet}!${adresse}`).toBeNull();
    }
  });

  it('contient les formules de totaux, de reste et de solde', async () => {
    const lu = await classeur(CHEMINS.gabarit);
    const formule = (onglet: string, adresse: string) =>
      (feuille(lu, onglet).getCell(adresse).value as { formula?: string } | null)?.formula;
    const derniereCa = 3 + jeu.affaires.length;
    expect(formule(ONGLETS.ca, 'O4')).toBe('SUM(C4:N4)');
    expect(formule(ONGLETS.ca, `C${derniereCa + 1}`)).toBe(`SUM(C4:C${derniereCa})`);
    expect(formule(ONGLETS.carnet, 'E4')).toBe('C4-D4');
    expect(formule(ONGLETS.carnet, 'F4')).toBe('IF(C4=0,0,D4/C4)');
    expect(formule(ONGLETS.tresorerie, 'E6')).toBe('$C$3+D6');
    expect(formule(ONGLETS.tresorerie, 'E17')).toBe('E16+D17');
    expect(formule(ONGLETS.achats, 'O4')).toBe('SUM(C4:N4)');
  });
});

describe('gabarit avec macros', () => {
  it('embarque le projet VBA à l’identique', async () => {
    const zip = await JSZip.loadAsync(fichier(CHEMINS.gabaritMacros));
    const vba = await zip.file(CHEMIN_PROJET_VBA)?.async('uint8array');
    expect(vba).toEqual(await lireProjetVbaExemple());
  });

  it('déclare le classeur comme classeur à macros', async () => {
    const zip = await JSZip.loadAsync(fichier(CHEMINS.gabaritMacros));
    const texte = (chemin: string) => zip.file(chemin)?.async('string') ?? '';
    const types = await texte('[Content_Types].xml');
    expect(types).toContain('application/vnd.ms-excel.sheet.macroEnabled.main+xml');
    expect(types).not.toContain('spreadsheetml.sheet.main+xml');
    expect(types).toContain('Extension="bin" ContentType="application/vnd.ms-office.vbaProject"');
    expect(await texte('xl/_rels/workbook.xml.rels')).toContain('Target="vbaProject.bin"');
    expect(await texte('xl/workbook.xml')).toContain('<workbookPr codeName="ThisWorkbook"');
    expect(await texte('xl/worksheets/sheet1.xml')).toContain('<sheetPr codeName="Sheet1"/>');
    expect(await texte('xl/worksheets/sheet2.xml')).toContain('<sheetPr codeName="Sheet2"/>');
  });

  it('garde les mêmes feuilles que le gabarit sans macros', async () => {
    const avec = await JSZip.loadAsync(fichier(CHEMINS.gabaritMacros));
    const sans = await JSZip.loadAsync(fichier(CHEMINS.gabarit));
    for (const numero of [1, 2, 3, 4]) {
      const chemin = `xl/worksheets/sheet${numero}.xml`;
      const nettoye = (await avec.file(chemin)?.async('string'))?.replace(
        /<sheetPr codeName="Sheet\d"\/>/,
        '',
      );
      expect(nettoye).toBe(await sans.file(chemin)?.async('string'));
    }
  });
});

describe('catalogue', () => {
  it('produit des octets identiques à chaque génération', async () => {
    const deuxieme = await genererJeuComplet(2026);
    for (const { chemin, contenu } of deuxieme.fichiers) {
      expect(contenu.equals(fichier(chemin)), chemin).toBe(true);
    }
  });

  it('change de contenu avec une autre graine', async () => {
    const autre = await genererJeuComplet(1);
    expect(autre.manifeste.empreintes[CHEMINS.fec]).not.toBe(
      (await genererJeuComplet(2026)).manifeste.empreintes[CHEMINS.fec],
    );
  });

  it('remplit le critère de la phase 0', async () => {
    const { manifeste } = await genererJeuComplet(2026);
    const remplissages = manifeste.cas.filter((c) => c.type === 'remplissage');
    const variantes = manifeste.cas.filter((c) => c.type === 'changement-structure');
    expect(remplissages.length).toBeGreaterThanOrEqual(5);
    expect(remplissages.filter((c) => c.gabarit.endsWith('.xlsm')).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(variantes.length).toBeGreaterThanOrEqual(3);
  });

  it('référence uniquement des fichiers générés, et chaque attendu correspond à son cas', async () => {
    const { manifeste } = await genererJeuComplet(2026);
    for (const cas of manifeste.cas) {
      const chemins =
        cas.type === 'remplissage'
          ? [...cas.sources, cas.gabarit, cas.attendu]
          : [cas.reference, cas.source];
      for (const chemin of chemins) {
        expect(fichiers.has(chemin), `${cas.id} → ${chemin}`).toBe(true);
      }
      if (cas.type === 'remplissage') {
        const attendu = JSON.parse(fichier(cas.attendu).toString('utf8')) as Attendu;
        expect(attendu.cas).toBe(cas.id);
        expect(attendu.gabarit).toBe(cas.gabarit);
        expect(attendu.cellules.length).toBeGreaterThan(0);
      }
    }
  });

  it('inscrit au manifeste l’empreinte de chaque fichier', async () => {
    const { manifeste } = await genererJeuComplet(2026);
    const { createHash } = await import('node:crypto');
    const chemins = [...fichiers.keys()].filter((c) => c !== CHEMINS.manifeste);
    expect(Object.keys(manifeste.empreintes).sort()).toEqual(chemins.sort());
    for (const chemin of chemins) {
      expect(manifeste.empreintes[chemin]).toBe(
        createHash('sha256').update(fichier(chemin)).digest('hex'),
      );
    }
  });
});
