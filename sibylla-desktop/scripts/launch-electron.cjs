/**
 * Launch Electron with ELECTRON_RUN_AS_NODE unset.
 * Cursor (and some CI shells) set ELECTRON_RUN_AS_NODE=1, which strips the
 * electron.app API and breaks the main process.
 */
const { spawn } = require('child_process');
const path = require('path');

delete process.env.ELECTRON_RUN_AS_NODE;

const electronPath = require('electron');
const appRoot = path.join(__dirname, '..');

const child = spawn(electronPath, ['.'], {
  cwd: appRoot,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
