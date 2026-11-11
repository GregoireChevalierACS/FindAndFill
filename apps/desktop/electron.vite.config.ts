import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Les paquets du monorepo exportent leurs sources TypeScript : ils sont intégrés au bundle,
// alors que les dépendances tierces (ExcelJS, JSZip…) restent chargées depuis node_modules.
const PAQUETS_DU_MONOREPO = [
  '@findandfill/domain',
  '@findandfill/application',
  '@findandfill/adapters-fichiers',
  '@findandfill/jeu-synthetique',
];

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: PAQUETS_DU_MONOREPO } },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: PAQUETS_DU_MONOREPO },
      // Un preload en bac à sable doit être en CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
