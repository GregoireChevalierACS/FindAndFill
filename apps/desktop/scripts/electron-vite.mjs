// Lance electron-vite sans ELECTRON_RUN_AS_NODE : héritée du terminal de VS Code (lui-même
// une application Electron), cette variable ferait démarrer l'application comme un simple Node.
import { spawn } from 'node:child_process';
import process from 'node:process';

const environnement = { ...process.env };
delete environnement.ELECTRON_RUN_AS_NODE;

const enfant = spawn('electron-vite', process.argv.slice(2), {
  stdio: 'inherit',
  env: environnement,
  shell: process.platform === 'win32',
});
enfant.on('exit', (code) => process.exit(code ?? 1));
