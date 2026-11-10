import type { ModeleRemplissage } from '@findandfill/domain';
import { z } from 'zod';

/** Validation d'un modèle venu de l'extérieur (fichier JSON, interface) avant tout usage. */

const texte = z.string().min(1);
const colonne = z.string().regex(/^[A-Z]{1,3}$/, 'lettre(s) de colonne attendue(s), ex. « C »');

const commune = {
  id: texte,
  source: texte,
  montant: z.object({ plus: texte, moins: texte.optional() }),
  filtres: z
    .array(
      z.object({
        colonne: texte,
        operateur: z.enum(['egal', 'different']),
        valeur: z.string(),
      }),
    )
    .optional(),
};

const regle = z.discriminatedUnion('type', [
  z.object({
    ...commune,
    type: z.literal('mensuel-par-cle'),
    cle: texte,
    date: texte,
    cible: z.object({ onglet: texte, colonneCles: colonne, premiereColonneMois: colonne }),
  }),
  z.object({
    ...commune,
    type: z.literal('mensuel'),
    date: texte,
    cible: z.object({ onglet: texte, colonne, ligneJanvier: z.number().int().min(1) }),
  }),
  z.object({
    ...commune,
    type: z.literal('par-cle'),
    cle: texte,
    cible: z.object({ onglet: texte, colonneCles: colonne, colonne }),
  }),
  z.object({
    ...commune,
    type: z.literal('total'),
    cible: z.object({
      onglet: texte,
      adresse: z.string().regex(/^[A-Z]{1,3}[1-9]\d*$/, 'adresse attendue, ex. « C3 »'),
    }),
  }),
]);

export const schemaModele = z.object({
  nom: texte,
  annee: z.number().int().min(1900).max(2999),
  sources: z
    .array(
      z.object({
        id: texte,
        libelle: texte,
        empreinte: z.object({ onglet: texte.optional(), entetes: z.array(z.string()).min(1) }),
      }),
    )
    .min(1),
  regles: z.array(regle).min(1),
});

export type ValidationModele =
  | { readonly ok: true; readonly modele: ModeleRemplissage }
  | { readonly ok: false; readonly detail: string };

export function validerModele(donnees: unknown): ValidationModele {
  const resultat = schemaModele.safeParse(donnees);
  if (!resultat.success) {
    const detail = resultat.error.issues
      .map((probleme) => `${probleme.path.join('.') || '(racine)'} : ${probleme.message}`)
      .join(' ; ');
    return { ok: false, detail };
  }
  // Un JSON ne contient jamais de propriété « undefined » : le résultat respecte le type exact.
  return { ok: true, modele: resultat.data as ModeleRemplissage };
}
