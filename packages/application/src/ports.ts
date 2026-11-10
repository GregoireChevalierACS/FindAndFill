import type { CelluleARemplir, Classeur, VueCible } from '@findandfill/domain';

/** Un fichier fourni par l'utilisateur : son nom (pour l'extension et les messages) et son contenu. */
export interface FichierEntrant {
  readonly nom: string;
  readonly octets: Uint8Array;
}

/** Lit un fichier source (Excel, CSV, FEC…) en vue neutre. Rejette si le fichier est illisible. */
export interface LecteurSources {
  lire(fichier: FichierEntrant): Promise<Classeur>;
}

/** Gabarit ouvert : consultable sans modification, puis écrit en une fois. */
export interface GabaritOuvert extends VueCible {
  /** Renvoie le contenu du gabarit rempli ; seules les cellules données changent. */
  ecrire(cellules: readonly CelluleARemplir[]): Promise<Uint8Array>;
}

export interface OuvreurGabarit {
  ouvrir(fichier: FichierEntrant): Promise<GabaritOuvert>;
}
