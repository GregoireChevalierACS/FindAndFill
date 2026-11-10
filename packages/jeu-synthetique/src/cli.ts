import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CHEMINS, genererJeuComplet, GRAINE_PAR_DEFAUT } from './catalogue.js';

const SORTIE_PAR_DEFAUT = fileURLToPath(new URL('../../../donnees-synthetiques', import.meta.url));

const { values } = parseArgs({
  options: {
    graine: { type: 'string', default: String(GRAINE_PAR_DEFAUT) },
    sortie: { type: 'string', default: SORTIE_PAR_DEFAUT },
  },
});

const graine = Number(values.graine);
if (!Number.isSafeInteger(graine)) {
  throw new Error(`Graine invalide : ${values.graine}`);
}
const sortie = resolve(values.sortie);

// On ne vide que un dossier déjà produit par ce générateur (reconnaissable à son manifeste).
if (existsSync(sortie) && (await readdir(sortie)).length > 0) {
  if (!existsSync(join(sortie, CHEMINS.manifeste))) {
    throw new Error(
      `${sortie} n'est pas vide et ne contient pas de ${CHEMINS.manifeste} : abandon.`,
    );
  }
  await rm(sortie, { recursive: true });
}

const { fichiers, manifeste } = await genererJeuComplet(graine);
for (const { chemin, contenu } of fichiers) {
  const cible = join(sortie, chemin);
  await mkdir(dirname(cible), { recursive: true });
  await writeFile(cible, contenu);
}

console.log(`Jeu synthétique (graine ${graine}) écrit dans ${sortie}`);
console.log(`${fichiers.length} fichiers, ${manifeste.cas.length} cas :`);
for (const cas of manifeste.cas) {
  console.log(`  - ${cas.id} (${cas.type})`);
}
