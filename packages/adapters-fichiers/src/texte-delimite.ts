import type { Classeur, ValeurCellule } from '@findandfill/domain';

/**
 * Décode un fichier texte : UTF-8 (avec ou sans BOM) si possible, sinon Windows-1252,
 * l'encodage des exports de nombreux logiciels comptables français.
 */
export function decoderTexte(octets: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

/** Séparateurs reconnus, par ordre de préférence en cas d'égalité. */
export const SEPARATEURS = [';', '\t', '|', ','] as const;
export type Separateur = (typeof SEPARATEURS)[number];

/** Choisit le séparateur le plus fréquent hors guillemets dans la première ligne. */
export function detecterSeparateur(texte: string): Separateur {
  const comptes = new Map<string, number>();
  let entreGuillemets = false;
  for (const caractere of texte) {
    if (caractere === '"') {
      entreGuillemets = !entreGuillemets;
    } else if (!entreGuillemets && (caractere === '\n' || caractere === '\r')) {
      break;
    } else if (!entreGuillemets) {
      comptes.set(caractere, (comptes.get(caractere) ?? 0) + 1);
    }
  }
  let meilleur: Separateur = SEPARATEURS[0];
  for (const separateur of SEPARATEURS) {
    if ((comptes.get(separateur) ?? 0) > (comptes.get(meilleur) ?? 0)) {
      meilleur = separateur;
    }
  }
  return meilleur;
}

/** Découpe un texte délimité (guillemets doublés, retours à la ligne entre guillemets, CRLF/LF/CR). */
export function decouper(texte: string, separateur: Separateur): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const caractere = texte.charAt(i);
    if (entreGuillemets) {
      if (caractere === '"' && texte.charAt(i + 1) === '"') {
        champ += '"';
        i++;
      } else if (caractere === '"') {
        entreGuillemets = false;
      } else {
        champ += caractere;
      }
    } else if (caractere === '"') {
      entreGuillemets = true;
    } else if (caractere === separateur) {
      ligne.push(champ);
      champ = '';
    } else if (caractere === '\r' || caractere === '\n') {
      if (caractere === '\r' && texte.charAt(i + 1) === '\n') {
        i++;
      }
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else {
      champ += caractere;
    }
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}

/** Lit un CSV, un TSV ou un FEC en classeur à une feuille sans nom. */
export function lireTexteDelimite(octets: Uint8Array): Classeur {
  // TextDecoder retire déjà le BOM UTF-8 éventuel.
  const texte = decoderTexte(octets);
  const lignes = decouper(texte, detecterSeparateur(texte)).map((ligne) =>
    ligne.map((champ): ValeurCellule => (champ === '' ? null : champ)),
  );
  return { feuilles: [{ nom: '', lignes }] };
}
