import { COLONNE_MAX, lireAdresse, numeroColonne } from './colonnes.js';
import type { ModeleRemplissage, Regle } from './modele-remplissage.js';

/**
 * Vérifications d'un modèle sans ouvrir aucun fichier : ce que l'éditeur signale au fil de la saisie.
 * Les vérifications qui demandent les fichiers (structure, onglets du gabarit…) restent au remplissage.
 */
export type ProblemeModele =
  | { readonly nature: 'aucune-source' }
  | { readonly nature: 'aucune-regle' }
  | {
      readonly nature: 'identifiant-en-double';
      readonly quoi: 'source' | 'regle';
      readonly id: string;
    }
  | { readonly nature: 'entetes-vides'; readonly source: string }
  | { readonly nature: 'entete-en-double'; readonly source: string; readonly entete: string }
  | { readonly nature: 'source-inconnue'; readonly regle: string; readonly source: string }
  | { readonly nature: 'colonne-inconnue'; readonly regle: string; readonly colonne: string }
  | {
      readonly nature: 'cible-invalide';
      readonly regle: string;
      readonly champ: string;
      readonly valeur: string;
    };

function doublons(valeurs: readonly string[]): string[] {
  return [...new Set(valeurs.filter((valeur, index) => valeurs.indexOf(valeur) !== index))];
}

function colonnesUtilisees(regle: Regle): string[] {
  return [
    regle.montant.plus,
    ...(regle.montant.moins === undefined ? [] : [regle.montant.moins]),
    ...('cle' in regle ? [regle.cle] : []),
    ...('date' in regle ? [regle.date] : []),
    ...(regle.filtres ?? []).map((filtre) => filtre.colonne),
  ];
}

function colonneValide(lettres: string, marge = 0): boolean {
  try {
    return numeroColonne(lettres) + marge <= COLONNE_MAX;
  } catch {
    return false;
  }
}

function adresseValide(adresse: string): boolean {
  try {
    lireAdresse(adresse);
    return true;
  } catch {
    return false;
  }
}

/** Champs de cible invalides : nom du champ et valeur fautive. */
function ciblesInvalides(regle: Regle): [string, string][] {
  switch (regle.type) {
    case 'mensuel-par-cle':
      return [
        ...(colonneValide(regle.cible.colonneCles)
          ? []
          : [['colonneCles', regle.cible.colonneCles]]),
        // Les douze mois doivent tenir dans la feuille.
        ...(colonneValide(regle.cible.premiereColonneMois, 11)
          ? []
          : [['premiereColonneMois', regle.cible.premiereColonneMois]]),
      ] as [string, string][];
    case 'mensuel':
      return [
        ...(colonneValide(regle.cible.colonne) ? [] : [['colonne', regle.cible.colonne]]),
        ...(Number.isInteger(regle.cible.ligneJanvier) && regle.cible.ligneJanvier >= 1
          ? []
          : [['ligneJanvier', String(regle.cible.ligneJanvier)]]),
      ] as [string, string][];
    case 'par-cle':
      return [
        ...(colonneValide(regle.cible.colonneCles)
          ? []
          : [['colonneCles', regle.cible.colonneCles]]),
        ...(colonneValide(regle.cible.colonne) ? [] : [['colonne', regle.cible.colonne]]),
      ] as [string, string][];
    case 'total':
      return adresseValide(regle.cible.adresse) ? [] : [['adresse', regle.cible.adresse]];
  }
}

export function verifierModele(modele: ModeleRemplissage): ProblemeModele[] {
  const problemes: ProblemeModele[] = [];
  if (modele.sources.length === 0) {
    problemes.push({ nature: 'aucune-source' });
  }
  if (modele.regles.length === 0) {
    problemes.push({ nature: 'aucune-regle' });
  }
  for (const id of doublons(modele.sources.map((s) => s.id))) {
    problemes.push({ nature: 'identifiant-en-double', quoi: 'source', id });
  }
  for (const id of doublons(modele.regles.map((r) => r.id))) {
    problemes.push({ nature: 'identifiant-en-double', quoi: 'regle', id });
  }
  for (const source of modele.sources) {
    if (source.empreinte.entetes.every((entete) => entete === '')) {
      problemes.push({ nature: 'entetes-vides', source: source.id });
    }
    for (const entete of doublons(source.empreinte.entetes.filter((e) => e !== ''))) {
      problemes.push({ nature: 'entete-en-double', source: source.id, entete });
    }
  }
  for (const regle of modele.regles) {
    const source = modele.sources.find((s) => s.id === regle.source);
    if (source === undefined) {
      problemes.push({ nature: 'source-inconnue', regle: regle.id, source: regle.source });
    } else {
      for (const colonne of new Set(colonnesUtilisees(regle))) {
        if (!source.empreinte.entetes.includes(colonne)) {
          problemes.push({ nature: 'colonne-inconnue', regle: regle.id, colonne });
        }
      }
    }
    for (const [champ, valeur] of ciblesInvalides(regle)) {
      problemes.push({ nature: 'cible-invalide', regle: regle.id, champ, valeur });
    }
  }
  return problemes;
}
