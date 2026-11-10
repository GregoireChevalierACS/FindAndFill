import { genererJeuComplet, type Cas } from '@findandfill/jeu-synthetique';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Demonstration } from '../shared/api.js';
import { validerModele } from './schema-modele.js';

export const CAS_DE_DEMONSTRATION = 'reporting-complet-macros';

/**
 * Écrit le jeu synthétique dans un dossier temporaire et renvoie le cas « reporting complet avec macros »,
 * prêt à être préparé : de quoi montrer l'outil sans aucune donnée réelle.
 */
export async function preparerDemonstration(
  dossierParent: string,
  generer: () => ReturnType<typeof genererJeuComplet> = () => genererJeuComplet(),
): Promise<Demonstration> {
  const dossier = await mkdtemp(join(dossierParent, 'findandfill-demo-'));
  const { fichiers, manifeste } = await generer();
  for (const { chemin, contenu } of fichiers) {
    const cible = join(dossier, chemin);
    await mkdir(dirname(cible), { recursive: true });
    await writeFile(cible, contenu);
  }
  const cas = manifeste.cas.find(
    (c): c is Extract<Cas, { type: 'remplissage' }> =>
      c.id === CAS_DE_DEMONSTRATION && c.type === 'remplissage',
  );
  const contenuModele = fichiers.find((f) => f.chemin === cas?.modele)?.contenu;
  if (cas === undefined || contenuModele === undefined) {
    throw new Error(`Cas de démonstration introuvable : ${CAS_DE_DEMONSTRATION}`);
  }
  const validation = validerModele(JSON.parse(contenuModele.toString('utf8')));
  if (!validation.ok) {
    throw new Error(`Modèle de démonstration invalide : ${validation.detail}`);
  }
  return {
    dossier,
    modele: validation.modele,
    sources: Object.fromEntries(
      Object.entries(cas.sources).map(([id, chemin]) => [id, join(dossier, chemin)]),
    ),
    gabarit: join(dossier, cas.gabarit),
  };
}
