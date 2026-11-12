import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// L'application n'a que des dépendances de développement : electron-vite n'en externalise aucune,
// tout le code (paquets du monorepo, ExcelJS, JSZip, zod, electron-updater) est regroupé dans out/.
// L'installateur n'embarque donc ni node_modules ni dépendance de développement.
export default defineConfig({
  main: {},
  preload: {
    build: {
      // Un preload en bac à sable doit être en CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
