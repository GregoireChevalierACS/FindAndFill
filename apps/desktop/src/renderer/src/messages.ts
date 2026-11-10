import {
  LIGNES_EXPLOREES,
  type Avertissement,
  type ChangementStructure,
  type ModeleRemplissage,
} from '@findandfill/domain';
import type { ErreurInterface } from '../../shared/api.js';

/** Textes affichés à l'utilisateur : ce qui s'est passé, et quoi faire. */

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export function formaterMontant(centimes: number): string {
  return EUROS.format(centimes / 100);
}

export function nomDeFichier(chemin: string): string {
  return chemin.slice(Math.max(chemin.lastIndexOf('/'), chemin.lastIndexOf('\\')) + 1);
}

function liste(elements: readonly string[]): string {
  return elements.map((element) => `« ${element} »`).join(', ');
}

/** « ligne 3 », « lignes 3, 5 à 8 », ou « 42 lignes (3 à 120) » quand la liste est longue. */
export function resumerLignes(lignes: readonly number[]): string {
  if (lignes.length === 0) {
    return 'aucune ligne';
  }
  const triees = [...new Set(lignes)].sort((a, b) => a - b);
  const plages: [number, number][] = [];
  for (const ligne of triees) {
    const derniere = plages.at(-1);
    if (derniere !== undefined && ligne === derniere[1] + 1) {
      derniere[1] = ligne;
    } else {
      plages.push([ligne, ligne]);
    }
  }
  if (plages.length > 4) {
    return `${triees.length} lignes (${triees[0]} à ${triees.at(-1)})`;
  }
  const texte = plages.map(([debut, fin]) => (debut === fin ? `${debut}` : `${debut} à ${fin}`));
  return `${triees.length === 1 ? 'ligne' : 'lignes'} ${texte.join(', ')}`;
}

export function decrireChangement(changement: ChangementStructure): string {
  switch (changement.nature) {
    case 'onglet-introuvable':
      return changement.ongletsDisponibles.length === 0
        ? 'Le fichier ne contient aucune feuille.'
        : `L’onglet « ${changement.onglet} » est introuvable. Onglets présents : ${liste(changement.ongletsDisponibles)}.`;
    case 'entetes-introuvables':
      return `La ligne d’en-têtes attendue est introuvable dans les ${LIGNES_EXPLOREES} premières lignes.`;
    case 'colonnes-ajoutees':
      return `Colonne(s) ajoutée(s) : ${liste(changement.colonnes)}.`;
    case 'colonnes-supprimees':
      return `Colonne(s) disparue(s) : ${liste(changement.colonnes)}.`;
    case 'colonnes-deplacees':
      return `Colonne(s) déplacée(s) : ${liste(changement.colonnes)}.`;
  }
}

export interface MessageErreur {
  readonly titre: string;
  readonly details: readonly string[];
  readonly conseil: string;
}

const CORRIGER_MODELE = 'Le modèle ne correspond pas à ses sources ou à son gabarit : corrigez-le.';

export function decrireErreur(
  erreur: ErreurInterface,
  modele: ModeleRemplissage | null,
): MessageErreur {
  const libelle = (id: string) => modele?.sources.find((s) => s.id === id)?.libelle ?? id;
  switch (erreur.nature) {
    case 'modele-invalide':
      return {
        titre: 'Le modèle est invalide.',
        details: [erreur.detail],
        conseil: CORRIGER_MODELE,
      };
    case 'fichier-illisible':
      return {
        titre: `Impossible de lire « ${nomDeFichier(erreur.fichier)} ».`,
        details: [erreur.detail],
        conseil:
          'Vérifiez que le fichier existe, qu’il n’est pas endommagé et qu’il est au bon format.',
      };
    case 'source-absente':
      return {
        titre: `Aucun fichier choisi pour « ${libelle(erreur.source)} ».`,
        details: [],
        conseil: 'Choisissez le fichier de cette source.',
      };
    case 'structure-modifiee':
      return {
        titre: `La structure de « ${libelle(erreur.source)} » a changé : rien n’a été rempli.`,
        details: erreur.changements.map(decrireChangement),
        conseil:
          'Vérifiez qu’il s’agit du bon fichier. Si le format de l’export a vraiment changé, mettez le modèle à jour.',
      };
    case 'source-inconnue':
      return {
        titre: `La règle « ${erreur.regle} » utilise la source « ${erreur.source} », absente du modèle.`,
        details: [],
        conseil: CORRIGER_MODELE,
      };
    case 'colonne-inconnue':
      return {
        titre: `La règle « ${erreur.regle} » utilise la colonne « ${erreur.colonne} », absente de sa source.`,
        details: [],
        conseil: CORRIGER_MODELE,
      };
    case 'onglet-cible-introuvable':
      return {
        titre: `L’onglet « ${erreur.onglet} » est introuvable dans le gabarit.`,
        details: [`Règle « ${erreur.regle} ».`],
        conseil: 'Vérifiez que vous avez choisi le bon gabarit.',
      };
    case 'valeur-illisible':
      return {
        titre: `Valeur illisible ligne ${erreur.ligne}, colonne « ${erreur.colonne} » : « ${erreur.valeur} ».`,
        details: [`Règle « ${erreur.regle} ».`],
        conseil:
          'Corrigez cette cellule dans le fichier source, ou vérifiez que c’est le bon fichier.',
      };
    case 'cible-formule':
      return {
        titre: `La cellule ${erreur.onglet}!${erreur.adresse} du gabarit contient une formule.`,
        details: [`Règle « ${erreur.regle} ».`],
        conseil: 'Le modèle ne doit écrire que dans des cellules de saisie : corrigez cette règle.',
      };
    case 'cible-en-double':
      return {
        titre: `Plusieurs règles écrivent dans la cellule ${erreur.onglet}!${erreur.adresse}.`,
        details: [`Règle « ${erreur.regle} ».`],
        conseil: CORRIGER_MODELE,
      };
  }
}

export function decrireAvertissement(
  avertissement: Avertissement,
  modele: ModeleRemplissage | null,
): string {
  switch (avertissement.nature) {
    case 'cle-absente-de-la-cible': {
      const cle = avertissement.cle === '' ? '(vide)' : `« ${avertissement.cle} »`;
      return `${cle} n’a pas de ligne dans le gabarit : ${formaterMontant(avertissement.montant)} non reportés (${resumerLignes(avertissement.lignes)}, règle « ${avertissement.regle} »).`;
    }
    case 'hors-periode':
      return `${resumerLignes(avertissement.lignes)} hors de l’exercice ${modele?.annee ?? ''} ignorée(s) (règle « ${avertissement.regle} »).`;
  }
}
