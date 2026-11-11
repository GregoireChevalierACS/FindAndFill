import { MODELES_DE_REFERENCE } from '@findandfill/jeu-synthetique';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CAS_DE_DEMONSTRATION, preparerDemonstration } from './demonstration.js';
import { validerModele } from './schema-modele.js';

const parents: string[] = [];

afterAll(async () => {
  await Promise.all(parents.map((dossier) => rm(dossier, { recursive: true, force: true })));
});

describe('preparerDemonstration', () => {
  it('écrit le jeu synthétique et renvoie le cas complet avec des chemins existants', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'findandfill-test-'));
    parents.push(parent);
    const demo = await preparerDemonstration(parent);
    expect(demo.dossier.startsWith(join(parent, 'findandfill-demo-'))).toBe(true);
    expect(demo.modele).toEqual(MODELES_DE_REFERENCE[CAS_DE_DEMONSTRATION]);
    expect(Object.keys(demo.sources).sort()).toEqual(['achats', 'carnet', 'fec', 'ventes']);
    for (const chemin of [...Object.values(demo.sources), demo.gabarit]) {
      expect(existsSync(chemin), chemin).toBe(true);
    }
    expect(demo.gabarit.endsWith('.xlsm')).toBe(true);
  });

  it('échoue clairement si le jeu ne contient pas le cas attendu ou un modèle invalide', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'findandfill-test-'));
    parents.push(parent);
    const manifeste = { graine: 1, mention: '', empreintes: {} };
    const vide = () => Promise.resolve({ fichiers: [], manifeste: { ...manifeste, cas: [] } });
    await expect(preparerDemonstration(parent, vide)).rejects.toThrow(
      'Cas de démonstration introuvable',
    );

    const cas = {
      id: CAS_DE_DEMONSTRATION,
      type: 'remplissage' as const,
      description: '',
      sources: {},
      gabarit: 'g.xlsm',
      modele: 'm.json',
      attendu: 'a.json',
    };
    const invalide = () =>
      Promise.resolve({
        fichiers: [{ chemin: 'm.json', contenu: Buffer.from('{}') }],
        manifeste: { ...manifeste, cas: [cas] },
      });
    await expect(preparerDemonstration(parent, invalide)).rejects.toThrow(
      'Modèle de démonstration invalide',
    );
  });
});

describe('validerModele', () => {
  it('accepte tous les modèles de référence', () => {
    for (const modele of Object.values(MODELES_DE_REFERENCE)) {
      expect(validerModele(JSON.parse(JSON.stringify(modele)))).toEqual({ ok: true, modele });
    }
  });

  it('décrit précisément ce qui ne va pas', () => {
    const [regle] = MODELES_DE_REFERENCE['tresorerie']?.regles ?? [];
    const resultat = validerModele({
      nom: 'x',
      annee: 2026,
      sources: [{ id: 'fec', libelle: 'FEC', empreinte: { entetes: ['A'] } }],
      regles: [{ ...regle, cible: { onglet: 'T', adresse: 'c3' } }],
    });
    expect(resultat).toEqual({
      ok: false,
      detail: 'regles.0.cible.adresse : adresse attendue, ex. « C3 »',
    });
    expect(validerModele(null)).toMatchObject({ ok: false, detail: /^\(racine\) : / });
  });
});
