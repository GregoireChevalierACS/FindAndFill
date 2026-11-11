import type { ErreurPreparation } from '@findandfill/application';
import type { CelluleGrille } from '@findandfill/adapters-fichiers';
import type {
  Avertissement,
  CelluleARemplir,
  ModeleRemplissage,
  ValeurCellule,
} from '@findandfill/domain';

/**
 * Contrat entre l'interface (renderer) et le processus principal.
 * L'interface n'accède jamais au disque : tout passe par ces appels.
 */

export type TypeFichier = 'modele' | 'source' | 'gabarit';

export type ErreurInterface =
  ErreurPreparation | { readonly nature: 'modele-invalide'; readonly detail: string };

export interface DemandePreparation {
  readonly modele: ModeleRemplissage;
  /** Chemin du fichier choisi pour chaque source du modèle. */
  readonly sources: Readonly<Record<string, string>>;
  readonly gabarit: string;
}

export type ResultatPreparation =
  | { readonly ok: false; readonly erreurs: readonly ErreurInterface[] }
  | {
      readonly ok: true;
      /** À rendre lors de la confirmation ; seul le dernier aperçu peut être confirmé. */
      readonly jeton: string;
      readonly cellules: readonly CelluleARemplir[];
      readonly avertissements: readonly Avertissement[];
    };

export type ResultatConfirmation =
  | { readonly statut: 'enregistre'; readonly chemin: string }
  | { readonly statut: 'annule' }
  | { readonly statut: 'erreur'; readonly message: string };

export type ResultatModele =
  | { readonly ok: true; readonly modele: ModeleRemplissage }
  | { readonly ok: false; readonly message: string };

export interface Demonstration {
  readonly dossier: string;
  readonly modele: ModeleRemplissage;
  readonly sources: Readonly<Record<string, string>>;
  readonly gabarit: string;
}

/** Début d'une feuille source, pour choisir la ligne d'en-têtes. */
export interface ApercuFeuille {
  readonly nom: string;
  readonly lignes: readonly (readonly ValeurCellule[])[];
  /** Ligne d'en-têtes proposée (indice à partir de 0), ou `null`. */
  readonly ligneEntetesProposee: number | null;
}

export type ResultatApercuSource =
  | { readonly ok: true; readonly feuilles: readonly ApercuFeuille[] }
  | { readonly ok: false; readonly message: string };

export interface ApercuOnglet {
  readonly nom: string;
  readonly grille: readonly (readonly CelluleGrille[])[];
}

export type ResultatApercuGabarit =
  | { readonly ok: true; readonly onglets: readonly ApercuOnglet[] }
  | { readonly ok: false; readonly message: string };

export interface ApiFindAndFill {
  choisirFichier(type: TypeFichier): Promise<string | null>;
  ouvrirModele(chemin: string): Promise<ResultatModele>;
  preparer(demande: DemandePreparation): Promise<ResultatPreparation>;
  confirmer(jeton: string): Promise<ResultatConfirmation>;
  chargerDemonstration(): Promise<Demonstration>;
  apercuSource(chemin: string): Promise<ResultatApercuSource>;
  apercuGabarit(chemin: string): Promise<ResultatApercuGabarit>;
  enregistrerModele(modele: ModeleRemplissage): Promise<ResultatConfirmation>;
}

export const CANAUX = {
  choisirFichier: 'fichier:choisir',
  ouvrirModele: 'modele:ouvrir',
  preparer: 'remplissage:preparer',
  confirmer: 'remplissage:confirmer',
  chargerDemonstration: 'demonstration:charger',
  apercuSource: 'source:apercu',
  apercuGabarit: 'gabarit:apercu',
  enregistrerModele: 'modele:enregistrer',
} as const satisfies Record<keyof ApiFindAndFill, string>;
