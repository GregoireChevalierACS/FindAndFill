/**
 * Outils XML minimaux pour retoucher les parties d'un classeur OOXML sans les réécrire en entier.
 * On ne reconstruit jamais un document : on remplace des fragments précis et on garde le reste à l'octet près.
 */

const ATTRIBUT = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function lireAttributs(texte: string): Map<string, string> {
  const attributs = new Map<string, string>();
  for (const [, nom = '', guillemets, apostrophes] of texte.matchAll(ATTRIBUT)) {
    attributs.set(nom, decoderEntites(guillemets ?? apostrophes ?? ''));
  }
  return attributs;
}

const ENTITES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

export function decoderEntites(texte: string): string {
  return texte.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, entite: string) => {
    if (entite.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(entite.slice(2), 16));
    }
    if (entite.startsWith('#')) {
      return String.fromCodePoint(Number(entite.slice(1)));
    }
    return ENTITES[entite] ?? '';
  });
}

/** Concatène le texte des éléments <t> d'un fragment (chaîne simple ou texte enrichi), sans la phonétique. */
export function texteDesRuns(fragment: string): string {
  const sansPhonetique = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...sansPhonetique.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map(([, texte = '']) => decoderEntites(texte))
    .join('');
}

export interface Element {
  /** Texte des attributs, tel qu'écrit. */
  readonly attributs: string;
  /** Contenu entre les balises ouvrante et fermante, ou `null` pour un élément vide `<x/>`. */
  readonly contenu: string | null;
}

/** Éléments `<nom …>` de premier niveau d'un fragment, sans imbrication du même nom. */
export function elements(fragment: string, nom: string): Element[] {
  const motif = new RegExp(`<${nom}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${nom}>)`, 'g');
  return [...fragment.matchAll(motif)].map(([, attributs = '', contenu]) => ({
    attributs,
    contenu: contenu ?? null,
  }));
}
