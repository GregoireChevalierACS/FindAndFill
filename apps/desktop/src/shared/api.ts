import type { ErreurPreparation } from '@findandfill/application';
import type { Avertissement, CelluleARemplir, ModeleRemplissage } from '@findandfill/domain';

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

export interface ApiFindAndFill {
  choisirFichier(type: TypeFichier): Promise<string | null>;
  ouvrirModele(chemin: string): Promise<ResultatModele>;
  preparer(demande: DemandePreparation): Promise<ResultatPreparation>;
  confirmer(jeton: string): Promise<ResultatConfirmation>;
  chargerDemonstration(): Promise<Demonstration>;
}

export const CANAUX = {
  choisirFichier: 'fichier:choisir',
  ouvrirModele: 'modele:ouvrir',
  preparer: 'remplissage:preparer',
  confirmer: 'remplissage:confirmer',
  chargerDemonstration: 'demonstration:charger',
} as const satisfies Record<keyof ApiFindAndFill, string>;
