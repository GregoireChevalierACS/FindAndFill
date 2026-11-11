import type { GabaritXlsx } from '@findandfill/adapters-fichiers';
import type { LecteurSources } from '@findandfill/application';
import type { ModeleRemplissage } from '@findandfill/domain';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  APERCU,
  cheminPropose,
  creerService,
  nomDeFichierModele,
  type DependancesService,
} from './service.js';

const MODELE: ModeleRemplissage = {
  nom: 'Test',
  annee: 2026,
  sources: [{ id: 'ventes', libelle: 'Ventes', empreinte: { entetes: ['Montant'] } }],
  regles: [
    {
      id: 'total',
      type: 'total',
      source: 'ventes',
      montant: { plus: 'Montant' },
      cible: { onglet: 'R', adresse: 'B2' },
    },
  ],
};

const gabarit: GabaritXlsx = {
  onglets: () => ['R'],
  grille: (_onglet, lignes, colonnes) =>
    Array.from({ length: lignes }, () =>
      Array.from({ length: colonnes }, () => ({ texte: '', formule: false })),
    ),
  colonne: () => new Map(),
  contenu: () => 'vide',
  ecrire: () => Promise.resolve(new Uint8Array([9])),
};

function dependances(surcharges: Partial<DependancesService> = {}) {
  const ecrits = new Map<string, Uint8Array>();
  let jetons = 0;
  const lecteur: LecteurSources = {
    lire: () => Promise.resolve({ feuilles: [{ nom: '', lignes: [['Montant'], [12]] }] }),
  };
  const ouvreur: DependancesService['ouvreur'] = { ouvrir: () => Promise.resolve(gabarit) };
  const base: DependancesService = {
    lireFichier: (chemin) =>
      chemin.includes('absent')
        ? Promise.reject(new Error(`ENOENT: ${chemin}`))
        : Promise.resolve(
            new TextEncoder().encode(chemin.endsWith('.json') ? JSON.stringify(MODELE) : 'x'),
          ),
    ecrireFichier: (chemin, octets) => {
      ecrits.set(chemin, octets);
      return Promise.resolve();
    },
    demanderEnregistrement: vi.fn((propose: string) => Promise.resolve<string | null>(propose)),
    creerJeton: () => `jeton-${++jetons}`,
    lecteur,
    ouvreur,
  };
  return { deps: { ...base, ...surcharges }, ecrits };
}

const DEMANDE = {
  modele: MODELE,
  sources: { ventes: 'ventes.csv' },
  gabarit: join('dossier', 'reporting.xlsm'),
};

describe('cheminPropose', () => {
  it('ajoute « - rempli » avant l’extension, dans le même dossier', () => {
    expect(cheminPropose(join('C:', 'Compta', 'reporting.xlsm'))).toBe(
      join('C:', 'Compta', 'reporting - rempli.xlsm'),
    );
  });
});

describe('ouvrirModele', () => {
  it('ouvre et valide un modèle JSON', async () => {
    const { deps } = dependances();
    expect(await creerService(deps).ouvrirModele('modele.json')).toEqual({
      ok: true,
      modele: MODELE,
    });
  });

  it('signale un fichier absent, un JSON invalide ou un modèle invalide', async () => {
    const service = creerService(
      dependances({
        lireFichier: (chemin) =>
          chemin === 'absent.json'
            ? Promise.reject(new Error('ENOENT'))
            : Promise.resolve(
                new TextEncoder().encode(chemin === 'casse.json' ? '{' : '{"nom":""}'),
              ),
      }).deps,
    );
    expect(await service.ouvrirModele('absent.json')).toEqual({
      ok: false,
      message: 'Fichier de modèle illisible : ENOENT',
    });
    expect(await service.ouvrirModele('casse.json')).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^Fichier de modèle illisible : /) as unknown,
    });
    expect(await service.ouvrirModele('vide.json')).toMatchObject({
      ok: false,
      message: expect.stringMatching(/^Modèle invalide : nom : /) as unknown,
    });
  });
});

