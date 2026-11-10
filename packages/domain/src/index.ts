export { additionner, centimes, lireMontant, montantDeCellule, type Centimes } from './montant.js';
export { controlerEquilibre, type ControleEquilibre, type LigneEcriture } from './ecriture.js';
export { texteCellule, type Classeur, type Feuille, type ValeurCellule } from './classeur.js';
export {
  ecrireAdresse,
  lettresColonne,
  lireAdresse,
  numeroColonne,
  type Adresse,
} from './colonnes.js';
export { anneeDe, lireDate, moisDe, type DateIso } from './dates.js';
export {
  LIGNES_EXPLOREES,
  repererTableau,
  type ChangementStructure,
  type EmpreinteSource,
  type ResultatReperage,
  type TableauRepere,
} from './structure.js';
export type {
  Filtre,
  Mesure,
  ModeleRemplissage,
  Regle,
  RegleMensuelle,
  RegleMensuelleParCle,
  RegleParCle,
  RegleTotal,
  SourceDuModele,
} from './modele-remplissage.js';
export {
  calculerRemplissage,
  type Avertissement,
  type CelluleARemplir,
  type ErreurRemplissage,
  type Provenance,
  type ResultatRemplissage,
  type VueCible,
} from './remplissage.js';
