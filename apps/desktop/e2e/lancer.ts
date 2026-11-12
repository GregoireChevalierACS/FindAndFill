import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { join } from 'node:path';

/**
 * Lance l'application pour un test de bout en bout :
 * - par défaut, le code construit par electron-vite (`out/`) ;
 * - si FINDANDFILL_EXECUTABLE est défini, l'exécutable empaqueté (test de l'artefact livré).
 */
export function lancerApplication(): Promise<ElectronApplication> {
  // ELECTRON_RUN_AS_NODE, héritée du terminal de VS Code, ferait démarrer Electron comme Node.
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entree): entree is [string, string] =>
        entree[0] !== 'ELECTRON_RUN_AS_NODE' && entree[1] !== undefined,
    ),
  );
  env['FINDANDFILL_SANS_MISE_A_JOUR'] = '1';
  const sandbox = process.env['CI'] === undefined ? [] : ['--no-sandbox'];
  const executable = process.env['FINDANDFILL_EXECUTABLE'];
  return executable === undefined
    ? electron.launch({ args: ['.', ...sandbox], cwd: join(import.meta.dirname, '..'), env })
    : electron.launch({ executablePath: executable, args: sandbox, env });
}

/** Remplace les boîtes de dialogue natives dans le processus principal. */
export async function remplacerDialogues(
  application: ElectronApplication,
  choix: { ouvrir?: string; enregistrer?: string },
): Promise<void> {
  await application.evaluate(({ dialog }, { ouvrir, enregistrer }) => {
    if (ouvrir !== undefined) {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [ouvrir] });
    }
    if (enregistrer !== undefined) {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: enregistrer });
    }
  }, choix);
}
