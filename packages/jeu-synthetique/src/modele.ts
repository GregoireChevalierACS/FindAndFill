import { creerAlea, type Alea } from './alea.js';
import { ajouterJours, dateIso, type DateIso } from './dates.js';

/**
 * Modèle d'une entreprise industrielle fictive : elle vend des lignes de production
 * de boulangerie en France et à l'export, et facture chaque affaire par échéances.
 * Tous les montants sont en centimes entiers.
 */
export type Centimes = number;
export type Devise = 'EUR' | 'USD' | 'GBP';
export type RegimeTva = 'france' | 'intracommunautaire' | 'export';

export const EXERCICE = 2026;
export const DEBUT_EXERCICE: DateIso = dateIso(EXERCICE, 1, 1);
export const FIN_EXERCICE: DateIso = dateIso(EXERCICE, 12, 31);
/** Taux fictifs et fixes : 1 unité de devise vaut ce nombre d'euros. */
export const TAUX_EN_EUR: Readonly<Record<Devise, number>> = { EUR: 1, USD: 0.92, GBP: 1.17 };
export const TAUX_TVA = 0.2;
export const SOLDE_INITIAL_BANQUE: Centimes = 185_000_000;

export const SOCIETE = {
  nom: 'Fournil Industries SAS',
  siren: '999999999',
  mention: 'Entreprise fictive — données synthétiques',
} as const;

export interface Client {
  readonly code: string;
  readonly nom: string;
  readonly pays: string;
  readonly devise: Devise;
  readonly regimeTva: RegimeTva;
}

export interface Fournisseur {
  readonly code: string;
  readonly nom: string;
  readonly compte: string;
  readonly compteLibelle: string;
}

export interface Echeance {
  readonly libelle: string;
  readonly date: DateIso;
  readonly montantDevise: Centimes;
  readonly montantEur: Centimes;
}

export interface Affaire {
  readonly code: string;
  readonly client: Client;
  readonly designation: string;
  readonly dateCommande: DateIso;
  readonly echeances: readonly Echeance[];
}

export interface FactureVente {
  readonly numero: string;
  readonly date: DateIso;
  readonly affaire: Affaire;
  readonly echeance: Echeance;
  readonly htEur: Centimes;
  readonly tvaEur: Centimes;
  readonly ttcEur: Centimes;
  readonly dateEncaissement: DateIso | null;
}

export interface FactureAchat {
  readonly numero: string;
  readonly date: DateIso;
  readonly fournisseur: Fournisseur;
  readonly affaire: Affaire | null;
  readonly ht: Centimes;
  readonly tva: Centimes;
  readonly ttc: Centimes;
  readonly datePaiement: DateIso | null;
}

export interface Salaire {
  readonly date: DateIso;
  readonly montant: Centimes;
}

export interface Journal {
  readonly code: 'AN' | 'VE' | 'AC' | 'BQ';
  readonly libelle: string;
}

export interface LigneEcriture {
  readonly compte: string;
  readonly compteLibelle: string;
  readonly auxiliaire: { readonly numero: string; readonly libelle: string } | null;
  readonly debit: Centimes;
  readonly credit: Centimes;
  readonly devise: { readonly code: Devise; readonly montant: Centimes } | null;
}

export interface Ecriture {
  readonly journal: Journal;
  readonly numero: string;
  readonly date: DateIso;
  readonly piece: string;
  readonly libelle: string;
  readonly lignes: readonly LigneEcriture[];
}

export interface JeuDeDonnees {
  readonly graine: number;
  readonly clients: readonly Client[];
  readonly fournisseurs: readonly Fournisseur[];
  readonly affaires: readonly Affaire[];
  readonly ventes: readonly FactureVente[];
  readonly achats: readonly FactureAchat[];
  readonly salaires: readonly Salaire[];
  readonly ecritures: readonly Ecriture[];
}

