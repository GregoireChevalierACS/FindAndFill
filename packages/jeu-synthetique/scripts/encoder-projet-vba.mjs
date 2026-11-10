// Régénère src/projet-vba.ts à partir de ressources/vbaProject.bin.
// Le projet VBA est intégré au code pour fonctionner aussi une fois empaqueté (Electron).
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const base64 = readFileSync(new URL('../ressources/vbaProject.bin', import.meta.url)).toString(
  'base64',
);
const lignes = base64.match(/.{1,96}/g).map((ligne) => `  '${ligne}',`);
writeFileSync(
  new URL('../src/projet-vba.ts', import.meta.url),
  [
    '// Fichier généré par scripts/encoder-projet-vba.mjs depuis ressources/vbaProject.bin : ne pas modifier.',
    '// Projet VBA tiré de XlsxWriter (licence BSD-2-Clause, voir ressources/LICENCE-XlsxWriter.txt).',
    'export const PROJET_VBA_BASE64 = [',
    ...lignes,
    "].join('');",
    '',
  ].join('\n'),
);
