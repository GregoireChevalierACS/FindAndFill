import { createHash } from 'node:crypto';
import {
  attendusAchats,
  attendusCa,
  attendusCarnet,
  attendusTresorerie,
  type CelluleAttendue,
} from './attendus.js';
import { genererFec, nomFichierFec } from './fec.js';
import { genererGabarit } from './gabarit.js';
import { genererJeu, SOCIETE } from './modele.js';
import {
  COLONNE_AJOUTEE_VENTES,
  exporterAchats,
  exporterCarnet,
  exporterVentes,
  ONGLET_CARNET,
  ONGLET_CARNET_RENOMME,
} from './sources.js';
import { convertirEnXlsm, lireProjetVbaExemple } from './xlsm.js';

export const GRAINE_PAR_DEFAUT = 2026;

export const CHEMINS = {
  ventes: 'sources/ventes-par-affaire.xlsx',
  carnet: 'sources/carnet-commandes.xlsx',
  achats: 'sources/achats.csv',
  fec: `sources/${nomFichierFec()}`,
  ventesColonneAjoutee: 'sources/variantes/ventes-par-affaire--colonne-ajoutee.xlsx',
  carnetOngletRenomme: 'sources/variantes/carnet-commandes--onglet-renomme.xlsx',
  achatsColonnesDeplacees: 'sources/variantes/achats--colonnes-deplacees.csv',
  gabarit: 'gabarits/reporting-direction.xlsx',
  gabaritMacros: 'gabarits/reporting-direction.xlsm',
  manifeste: 'manifeste.json',
} as const;

/** Un cas de test : remplir un gabarit à partir de sources, ou détecter un changement de structure. */
export type Cas =
  | {
      readonly id: string;
      readonly type: 'remplissage';
      readonly description: string;
      readonly sources: readonly string[];
      readonly gabarit: string;
      readonly attendu: string;
    }
  | {
      readonly id: string;
      readonly type: 'changement-structure';
      readonly description: string;
      readonly reference: string;
      readonly source: string;
      readonly changement:
        | { readonly nature: 'colonne-ajoutee'; readonly colonne: string }
        | { readonly nature: 'onglet-renomme'; readonly avant: string; readonly apres: string }
        | { readonly nature: 'colonnes-deplacees' };
    };

export interface Attendu {
  readonly cas: string;
  readonly gabarit: string;
  readonly cellules: readonly CelluleAttendue[];
}

export interface Manifeste {
  readonly graine: number;
  readonly mention: string;
  readonly cas: readonly Cas[];
  /** Empreinte SHA-256 de chaque fichier généré (hors manifeste). */
  readonly empreintes: Readonly<Record<string, string>>;
}

export interface FichierGenere {
  readonly chemin: string;
  readonly contenu: Buffer;
}