export const CLIENTS: readonly Client[] = [
  { code: 'C001', nom: 'Boulangeries Lefort', pays: 'FR', devise: 'EUR', regimeTva: 'france' },
  { code: 'C002', nom: 'Panification du Centre', pays: 'FR', devise: 'EUR', regimeTva: 'france' },
  { code: 'C003', nom: 'Les Pains de Provence', pays: 'FR', devise: 'EUR', regimeTva: 'france' },
  {
    code: 'C004',
    nom: 'Backwaren Hollmann GmbH',
    pays: 'DE',
    devise: 'EUR',
    regimeTva: 'intracommunautaire',
  },
  {
    code: 'C005',
    nom: 'Panificadora Ibérica SL',
    pays: 'ES',
    devise: 'EUR',
    regimeTva: 'intracommunautaire',
  },
  {
    code: 'C006',
    nom: 'Forno Rinaldi SpA',
    pays: 'IT',
    devise: 'EUR',
    regimeTva: 'intracommunautaire',
  },
  { code: 'C007', nom: 'Northfield Bakeries Ltd', pays: 'GB', devise: 'GBP', regimeTva: 'export' },
  { code: 'C008', nom: 'Prairie Bread Co.', pays: 'US', devise: 'USD', regimeTva: 'export' },
  { code: 'C009', nom: 'Golden Wheat Foods Inc.', pays: 'US', devise: 'USD', regimeTva: 'export' },
  { code: 'C010', nom: 'Atlas Boulangerie SARL', pays: 'MA', devise: 'EUR', regimeTva: 'export' },
];

export const FOURNISSEURS: readonly Fournisseur[] = [
  {
    code: 'F001',
    nom: "Aciers de l'Est",
    compte: '601000',
    compteLibelle: 'Achats de matières premières',
  },
  {
    code: 'F002',
    nom: 'Inox Process',
    compte: '601000',
    compteLibelle: 'Achats de matières premières',
  },
  {
    code: 'F003',
    nom: 'Électro-Automatismes Rhin',
    compte: '604000',
    compteLibelle: "Achats d'études et prestations",
  },
  {
    code: 'F004',
    nom: 'Usinage Vosgien',
    compte: '604000',
    compteLibelle: "Achats d'études et prestations",
  },
  {
    code: 'F005',
    nom: 'Fournitures Pro Est',
    compte: '606000',
    compteLibelle: 'Achats non stockés de fournitures',
  },
  {
    code: 'F006',
    nom: 'Transports Kessler',
    compte: '624000',
    compteLibelle: 'Transports de biens',
  },
  { code: 'F007', nom: 'Cabinet Audit Conseil', compte: '622600', compteLibelle: 'Honoraires' },
  { code: 'F008', nom: "Loc'Engins", compte: '613500', compteLibelle: 'Locations mobilières' },
];

const DESIGNATIONS = [
  'Ligne de pain de mie',
  'Four tunnel',
  'Ligne de baguettes',
  'Ligne de viennoiseries',
  'Surgélateur spirale',
  'Diviseuse-bouleuse',
] as const;

const NOMBRE_AFFAIRES = 18;

const JOURNAUX = {
  AN: { code: 'AN', libelle: 'A nouveaux' },
  VE: { code: 'VE', libelle: 'Ventes' },
  AC: { code: 'AC', libelle: 'Achats' },
  BQ: { code: 'BQ', libelle: 'Banque' },
} as const satisfies Record<Journal['code'], Journal>;

const ORDRE_JOURNAUX: readonly Journal['code'][] = ['AN', 'VE', 'AC', 'BQ'];

export const COMPTES = {
  banque: { compte: '512000', compteLibelle: 'Banque' },
  reserves: { compte: '106000', compteLibelle: 'Réserves' },
  clients: { compte: '411000', compteLibelle: 'Clients' },
  fournisseurs: { compte: '401000', compteLibelle: 'Fournisseurs' },
  ventes: { compte: '701000', compteLibelle: 'Ventes de produits finis' },
  tvaCollectee: { compte: '445710', compteLibelle: 'TVA collectée' },
  tvaDeductible: { compte: '445660', compteLibelle: 'TVA déductible sur biens et services' },
  salaires: { compte: '641000', compteLibelle: 'Rémunérations du personnel' },
} as const;

function enEur(montant: Centimes, devise: Devise): Centimes {
  return Math.round(montant * TAUX_EN_EUR[devise]);
}

function tva(ht: Centimes, regime: RegimeTva): Centimes {
  return regime === 'france' ? Math.round(ht * TAUX_TVA) : 0;
}

function numeroter(prefixe: string, rang: number): string {
  return `${prefixe}${String(rang).padStart(4, '0')}`;
}

function dansExercice(date: DateIso): boolean {
  return date >= DEBUT_EXERCICE && date <= FIN_EXERCICE;
}

function echeance(libelle: string, date: DateIso, montant: Centimes, devise: Devise): Echeance {
  return { libelle, date, montantDevise: montant, montantEur: enEur(montant, devise) };
}