describe('preparer puis confirmer', () => {
  it('prépare un aperçu puis enregistre à l’emplacement choisi', async () => {
    const { deps, ecrits } = dependances();
    const service = creerService(deps);
    const apercu = await service.preparer(DEMANDE);
    expect(apercu).toMatchObject({ ok: true, jeton: 'jeton-1', avertissements: [] });
    expect(apercu.ok && apercu.cellules[0]?.valeur).toBe(1200);

    expect(await service.confirmer('jeton-1')).toEqual({
      statut: 'enregistre',
      chemin: join('dossier', 'reporting - rempli.xlsm'),
    });
    expect(ecrits.get(join('dossier', 'reporting - rempli.xlsm'))).toEqual(new Uint8Array([9]));
  });

  it('refuse un modèle invalide venu de l’interface', async () => {
    const service = creerService(dependances().deps);
    const resultat = await service.preparer({ ...DEMANDE, modele: { nom: 'x' } });
    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.erreurs[0]?.nature).toBe('modele-invalide');
    expect((await service.preparer(null)).ok).toBe(false);
  });

  it('signale les fichiers illisibles, sources comme gabarit', async () => {
    const service = creerService(dependances().deps);
    expect(
      await service.preparer({
        ...DEMANDE,
        sources: { ventes: 'absent.csv', autre: 42 },
        gabarit: 'absent.xlsx',
      }),
    ).toEqual({
      ok: false,
      erreurs: [
        { nature: 'fichier-illisible', fichier: 'absent.csv', detail: 'ENOENT: absent.csv' },
        { nature: 'fichier-illisible', fichier: 'absent.xlsx', detail: 'ENOENT: absent.xlsx' },
      ],
    });
    expect(await service.preparer({ modele: MODELE, sources: 'non', gabarit: 3 })).toMatchObject({
      ok: false,
      erreurs: [{ nature: 'source-absente', source: 'ventes' }],
    });
  });

  it('renvoie les erreurs du moteur', async () => {
    const service = creerService(
      dependances({ ouvreur: { ouvrir: () => Promise.resolve({ ...gabarit, onglets: () => [] }) } })
        .deps,
    );
    expect(await service.preparer(DEMANDE)).toEqual({
      ok: false,
      erreurs: [{ nature: 'onglet-cible-introuvable', regle: 'total', onglet: 'R' }],
    });
  });

  it('ne confirme que le dernier aperçu', async () => {
    const service = creerService(dependances().deps);
    expect((await service.confirmer('jeton-1')).statut).toBe('erreur');
    await service.preparer(DEMANDE);
    await service.preparer(DEMANDE);
    expect(await service.confirmer('jeton-1')).toMatchObject({
      statut: 'erreur',
      message: /plus à jour/,
    });
    expect((await service.confirmer('jeton-2')).statut).toBe('enregistre');
    await service.preparer({ ...DEMANDE, gabarit: 'absent.xlsx' });
    expect((await service.confirmer('jeton-2')).statut).toBe('erreur');
  });

  it('respecte l’annulation et protège le gabarit d’origine', async () => {
    const annule = creerService(
      dependances({ demanderEnregistrement: () => Promise.resolve(null) }).deps,
    );
    await annule.preparer(DEMANDE);
    expect(await annule.confirmer('jeton-1')).toEqual({ statut: 'annule' });

    const ecrase = creerService(
      dependances({ demanderEnregistrement: () => Promise.resolve(DEMANDE.gabarit) }).deps,
    );
    await ecrase.preparer(DEMANDE);
    expect(await ecrase.confirmer('jeton-1')).toMatchObject({
      statut: 'erreur',
      message: /autre nom/,
    });
  });

  it('signale un échec d’écriture', async () => {
    const service = creerService(
      dependances({
        ecrireFichier: () => Promise.reject(new Error('EBUSY: fichier ouvert dans Excel')),
      }).deps,
    );
    await service.preparer(DEMANDE);
    expect(await service.confirmer('jeton-1')).toEqual({
      statut: 'erreur',
      message: 'Enregistrement impossible : EBUSY: fichier ouvert dans Excel',
    });
  });

  it('accepte une erreur qui n’est pas une Error', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- dépendance mal élevée
    const service = creerService(dependances({ lireFichier: () => Promise.reject('refus') }).deps);
    expect(await service.ouvrirModele('m.json')).toEqual({
      ok: false,
      message: 'Fichier de modèle illisible : refus',
    });
  });
});

