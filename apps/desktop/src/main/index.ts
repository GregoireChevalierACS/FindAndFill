import { lecteurSources, ouvreurGabaritXlsx } from '@findandfill/adapters-fichiers';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CANAUX, type TypeFichier } from '../shared/api.js';
import { preparerDemonstration } from './demonstration.js';
import { creerService } from './service.js';

const FILTRES: Record<TypeFichier, Electron.FileFilter[]> = {
  modele: [{ name: 'Modèle FindAndFill', extensions: ['json'] }],
  source: [{ name: 'Exports comptables', extensions: ['xlsx', 'xlsm', 'csv', 'tsv', 'txt'] }],
  gabarit: [{ name: 'Classeur Excel', extensions: ['xlsx', 'xlsm'] }],
};

const TITRES: Record<TypeFichier, string> = {
  modele: 'Ouvrir un modèle',
  source: 'Choisir un fichier source',
  gabarit: 'Choisir le gabarit à remplir',
};

function fenetreActive(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

const service = creerService({
  lireFichier: async (chemin) => new Uint8Array(await readFile(chemin)),
  ecrireFichier: (chemin, octets) => writeFile(chemin, octets),
  creerJeton: randomUUID,
  lecteur: lecteurSources,
  ouvreur: ouvreurGabaritXlsx,
  async demanderEnregistrement(cheminPropose, type) {
    const options: Electron.SaveDialogOptions = {
      title: type === 'modele' ? 'Enregistrer le modèle' : 'Enregistrer le reporting rempli',
      defaultPath: cheminPropose,
      filters: FILTRES[type],
    };
    const fenetre = fenetreActive();
    const { canceled, filePath } = fenetre
      ? await dialog.showSaveDialog(fenetre, options)
      : await dialog.showSaveDialog(options);
    return canceled || filePath === '' ? null : filePath;
  },
});

ipcMain.handle(CANAUX.choisirFichier, async (_evenement, type: TypeFichier) => {
  const options: Electron.OpenDialogOptions = {
    title: TITRES[type],
    filters: FILTRES[type],
    properties: ['openFile'],
  };
  const fenetre = fenetreActive();
  const { canceled, filePaths } = fenetre
    ? await dialog.showOpenDialog(fenetre, options)
    : await dialog.showOpenDialog(options);
  return canceled ? null : (filePaths[0] ?? null);
});
ipcMain.handle(CANAUX.ouvrirModele, (_evenement, chemin: string) => service.ouvrirModele(chemin));
ipcMain.handle(CANAUX.preparer, (_evenement, demande: unknown) => service.preparer(demande));
ipcMain.handle(CANAUX.confirmer, (_evenement, jeton: unknown) => service.confirmer(jeton));
ipcMain.handle(CANAUX.chargerDemonstration, () => preparerDemonstration(tmpdir()));
ipcMain.handle(CANAUX.apercuSource, (_evenement, chemin: unknown) => service.apercuSource(chemin));
ipcMain.handle(CANAUX.apercuGabarit, (_evenement, chemin: unknown) =>
  service.apercuGabarit(chemin),
);
ipcMain.handle(CANAUX.enregistrerModele, (_evenement, modele: unknown) =>
  service.enregistrerModele(modele),
);

function creerFenetre(): void {
  const fenetre = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'FindAndFill',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  fenetre.once('ready-to-show', () => {
    fenetre.show();
  });
  // Aucun lien ne s'ouvre dans l'application : ils partent dans le navigateur.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  const urlDeveloppement = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && urlDeveloppement !== undefined) {
    void fenetre.loadURL(urlDeveloppement);
  } else {
    void fenetre.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  creerFenetre();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      creerFenetre();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