function genererAffaires(alea: Alea): Affaire[] {
  // Chaque client a au moins une affaire, pour que toutes les devises et régimes de TVA apparaissent.
  const brouillons = Array.from({ length: NOMBRE_AFFAIRES }, (_, index) => {
    const client = CLIENTS[index] ?? alea.choisir(CLIENTS);
    const dateCommande = dateIso(EXERCICE, alea.entier(1, 10), alea.entier(1, 28));
    // Entre 400 000 et 4 500 000 unités de devise, arrondi à 10 000.
    const total = alea.entier(40, 450) * 1_000_000;
    const acompte = Math.round(total * 0.3);
    const livraison = Math.round(total * 0.6);
    const dateLivraison = ajouterJours(dateCommande, alea.entier(90, 240));
    return {
      client,
      designation: alea.choisir(DESIGNATIONS),
      dateCommande,
      echeances: [
        echeance(
          'Acompte 30 %',
          ajouterJours(dateCommande, alea.entier(2, 10)),
          acompte,
          client.devise,
        ),
        echeance('Livraison 60 %', dateLivraison, livraison, client.devise),
        echeance(
          'Réception 10 %',
          ajouterJours(dateLivraison, alea.entier(30, 90)),
          total - acompte - livraison,
          client.devise,
        ),
      ],
    };
  });
  return brouillons
    .sort((a, b) => a.dateCommande.localeCompare(b.dateCommande))
    .map((brouillon, index) => ({
      ...brouillon,
      code: `AF26-${String(index + 1).padStart(3, '0')}`,
    }));
}

function genererVentes(alea: Alea, affaires: readonly Affaire[]): FactureVente[] {
  return affaires
    .flatMap((affaire) => affaire.echeances.map((e) => ({ affaire, echeance: e })))
    .filter(({ echeance: e }) => dansExercice(e.date))
    .sort(
      (a, b) =>
        a.echeance.date.localeCompare(b.echeance.date) ||
        a.affaire.code.localeCompare(b.affaire.code),
    )
    .map(({ affaire, echeance: e }, index) => {
      const htEur = e.montantEur;
      const tvaEur = tva(htEur, affaire.client.regimeTva);
      const encaissement = ajouterJours(e.date, alea.entier(30, 75));
      return {
        numero: numeroter('FV26-', index + 1),
        date: e.date,
        affaire,
        echeance: e,
        htEur,
        tvaEur,
        ttcEur: htEur + tvaEur,
        dateEncaissement: dansExercice(encaissement) ? encaissement : null,
      };
    });
}

function genererAchats(alea: Alea, affaires: readonly Affaire[]): FactureAchat[] {
  const brouillons = Array.from({ length: 12 }, (_, index) => index + 1).flatMap((mois) =>
    Array.from({ length: alea.entier(6, 10) }, () => {
      const date = dateIso(EXERCICE, mois, alea.entier(1, 28));
      const fournisseur = alea.choisir(FOURNISSEURS);
      const affairesOuvertes = affaires.filter((affaire) => affaire.dateCommande <= date);
      const affaire =
        affairesOuvertes.length > 0 && alea.chance(0.6) ? alea.choisir(affairesOuvertes) : null;
      const ht = alea.entier(80_000, 12_000_000);
      const montantTva = tva(ht, 'france');
      const paiement = ajouterJours(date, alea.entier(30, 60));
      return {
        date,
        fournisseur,
        affaire,
        ht,
        tva: montantTva,
        ttc: ht + montantTva,
        datePaiement: dansExercice(paiement) ? paiement : null,
      };
    }),
  );
  return brouillons
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((brouillon, index) => ({ ...brouillon, numero: numeroter('FA26-', index + 1) }));
}

function genererSalaires(alea: Alea): Salaire[] {
  return Array.from({ length: 12 }, (_, index) => ({
    date: dateIso(EXERCICE, index + 1, 28),
    montant: alea.entier(31_000_000, 34_000_000),
  }));
}

type CompteSimple = { readonly compte: string; readonly compteLibelle: string };

function ligne(
  compte: CompteSimple,
  debit: Centimes,
  credit: Centimes,
  auxiliaire: LigneEcriture['auxiliaire'] = null,
  devise: LigneEcriture['devise'] = null,
): LigneEcriture {
  return { ...compte, auxiliaire, debit, credit, devise };
}

type EcritureSansNumero = Omit<Ecriture, 'numero'>;

