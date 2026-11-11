import {
  preparerRemplissage,
  type FichierEntrant,
  type LecteurSources,
  type OuvreurGabarit,
} from '@findandfill/application';
import { basename, dirname, extname, join } from 'node:path';
import type {
  ErreurInterface,
  ResultatConfirmation,
  ResultatModele,
  ResultatPreparation,
} from '../shared/api.js';
import { validerModele } from './schema-modele.js';

export interface DependancesService {
  readonly lireFichier: (chemin: string) => Promise<Uint8Array>;
  readonly ecrireFichier: (chemin: string, octets: Uint8Array) => Promise<void>;
  /** Demande où enregistrer ; `null` si l'utilisateur annule. */
  readonly demanderEnregistrement: (cheminPropose: string) => Promise<string | null>;
  readonly creerJeton: () => string;
  readonly lecteur: LecteurSources;
  readonly ouvreur: OuvreurGabarit;
}

function message(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/** Nom proposé pour le gabarit rempli : « reporting.xlsm » → « reporting - rempli.xlsm ». */
export function cheminPropose(gabarit: string): string {
  const extension = extname(gabarit);
  return join(dirname(gabarit), `${basename(gabarit, extension)} - rempli${extension}`);
}

/**
 * Logique du processus principal, indépendante d'Electron : lit les fichiers, prépare l'aperçu,
 * et n'écrit qu'à la confirmation du dernier aperçu.
 */
export function creerService(dependances: DependancesService) {
  let enAttente: { jeton: string; gabarit: string; confirmer: () => Promise<Uint8Array> } | null =
    null;

  async function entrant(
    chemin: string,
    erreurs: ErreurInterface[],
  ): Promise<FichierEntrant | null> {
    try {
      return { nom: basename(chemin), octets: await dependances.lireFichier(chemin) };
    } catch (erreur) {
      erreurs.push({ nature: 'fichier-illisible', fichier: chemin, detail: message(erreur) });
      return null;
    }
  }

  return {
    async ouvrirModele(chemin: string): Promise<ResultatModele> {
      let donnees: unknown;
      try {
        donnees = JSON.parse(new TextDecoder().decode(await dependances.lireFichier(chemin)));
      } catch (erreur) {
        return { ok: false, message: `Fichier de modèle illisible : ${message(erreur)}` };
      }
      const validation = validerModele(donnees);
      return validation.ok
        ? { ok: true, modele: validation.modele }
        : { ok: false, message: `Modèle invalide : ${validation.detail}` };
    },

    async preparer(demande: unknown): Promise<ResultatPreparation> {
      enAttente = null;
      // La demande vient de l'interface : on n'en suppose rien avant de l'avoir vérifiée.
      const brute = (typeof demande === 'object' && demande !== null ? demande : {}) as {
        modele?: unknown;
        sources?: unknown;
        gabarit?: unknown;
      };
      const validation = validerModele(brute.modele);
      if (!validation.ok) {
        return { ok: false, erreurs: [{ nature: 'modele-invalide', detail: validation.detail }] };
      }
      const chemins =
        typeof brute.sources === 'object' && brute.sources !== null
          ? Object.entries(brute.sources).filter(
              (entree): entree is [string, string] => typeof entree[1] === 'string',
            )
          : [];
      const gabarit = typeof brute.gabarit === 'string' ? brute.gabarit : '';

      const erreurs: ErreurInterface[] = [];
      const sources = new Map<string, FichierEntrant>();
      for (const [id, chemin] of chemins) {
        const fichier = await entrant(chemin, erreurs);
        if (fichier !== null) {
          sources.set(id, fichier);
        }
      }
      const fichierGabarit = await entrant(gabarit, erreurs);
      if (fichierGabarit === null || erreurs.length > 0) {
        return { ok: false, erreurs };
      }

      const preparation = await preparerRemplissage(
        { modele: validation.modele, sources, gabarit: fichierGabarit },
        { lecteur: dependances.lecteur, ouvreur: dependances.ouvreur },
      );
      if (!preparation.ok) {
        return { ok: false, erreurs: preparation.erreurs };
      }
      const jeton = dependances.creerJeton();
      enAttente = { jeton, gabarit, confirmer: preparation.confirmer };
      return {
        ok: true,
        jeton,
        cellules: preparation.cellules,
        avertissements: preparation.avertissements,
      };
    },

    async confirmer(jeton: unknown): Promise<ResultatConfirmation> {
      if (enAttente === null || enAttente.jeton !== jeton) {
        return {
          statut: 'erreur',
          message: 'Cet aperçu n’est plus à jour : préparez-le de nouveau avant d’enregistrer.',
        };
      }
      const { gabarit, confirmer } = enAttente;
      const chemin = await dependances.demanderEnregistrement(cheminPropose(gabarit));
      if (chemin === null) {
        return { statut: 'annule' };
      }
      if (chemin === gabarit) {
        return {
          statut: 'erreur',
          message:
            'Enregistrez le résultat sous un autre nom : le gabarit d’origine doit rester vierge.',
        };
      }
      try {
        await dependances.ecrireFichier(chemin, await confirmer());
      } catch (erreur) {
        return { statut: 'erreur', message: `Enregistrement impossible : ${message(erreur)}` };
      }
      return { statut: 'enregistre', chemin };
    },
  };
}
