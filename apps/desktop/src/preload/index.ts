import { contextBridge, ipcRenderer } from 'electron';
import { CANAUX, type ApiFindAndFill } from '../shared/api.js';

/** Seule surface exposée à l'interface : des appels typés, aucun accès direct à Node. */
const api: ApiFindAndFill = {
  choisirFichier: (type) => ipcRenderer.invoke(CANAUX.choisirFichier, type),
  ouvrirModele: (chemin) => ipcRenderer.invoke(CANAUX.ouvrirModele, chemin),
  preparer: (demande) => ipcRenderer.invoke(CANAUX.preparer, demande),
  confirmer: (jeton) => ipcRenderer.invoke(CANAUX.confirmer, jeton),
  chargerDemonstration: () => ipcRenderer.invoke(CANAUX.chargerDemonstration),
};

contextBridge.exposeInMainWorld('findAndFill', api);
