import JSZip from 'jszip';

/** Date figée écrite dans les fichiers, pour que deux générations donnent les mêmes octets. */
export const DATE_FIGEE = new Date(Date.UTC(2027, 0, 5, 8, 0, 0));

export type Retouche = (zip: JSZip) => Promise<void>;

export async function lireTexte(zip: JSZip, chemin: string): Promise<string> {
  const fichier = zip.file(chemin);
  if (fichier === null) {
    throw new Error(`Fichier absent de l'archive : ${chemin}`);
  }
  return fichier.async('string');
}

/**
 * Réécrit une archive OOXML avec des dates figées et un ordre de fichiers stable,
 * après une éventuelle retouche de son contenu.
 */
export async function normaliserArchive(contenu: Uint8Array, retouche?: Retouche): Promise<Buffer> {
  const source = await JSZip.loadAsync(contenu);
  if (retouche !== undefined) {
    await retouche(source);
  }
  const chemins = Object.values(source.files)
    .filter((fichier) => !fichier.dir)
    .map((fichier) => fichier.name)
    .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));
  const cible = new JSZip();
  for (const chemin of chemins) {
    const fichier = source.file(chemin);
    if (fichier !== null) {
      cible.file(chemin, await fichier.async('uint8array'), {
        date: DATE_FIGEE,
        createFolders: false,
      });
    }
  }
  return cible.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  });
}

/** `[Content_Types].xml` doit rester en tête de l'archive. */
function rang(chemin: string): number {
  return chemin === '[Content_Types].xml' ? 0 : 1;
}