function ecrituresDeVente(vente: FactureVente): EcritureSansNumero[] {
  const { client } = vente.affaire;
  const auxiliaire = { numero: client.code, libelle: client.nom };
  const devise =
    client.devise === 'EUR' ? null : { code: client.devise, montant: vente.echeance.montantDevise };
  const lignes = [
    ligne(COMPTES.clients, vente.ttcEur, 0, auxiliaire, devise),
    ligne(COMPTES.ventes, 0, vente.htEur),
    ...(vente.tvaEur > 0 ? [ligne(COMPTES.tvaCollectee, 0, vente.tvaEur)] : []),
  ];
  const facture: EcritureSansNumero = {
    journal: JOURNAUX.VE,
    date: vente.date,
    piece: vente.numero,
    libelle: `${vente.affaire.code} ${vente.echeance.libelle}`,
    lignes,
  };
  if (vente.dateEncaissement === null) {
    return [facture];
  }
  return [
    facture,
    {
      journal: JOURNAUX.BQ,
      date: vente.dateEncaissement,
      piece: vente.numero,
      libelle: `Règlement ${client.nom}`,
      lignes: [
        ligne(COMPTES.banque, vente.ttcEur, 0),
        ligne(COMPTES.clients, 0, vente.ttcEur, auxiliaire),
      ],
    },
  ];
}

function ecrituresDAchat(achat: FactureAchat): EcritureSansNumero[] {
  const { fournisseur } = achat;
  const auxiliaire = { numero: fournisseur.code, libelle: fournisseur.nom };
  const facture: EcritureSansNumero = {
    journal: JOURNAUX.AC,
    date: achat.date,
    piece: achat.numero,
    libelle: achat.affaire === null ? fournisseur.nom : `${fournisseur.nom} ${achat.affaire.code}`,
    lignes: [
      ligne(fournisseur, achat.ht, 0),
      ligne(COMPTES.tvaDeductible, achat.tva, 0),
      ligne(COMPTES.fournisseurs, 0, achat.ttc, auxiliaire),
    ],
  };
  if (achat.datePaiement === null) {
    return [facture];
  }
  return [
    facture,
    {
      journal: JOURNAUX.BQ,
      date: achat.datePaiement,
      piece: achat.numero,
      libelle: `Paiement ${fournisseur.nom}`,
      lignes: [
        ligne(COMPTES.fournisseurs, achat.ttc, 0, auxiliaire),
        ligne(COMPTES.banque, 0, achat.ttc),
      ],
    },
  ];
}

function genererEcritures(
  ventes: readonly FactureVente[],
  achats: readonly FactureAchat[],
  salaires: readonly Salaire[],
): Ecriture[] {
  const aNouveau: EcritureSansNumero = {
    journal: JOURNAUX.AN,
    date: DEBUT_EXERCICE,
    piece: 'AN2026',
    libelle: 'Reprise des soldes',
    lignes: [
      ligne(COMPTES.banque, SOLDE_INITIAL_BANQUE, 0),
      ligne(COMPTES.reserves, 0, SOLDE_INITIAL_BANQUE),
    ],
  };
  const ecritures = [
    aNouveau,
    ...ventes.flatMap(ecrituresDeVente),
    ...achats.flatMap(ecrituresDAchat),
    ...salaires.map((salaire): EcritureSansNumero => ({
      journal: JOURNAUX.BQ,
      date: salaire.date,
      piece: `SAL-${salaire.date.slice(0, 7)}`,
      libelle: 'Virement des salaires',
      lignes: [
        ligne(COMPTES.salaires, salaire.montant, 0),
        ligne(COMPTES.banque, 0, salaire.montant),
      ],
    })),
  ];
  // Tri stable : par date, puis par journal ; l'ordre de création départage le reste.
  ecritures.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      ORDRE_JOURNAUX.indexOf(a.journal.code) - ORDRE_JOURNAUX.indexOf(b.journal.code),
  );
  const compteurs = new Map<string, number>();
  return ecritures.map((ecriture) => {
    const rang = (compteurs.get(ecriture.journal.code) ?? 0) + 1;
    compteurs.set(ecriture.journal.code, rang);
    return { ...ecriture, numero: `${ecriture.journal.code}${String(rang).padStart(6, '0')}` };
  });
}

export function genererJeu(graine: number): JeuDeDonnees {
  const alea = creerAlea(graine);
  const affaires = genererAffaires(alea);
  const ventes = genererVentes(alea, affaires);
  const achats = genererAchats(alea, affaires);
  const salaires = genererSalaires(alea);
  return {
    graine,
    clients: CLIENTS,
    fournisseurs: FOURNISSEURS,
    affaires,
    ventes,
    achats,
    salaires,
    ecritures: genererEcritures(ventes, achats, salaires),
  };
}
