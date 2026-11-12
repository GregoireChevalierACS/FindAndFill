/**
 * Parcours de l'éditeur : un comptable construit le modèle « CA par affaire » à la souris,
 * l'enregistre, puis l'utilise pour remplir le gabarit de démonstration.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lancerApplication, remplacerDialogues } from './lancer.js';

let application: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  application = await lancerApplication();
  page = await application.firstWindow();
});

test.afterEach(async () => {
  await application.close();
});

test('construit un modèle à la souris, l’enregistre et l’utilise pour remplir', async () => {
  await page.getByRole('button', { name: 'Charger la démonstration' }).click();
  const note = (await page.getByText('Jeu de démonstration généré dans').textContent()) ?? '';
  const dossier = note.replace('Jeu de démonstration généré dans ', '').trim();

  await page.getByRole('tab', { name: 'Modèle' }).click();
  await page.getByLabel('Nom', { exact: true }).fill('CA par affaire (éditeur)');
  await page.getByLabel('Exercice').fill('2026');

  await remplacerDialogues(application, {
    ouvrir: join(dossier, 'sources', 'ventes-par-affaire.xlsx'),
  });
  await page.getByRole('button', { name: 'Ajouter une source…' }).click();
  await expect(
    page.getByText(
      'N° facture, Date, Code affaire, Client, Pays, Devise, Montant devise, Montant HT EUR',
    ),
  ).toBeVisible();

  await remplacerDialogues(application, {
    ouvrir: join(dossier, 'gabarits', 'reporting-direction.xlsx'),
  });
  await page.getByRole('button', { name: 'Choisir le gabarit…' }).click();
  await expect(page.getByRole('tab', { name: 'CA par affaire' })).toBeVisible();

  await page.getByRole('button', { name: '+ Mois en colonnes, une ligne par clé' }).click();
  await expect(page.getByText('Règle « regle » : une colonne reste à choisir.')).toBeVisible();
  await page.getByLabel('Colonne de la clé').selectOption('Code affaire');
  await page.getByLabel('Montant à ajouter').selectOption('Montant HT EUR');

  // La colonne de janvier est d'abord faussée, puis visée dans le gabarit.
  await page.getByRole('textbox', { name: 'Colonne de janvier' }).fill('D');
  await page
    .getByRole('button', { name: 'Choisir « Colonne de janvier » dans le gabarit' })
    .click();
  await page.getByTitle('C4', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Colonne de janvier' })).toHaveValue('C');
  await expect(page.getByText('Le modèle est cohérent.')).toBeVisible();

  const fichierModele = join(await mkdtemp(join(tmpdir(), 'findandfill-e2e-')), 'ca.json');
  await remplacerDialogues(application, { enregistrer: fichierModele });
  await page.getByRole('button', { name: 'Enregistrer le modèle…' }).click();
  await expect(page.getByText(`Modèle enregistré : ${fichierModele}`)).toBeVisible();
  const modele = JSON.parse(await readFile(fichierModele, 'utf8')) as Record<string, unknown>;
  expect(modele).toEqual({
    nom: 'CA par affaire (éditeur)',
    annee: 2026,
    sources: [
      {
        id: 'ventes-par-affaire',
        libelle: 'ventes-par-affaire',
        empreinte: {
          onglet: 'Ventes',
          entetes: [
            'N° facture',
            'Date',
            'Code affaire',
            'Client',
            'Pays',
            'Devise',
            'Montant devise',
            'Montant HT EUR',
            'TVA EUR',
            'TTC EUR',
          ],
        },
      },
    ],
    regles: [
      {
        id: 'regle',
        type: 'mensuel-par-cle',
        source: 'ventes-par-affaire',
        cle: 'Code affaire',
        date: 'Date',
        montant: { plus: 'Montant HT EUR' },
        cible: { onglet: 'CA par affaire', colonneCles: 'A', premiereColonneMois: 'C' },
      },
    ],
  });

  await page.getByRole('button', { name: 'Tester avec ces fichiers' }).click();
  await expect(page.getByText('CA par affaire (éditeur)')).toBeVisible();
  await page.getByRole('button', { name: 'Préparer l’aperçu' }).click();
  await expect(page.getByText('216 cellules', { exact: true })).toBeVisible();
});
