import type { FichierEntrant, LecteurPdf } from '@findandfill/application';
import type { FragmentDeTexte, TexteDuPdf } from '@findandfill/domain';
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** pdf.js type ses matrices en `any[]` : chaque coefficient est vérifié avant usage. */
export function coefficients(
  matrice: readonly unknown[],
): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = matrice.map((valeur) => (typeof valeur === 'number' ? valeur : 0));
  return [a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0];
}

/**
 * Extrait le texte d'un PDF avec pdf.js (build « legacy », prévue pour Node). Chaque fragment
 * garde sa position, ramenée à une origine en haut à gauche de la page : celle que les modèles
 * de lecture utilisent. Les fragments vides (espaces de mise en page) sont ignorés.
 */
export async function lirePdfTexte(octets: Uint8Array): Promise<TexteDuPdf> {
  const chargement = getDocument({
    // pdf.js transfère le tampon qu'on lui donne : une copie laisse l'original intact.
    data: new Uint8Array(octets),
    useSystemFonts: false,
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    const document = await chargement.promise;
    const fragments: FragmentDeTexte[] = [];
    for (let numero = 1; numero <= document.numPages; numero++) {
      const page = await document.getPage(numero);
      const vue = page.getViewport({ scale: 1 });
      const contenu = await page.getTextContent();
      for (const element of contenu.items) {
        if (!('str' in element) || element.str.trim() === '') continue;
        // Dans le repère de la vue, y est la ligne de base du texte, compté depuis le haut.
        const [a, b, c, d, e, f] = coefficients(vue.transform);
        const [, , , , tx, ty] = coefficients(element.transform);
        const x = a * tx + c * ty + e;
        const ligneDeBase = b * tx + d * ty + f;
        fragments.push({
          page: numero,
          x,
          y: ligneDeBase - element.height,
          largeur: element.width,
          hauteur: element.height,
          texte: element.str,
        });
      }
    }
    return { pages: document.numPages, fragments };
  } finally {
    await chargement.destroy();
  }
}

/** Lecteur de PDF texte. Un PDF scanné se lit sans erreur, mais sans aucun fragment. */
export const lecteurPdf: LecteurPdf = {
  async lire(fichier: FichierEntrant): Promise<TexteDuPdf> {
    try {
      return await lirePdfTexte(fichier.octets);
    } catch (erreur) {
      const cause = erreur instanceof Error ? erreur.message : String(erreur);
      throw new Error(`PDF illisible : « ${fichier.nom} » (${cause}).`, { cause: erreur });
    }
  },
};
