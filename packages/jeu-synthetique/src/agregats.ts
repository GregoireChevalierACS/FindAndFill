import { moisDe } from './dates.js';
import { COMPTES, type Affaire, type Centimes, type JeuDeDonnees } from './modele.js';

export function commandeEur(affaire: Affaire): Centimes {
  return affaire.echeances.reduce((total, echeance) => total + echeance.montantEur, 0);
}

export function factureEur(jeu: JeuDeDonnees, affaire: Affaire): Centimes {
  return jeu.ventes
    .filter((vente) => vente.affaire.code === affaire.code)
    .reduce((total, vente) => total + vente.htEur, 0);
}

/** Tableau de 12 cumuls mensuels (janvier en position 0). */
function parMois<T>(elements: readonly T[], date: (e: T) => string, montant: (e: T) => Centimes) {
  const cumuls: Centimes[] = Array.from({ length: 12 }, () => 0);
  for (const element of elements) {
    const indice = moisDe(date(element)) - 1;
    cumuls[indice] = (cumuls[indice] ?? 0) + montant(element);
  }
  return cumuls;
}

export function caMensuel(jeu: JeuDeDonnees, affaire: Affaire): Centimes[] {
  return parMois(
    jeu.ventes.filter((vente) => vente.affaire.code === affaire.code),
    (vente) => vente.date,
    (vente) => vente.htEur,
  );
}

export function achatsMensuels(jeu: JeuDeDonnees, codeFournisseur: string): Centimes[] {
  return parMois(
    jeu.achats.filter((achat) => achat.fournisseur.code === codeFournisseur),
    (achat) => achat.date,
    (achat) => achat.ht,
  );
}

/** Mouvements du compte banque lus dans les écritures, hors à-nouveaux. */
export function tresorerieMensuelle(jeu: JeuDeDonnees): {
  soldeInitial: Centimes;
  encaissements: Centimes[];
  decaissements: Centimes[];
} {
  const lignes = jeu.ecritures.flatMap((ecriture) =>
    ecriture.lignes
      .filter((ligne) => ligne.compte === COMPTES.banque.compte)
      .map((ligne) => ({ ...ligne, date: ecriture.date, journal: ecriture.journal.code })),
  );
  const courantes = lignes.filter((ligne) => ligne.journal !== 'AN');
  return {
    soldeInitial: lignes
      .filter((ligne) => ligne.journal === 'AN')
      .reduce((total, ligne) => total + ligne.debit - ligne.credit, 0),
    encaissements: parMois(
      courantes,
      (l) => l.date,
      (l) => l.debit,
    ),
    decaissements: parMois(
      courantes,
      (l) => l.date,
      (l) => l.credit,
    ),
  };
}
