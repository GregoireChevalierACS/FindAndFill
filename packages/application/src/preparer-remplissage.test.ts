import type { CelluleARemplir, Classeur, ModeleRemplissage } from '@findandfill/domain';
import { describe, expect, it, vi } from 'vitest';
import type { FichierEntrant, GabaritOuvert, LecteurSources, OuvreurGabarit } from './ports.js';
import { preparerRemplissage } from './preparer-remplissage.js';

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

const fichier = (nom: string): FichierEntrant => ({ nom, octets: new Uint8Array([1]) });
const SOURCE: Classeur = { feuilles: [{ nom: '', lignes: [['Montant'], [10], [2.5]] }] };

function gabarit(contenu: 'vide' | 'formule' = 'vide') {
  const ecrire = vi.fn<(cellules: readonly CelluleARemplir[]) => Promise<Uint8Array>>(() =>
    Promise.resolve(new Uint8Array([42])),
  );
  const ouvert: GabaritOuvert = {
    onglets: () => ['R'],
    colonne: () => new Map(),
    contenu: () => contenu,
    ecrire,
  };
  return { ouvert, ecrire };
}

function ports(
  lire: LecteurSources['lire'],
  ouvrir: OuvreurGabarit['ouvrir'],
): { lecteur: LecteurSources; ouvreur: OuvreurGabarit } {
  return { lecteur: { lire }, ouvreur: { ouvrir } };
}

const demande = {
  modele: MODELE,
  sources: new Map([['ventes', fichier('ventes.csv')]]),
  gabarit: fichier('reporting.xlsx'),
};

describe('preparerRemplissage', () => {
  it('calcule un aperçu sans écrire, puis écrit à la confirmation', async () => {
    const { ouvert, ecrire } = gabarit();
    const lire = vi.fn(() => Promise.resolve(SOURCE));
    const preparation = await preparerRemplissage(
      demande,
      ports(lire, () => Promise.resolve(ouvert)),
    );
    if (!preparation.ok) throw new Error(JSON.stringify(preparation.erreurs));
    expect(lire).toHaveBeenCalledWith(demande.sources.get('ventes'));
    expect(preparation.cellules).toEqual([
      {
        onglet: 'R',
        adresse: 'B2',
        valeur: 1250,
        provenance: { regle: 'total', source: 'ventes', lignes: [2, 3] },
      },
    ]);
    expect(preparation.avertissements).toEqual([]);
    expect(ecrire).not.toHaveBeenCalled();

    expect(await preparation.confirmer()).toEqual(new Uint8Array([42]));
    expect(ecrire).toHaveBeenCalledWith(preparation.cellules);
  });

  it('transforme une source illisible en erreur', async () => {
    const preparation = await preparerRemplissage(
      demande,
      ports(
        () => Promise.reject(new Error('archive corrompue')),
        () => Promise.resolve(gabarit().ouvert),
      ),
    );
    expect(preparation).toEqual({
      ok: false,
      erreurs: [
        { nature: 'fichier-illisible', fichier: 'ventes.csv', detail: 'archive corrompue' },
      ],
    });
  });

  it('transforme un gabarit illisible en erreur, même sans message', async () => {
    const preparation = await preparerRemplissage(
      demande,
      ports(
        () => Promise.resolve(SOURCE),
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- cas d'un adapter mal élevé
        () => Promise.reject('refus'),
      ),
    );
    expect(preparation).toEqual({
      ok: false,
      erreurs: [{ nature: 'fichier-illisible', fichier: 'reporting.xlsx', detail: 'refus' }],
    });
  });

  it('signale ensemble une source et un gabarit illisibles', async () => {
    const preparation = await preparerRemplissage(
      demande,
      ports(
        () => Promise.reject(new Error('a')),
        () => Promise.reject(new Error('b')),
      ),
    );
    expect(!preparation.ok && preparation.erreurs.map((e) => 'fichier' in e && e.fichier)).toEqual([
      'ventes.csv',
      'reporting.xlsx',
    ]);
  });

  it('renvoie les erreurs du domaine sans écrire', async () => {
    const { ouvert, ecrire } = gabarit('formule');
    const preparation = await preparerRemplissage(
      demande,
      ports(
        () => Promise.resolve(SOURCE),
        () => Promise.resolve(ouvert),
      ),
    );
    expect(preparation).toEqual({
      ok: false,
      erreurs: [{ nature: 'cible-formule', regle: 'total', onglet: 'R', adresse: 'B2' }],
    });
    expect(ecrire).not.toHaveBeenCalled();
  });

  it('signale une source du modèle sans fichier fourni', async () => {
    const preparation = await preparerRemplissage(
      { ...demande, sources: new Map() },
      ports(
        () => Promise.resolve(SOURCE),
        () => Promise.resolve(gabarit().ouvert),
      ),
    );
    expect(preparation).toEqual({
      ok: false,
      erreurs: [{ nature: 'source-absente', source: 'ventes' }],
    });
  });
});