function json(valeur: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(valeur, null, 2)}\n`, 'utf8');
}

function cheminAttendu(id: string): string {
  return `attendus/${id}.json`;
}

function remplissage(
  id: string,
  description: string,
  sources: readonly string[],
  gabarit: string,
): Cas {
  return { id, type: 'remplissage', description, sources, gabarit, attendu: cheminAttendu(id) };
}

/** Génère tous les fichiers du jeu synthétique, en mémoire. */
export async function genererJeuComplet(graine = GRAINE_PAR_DEFAUT): Promise<{
  fichiers: FichierGenere[];
  manifeste: Manifeste;
}> {
  const jeu = genererJeu(graine);
  const gabarit = await genererGabarit(jeu);
  const cellules = {
    ca: attendusCa(jeu),
    carnet: attendusCarnet(jeu),
    tresorerie: attendusTresorerie(jeu),
    achats: attendusAchats(jeu),
  };

  const cas: { readonly cas: Cas; readonly cellules?: readonly CelluleAttendue[] }[] = [
    {
      cas: remplissage(
        'ca-par-affaire',
        "CA HT mensuel par affaire depuis l'export Excel des ventes.",
        [CHEMINS.ventes],
        CHEMINS.gabarit,
      ),
      cellules: cellules.ca,
    },
    {
      cas: remplissage(
        'carnet-commandes',
        'Commandé et facturé par affaire depuis le carnet de commandes.',
        [CHEMINS.carnet],
        CHEMINS.gabarit,
      ),
      cellules: cellules.carnet,
    },
    {
      cas: remplissage(
        'tresorerie',
        'Solde initial, encaissements et décaissements mensuels du compte 512000 depuis le FEC.',
        [CHEMINS.fec],
        CHEMINS.gabarit,
      ),
      cellules: cellules.tresorerie,
    },
    {
      cas: remplissage(
        'achats-par-fournisseur',
        'Achats HT mensuels par fournisseur depuis le CSV des achats.',
        [CHEMINS.achats],
        CHEMINS.gabarit,
      ),
      cellules: cellules.achats,
    },
    {
      cas: remplissage(
        'ca-par-affaire-macros',
        'Même remplissage que « ca-par-affaire », dans le gabarit avec macros : le projet VBA doit rester intact.',
        [CHEMINS.ventes],
        CHEMINS.gabaritMacros,
      ),
      cellules: cellules.ca,
    },
    {
      cas: remplissage(
        'reporting-complet-macros',
        'Les quatre onglets du reporting depuis toutes les sources, dans le gabarit avec macros.',
        [CHEMINS.ventes, CHEMINS.carnet, CHEMINS.fec, CHEMINS.achats],
        CHEMINS.gabaritMacros,
      ),
      cellules: [...cellules.ca, ...cellules.carnet, ...cellules.tresorerie, ...cellules.achats],
    },
    {
      cas: {
        id: 'variante-colonne-ajoutee',
        type: 'changement-structure',
        description: "Une colonne « Commercial » apparaît dans l'export des ventes.",
        reference: CHEMINS.ventes,
        source: CHEMINS.ventesColonneAjoutee,
        changement: { nature: 'colonne-ajoutee', colonne: COLONNE_AJOUTEE_VENTES },
      },
    },
    {
      cas: {
        id: 'variante-onglet-renomme',
        type: 'changement-structure',
        description: "L'onglet du carnet de commandes a été renommé.",
        reference: CHEMINS.carnet,
        source: CHEMINS.carnetOngletRenomme,
        changement: {
          nature: 'onglet-renomme',
          avant: ONGLET_CARNET,
          apres: ONGLET_CARNET_RENOMME,
        },
      },
    },
    {
      cas: {
        id: 'variante-colonnes-deplacees',
        type: 'changement-structure',
        description: "Les colonnes de montants du CSV des achats ont changé d'ordre.",
        reference: CHEMINS.achats,
        source: CHEMINS.achatsColonnesDeplacees,
        changement: { nature: 'colonnes-deplacees' },
      },
    },
  ];

  const fichiers: FichierGenere[] = [
    { chemin: CHEMINS.ventes, contenu: await exporterVentes(jeu) },
    { chemin: CHEMINS.carnet, contenu: await exporterCarnet(jeu) },
    { chemin: CHEMINS.achats, contenu: Buffer.from(exporterAchats(jeu), 'utf8') },
    { chemin: CHEMINS.fec, contenu: Buffer.from(genererFec(jeu), 'utf8') },
    {
      chemin: CHEMINS.ventesColonneAjoutee,
      contenu: await exporterVentes(jeu, { colonneAjoutee: true }),
    },
    {
      chemin: CHEMINS.carnetOngletRenomme,
      contenu: await exporterCarnet(jeu, { ongletRenomme: true }),
    },
    {
      chemin: CHEMINS.achatsColonnesDeplacees,
      contenu: Buffer.from(exporterAchats(jeu, { colonnesDeplacees: true }), 'utf8'),
    },
    { chemin: CHEMINS.gabarit, contenu: gabarit },
    {
      chemin: CHEMINS.gabaritMacros,
      contenu: await convertirEnXlsm(gabarit, await lireProjetVbaExemple()),
    },
    ...cas.flatMap(({ cas: unCas, cellules: attendues }) =>
      unCas.type === 'remplissage' && attendues !== undefined
        ? [
            {
              chemin: unCas.attendu,
              contenu: json({ cas: unCas.id, gabarit: unCas.gabarit, cellules: attendues }),
            },
          ]
        : [],
    ),
  ];

  const manifeste: Manifeste = {
    graine,
    mention: SOCIETE.mention,
    cas: cas.map(({ cas: unCas }) => unCas),
    empreintes: Object.fromEntries(
      fichiers.map(({ chemin, contenu }) => [
        chemin,
        createHash('sha256').update(contenu).digest('hex'),
      ]),
    ),
  };
  return {
    fichiers: [...fichiers, { chemin: CHEMINS.manifeste, contenu: json(manifeste) }],
    manifeste,
  };
}