describe('nomDeFichierModele', () => {
  it.each([
    ['Reporting direction 2026', 'reporting-direction-2026.json'],
    ['Trésorerie (FEC) — mensuelle', 'tresorerie-fec-mensuelle.json'],
    ['  !!  ', 'modele.json'],
  ])('%s → %s', (nom, attendu) => {
    expect(nomDeFichierModele(nom)).toBe(attendu);
  });
});

describe('aperçus pour l’éditeur', () => {
  it('donne le début de chaque feuille et la ligne d’en-têtes proposée', async () => {
    const lignes = Array.from({ length: APERCU.lignesSource + 5 }, (_, i) =>
      Array.from({ length: APERCU.colonnesSource + 3 }, (_, j) => (i === 2 ? `C${j}` : j)),
    );
    const service = creerService(
      dependances({
        lecteur: { lire: () => Promise.resolve({ feuilles: [{ nom: 'Ventes', lignes }] }) },
      }).deps,
    );
    const apercu = await service.apercuSource('ventes.xlsx');
    if (!apercu.ok) throw new Error(apercu.message);
    const [feuille] = apercu.feuilles;
    expect(feuille?.nom).toBe('Ventes');
    expect(feuille?.lignes).toHaveLength(APERCU.lignesSource);
    expect(feuille?.lignes[0]).toHaveLength(APERCU.colonnesSource);
    expect(feuille?.ligneEntetesProposee).toBe(2);
  });

  it('signale une source illisible', async () => {
    const service = creerService(dependances().deps);
    expect(await service.apercuSource('absent.csv')).toEqual({
      ok: false,
      message: 'Impossible de lire ce fichier : ENOENT: absent.csv',
    });
  });

  it('donne la grille de chaque onglet du gabarit', async () => {
    const apercu = await creerService(dependances().deps).apercuGabarit('reporting.xlsx');
    if (!apercu.ok) throw new Error(apercu.message);
    expect(apercu.onglets.map((o) => o.nom)).toEqual(['R']);
    expect(apercu.onglets[0]?.grille).toHaveLength(APERCU.lignesGabarit);
    expect(apercu.onglets[0]?.grille[0]).toHaveLength(APERCU.colonnesGabarit);
  });

  it('signale un gabarit illisible', async () => {
    expect(await creerService(dependances().deps).apercuGabarit('absent.xlsx')).toEqual({
      ok: false,
      message: 'Impossible d’ouvrir ce gabarit : ENOENT: absent.xlsx',
    });
  });
});

describe('enregistrerModele', () => {
  it('propose un nom tiré du modèle et écrit un JSON lisible', async () => {
    const { deps, ecrits } = dependances();
    const service = creerService(deps);
    expect(await service.enregistrerModele(MODELE)).toEqual({
      statut: 'enregistre',
      chemin: 'test.json',
    });
    expect(deps.demanderEnregistrement).toHaveBeenCalledWith('test.json', 'modele');
    const texte = new TextDecoder().decode(ecrits.get('test.json'));
    expect(texte.endsWith('}\n')).toBe(true);
    expect(JSON.parse(texte)).toEqual(MODELE);
    expect(await service.ouvrirModele('test.json')).toEqual({ ok: true, modele: MODELE });
  });

  it('refuse un modèle incomplet, respecte l’annulation et signale un échec d’écriture', async () => {
    expect(await creerService(dependances().deps).enregistrerModele({ nom: '' })).toMatchObject({
      statut: 'erreur',
      message: expect.stringMatching(/^Modèle incomplet : /) as unknown,
    });
    const annule = creerService(
      dependances({ demanderEnregistrement: () => Promise.resolve(null) }).deps,
    );
    expect(await annule.enregistrerModele(MODELE)).toEqual({ statut: 'annule' });
    const bloque = creerService(
      dependances({ ecrireFichier: () => Promise.reject(new Error('EACCES')) }).deps,
    );
    expect(await bloque.enregistrerModele(MODELE)).toEqual({
      statut: 'erreur',
      message: 'Enregistrement impossible : EACCES',
    });
  });
});
