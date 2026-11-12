/**
 * Lance l'application empaquetée par electron-vite et rejoue le parcours d'un comptable.
 * Les boîtes de dialogue natives sont remplacées dans le processus principal.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
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

async function chargerDemonstration(): Promise<string> {
  await page.getByRole('button', { name: 'Charger la démonstration' }).click();
  await expect(page.getByText('Reporting direction complet')).toBeVisible();
  const note = (await page.getByText('Jeu de démonstration généré dans').textContent()) ?? '';
  return note.replace('Jeu de démonstration généré dans ', '').trim();
}

test('remplit le reporting de démonstration et l’enregistre après confirmation', async () => {
  await chargerDemonstration();
  await expect(page.getByText('reporting-direction.xlsm')).toBeVisible();

  await page.getByRole('button', { name: 'Préparer l’aperçu' }).click();
  await expect(page.getByText('373 cellules')).toBeVisible();
  await expect(page.getByText('CA par affaire — 216 cellules')).toBeVisible();

  const sortie = join(await mkdtemp(join(tmpdir(), 'findandfill-e2e-')), 'reporting rempli.xlsm');
  await remplacerDialogues(application, { enregistrer: sortie });
  await page.getByRole('button', { name: 'Confirmer et enregistrer…' }).click();
  await expect(page.getByText(`Enregistré : ${sortie}`)).toBeVisible();

  const octets = await readFile(sortie);
  const zip = await JSZip.loadAsync(octets);
  expect(zip.file('xl/vbaProject.bin')).not.toBeNull();
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(octets as unknown as ArrayBuffer);
  expect(typeof classeur.getWorksheet('Trésorerie')?.getCell('C3').value).toBe('number');
});

test('bloque une source dont la structure a changé, avec un message clair', async () => {
  const dossier = await chargerDemonstration();
  await remplacerDialogues(application, {
    ouvrir: join(dossier, 'sources', 'variantes', 'ventes-par-affaire--colonne-ajoutee.xlsx'),
  });
  await page.getByRole('button', { name: 'Choisir…' }).first().click();
  await expect(page.getByText('ventes-par-affaire--colonne-ajoutee.xlsx')).toBeVisible();

  await page.getByRole('button', { name: 'Préparer l’aperçu' }).click();
  await expect(
    page.getByText('La structure de « Export des ventes (Excel) » a changé : rien n’a été rempli.'),
  ).toBeVisible();
  await expect(page.getByText('Colonne(s) ajoutée(s) : « Commercial ».')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmer et enregistrer…' })).toHaveCount(0);
});

test('efface l’aperçu dès qu’un fichier change', async () => {
  const dossier = await chargerDemonstration();
  await page.getByRole('button', { name: 'Préparer l’aperçu' }).click();
  await expect(page.getByText('373 cellules')).toBeVisible();

  await remplacerDialogues(application, {
    ouvrir: join(dossier, 'gabarits', 'reporting-direction.xlsx'),
  });
  await page.getByRole('button', { name: 'Choisir…' }).last().click();
  await expect(page.getByText('373 cellules')).toHaveCount(0);
});
