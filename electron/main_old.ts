// THIS FILE IS NO LONGER USED - main.cjs is the active entry point
// This file was replaced by main.cjs which includes the welcome screen flow
// and better container engine detection with Podman preference.
//
// The main.cjs file provides:
// - Welcome screen with prerequisite checking
// - Podman/Docker detection and preference for Podman
// - Better error handling and user guidance
// - Proper startup flow management
//
// This file can be removed in a future cleanup.

import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { initialize, enable } from '@electron/remote/main';
import { setupIpcHandlers } from './ipc/main_handle';
const DockerSetup = require('./dockerSetup.cjs');

// Initialize remote module
initialize();

let dockerSetup: any = null;

async function initializeDockerServices(win: BrowserWindow) {
  dockerSetup = new DockerSetup();

  try {
    await dockerSetup.setup((status: string, type: string = 'info') => {
      // Send status updates to renderer
      win.webContents.send('setup-status', { status, type });
    });

    // Setup IPC handlers after dockerSetup is initialized
    setupIpcHandlers(dockerSetup);
  } catch (error) {
    dialog.showErrorBox('Setup Error', error.message);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Enable remote module for this window
  enable(win.webContents);

  // Initialize Docker services
  initializeDockerServices(win);

  // Load your app
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    win.loadURL('http://localhost:5173'); // Vite dev server default port
  }

  // Open DevTools in development
  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Stop Docker containers when app closes
  if (dockerSetup) {
    await dockerSetup.stop();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});