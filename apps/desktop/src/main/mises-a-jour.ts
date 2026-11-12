import { app } from 'electron';
import electronUpdater from 'electron-updater';

/**
 * Mises à jour automatiques depuis les Releases GitHub : la nouvelle version est téléchargée
 * en arrière-plan et installée à la fermeture de l'application, avec une notification système.
 * Rien ne se passe en développement, ni quand FINDANDFILL_SANS_MISE_A_JOUR est défini (tests).
 */
export function verifierMisesAJour(): void {
  if (!app.isPackaged || process.env['FINDANDFILL_SANS_MISE_A_JOUR'] !== undefined) {
    return;
  }
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoInstallOnAppQuit = true;
  // Sans réseau ou sans release publiée, l'application doit simplement continuer.
  autoUpdater.checkForUpdatesAndNotify().catch((erreur: unknown) => {
    console.warn('Vérification des mises à jour impossible :', erreur);
  });
}
