const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const log = require('./helpers/log.cjs');
const DockerSetup = require('./dockerSetup.cjs');
const { setupAutoUpdater } = require('./updateService.cjs');
const SplashScreen = require('./splash.cjs');
const WelcomeScreen = require('./welcome/index.cjs');
const { createAppMenu } = require('./menu.cjs');
const { setupIpcHandlers, setupWelcomeHandlers, setupStandaloneHandlers } = require('./ipc/main_handle.cjs');
const { createMainWindowStateManager } = require('./helpers/window_state.cjs');

// Log application startup
log.info('Line 14 main.cjs: Application starting...');

// Global variables
let mainWindow;
let splash;
let welcomeScreen;
let dockerSetup;
let dockerHandlersRegistered = false;
let mainWindowStateManager;

// Register Docker container management IPC handlers
function registerDockerContainerHandlers() {
  // Skip if handlers are already registered
  if (dockerHandlersRegistered) {
    log.info('Docker handlers already registered, skipping...');
    return;
  }

  log.info('Registering Docker container handlers...');
  dockerHandlersRegistered = true;

  // Use the refactored IPC handlers
  setupIpcHandlers(dockerSetup);
}

function registerWelcomeHandlers() {
  // Use the new modular welcome handlers
  if (welcomeScreen && welcomeScreen.setupHandlers) {
    welcomeScreen.setupHandlers(startMainAppWithDocker, startMainAppLimited);
  } else {
    // Fallback to old method for compatibility
    setupWelcomeHandlers(welcomeScreen, startMainAppWithDocker, startMainAppLimited);
  }
}

async function initializeApp() {
  try {
    // Show welcome screen instead of splash
    welcomeScreen = new WelcomeScreen();

    // Register welcome screen IPC handlers
    registerWelcomeHandlers();

  } catch (error) {
    log.error(`Initialization error: ${error.message}`, error);
    dialog.showErrorBox('Startup Error', error.message);
    app.quit();
  }
}

async function startMainAppWithDocker() {
  try {
    log.info('Starting main app with container setup...');

    // Close welcome screen
    welcomeScreen?.close();
    welcomeScreen = null;

    // Show splash screen for Docker setup
    splash = new SplashScreen();
    splash.setStatus('Starting Clara...', 'info');

    // Initialize Docker setup
    log.info('Initializing Docker setup...');
    dockerSetup = new DockerSetup();

    // Register Docker container management IPC handlers
    registerDockerContainerHandlers();

    // Setup Docker environment
    splash.setStatus('Setting up container environment...', 'info');
    log.info('Beginning container environment setup...');

    const success = await dockerSetup.setup((status, type = 'info') => {
      log.info(`Docker setup status [${type}]: ${status}`);
      splash.setStatus(status, type);

      // Log errors to console for debugging
      if (type === 'error') {
        console.error('Docker setup error:', status);
      }
    });

    if (!success) {
      const errorMsg = 'Container setup incomplete. Returning to welcome screen.';
      log.error(errorMsg);
      console.error(errorMsg);
      splash.setStatus('Container setup incomplete. Returning to welcome screen...', 'error');

      // Keep error visible longer for debugging
      setTimeout(() => {
        log.info('Closing splash and returning to welcome screen');
        splash?.close();
        splash = null;
        // Show welcome screen again
        welcomeScreen = new WelcomeScreen();
      }, 5000); // Increased from 3000 to 5000ms
      return;
    }

    // Docker setup successful, create the main window
    log.info('Container setup successful. Creating main window...');
    splash.setStatus('Starting main application...', 'success');
    createMainWindow();

    // Close splash screen after a short delay
    setTimeout(() => {
      log.info('Closing splash screen');
      splash?.close();
      splash = null;
    }, 2000);

  } catch (error) {
    const errorMsg = `Setup error: ${error.message}`;
    log.error(errorMsg, error);
    console.error('Full error details:', error);

    splash?.setStatus(`Error: ${error.message}`, 'error');

    // Show error longer and return to welcome screen
    setTimeout(() => {
      log.info('Error timeout reached, returning to welcome screen');
      splash?.close();
      splash = null;
      welcomeScreen = new WelcomeScreen();
    }, 7000); // Increased from 3000 to 7000ms for better debugging
  }
}

function startMainAppLimited() {
  try {
    // Close welcome screen
    welcomeScreen?.close();
    welcomeScreen = null;

    log.info('Starting ClaraVerse in limited mode (no containers)');
    createMainWindow();

  } catch (error) {
    log.error(`Error starting limited mode: ${error.message}`, error);
    dialog.showErrorBox('Startup Error', error.message);
  }
}

function createMainWindow() {
  if (mainWindow) return;

  // Create window state manager
  mainWindowStateManager = createMainWindowStateManager();

  // Get window options from state manager
  const windowOptions = mainWindowStateManager.getWindowOptions();

  mainWindow = new BrowserWindow({
    ...windowOptions,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    },
    show: false,
    backgroundColor: '#f5f5f5',
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    title: 'ClaraVerse',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });

  // Restore window state (maximize, fullscreen)
  mainWindowStateManager.restoreWindowState(mainWindow);

  // Create and set the application menu
  createAppMenu(mainWindow);

  // Setup standalone IPC handlers
  setupStandaloneHandlers(dockerSetup, mainWindow);

  // Add debug handler for window state testing
  const { ipcMain } = require('electron');
  ipcMain.handle('debug-save-window-state', () => {
    log.info('Manual window state save requested');
    mainWindowStateManager.saveCurrentState();
    return 'Window state saved';
  });

  ipcMain.handle('debug-get-window-state', () => {
    const state = mainWindowStateManager.getCurrentState();
    log.info('Current saved window state:', state);
    return state;
  });

  // Set security policies for webview, using the dynamic n8n port
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, _permission, callback) => {
    const url = webContents.getURL();
    const n8nPort = dockerSetup?.ports?.n8n; // Get the determined n8n port

    // Allow if the n8n port is determined and the URL matches
    if (n8nPort && url.startsWith(`http://localhost:${n8nPort}`)) {
      callback(true);
    } else {
      log.warn(`Blocked permission request for URL: ${url} (n8n port: ${n8nPort})`);
      callback(false);
    }
  });

  // Development mode with hot reload
  if (process.env.NODE_ENV === 'development') {
    if (process.env.ELECTRON_HOT_RELOAD === 'true') {
      // Hot reload mode
      const devServerUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';

      log.info('Loading development server with hot reload:', devServerUrl);
      mainWindow.loadURL(devServerUrl).catch(err => {
        log.error('Failed to load dev server:', err);
        // Fallback to local file if dev server fails
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      });

      // Enable hot reload by watching the renderer process
      mainWindow.webContents.on('did-fail-load', () => {
        log.warn('Page failed to load, retrying...');
        setTimeout(() => {
          mainWindow?.webContents.reload();
        }, 1000);
      });
    } else {
      // Development mode without hot reload - use built files
      log.info('Loading development build from dist directory');
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // DevTools will be opened after window is shown to prevent sizing conflicts
  } else {
    // Production mode - load built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    const bounds = mainWindow.getBounds();
    log.info(`Main window ready to show with bounds:`, bounds);

    mainWindow.show();

    // Focus the window to ensure it's in front
    mainWindow.focus();

    // Setup window state handlers after window is shown
    setTimeout(() => {
      mainWindowStateManager.setupEventHandlers(mainWindow);

      const finalBounds = mainWindow?.getBounds();
      log.info(`Main window final bounds after show:`, finalBounds);

      // Save initial state
      mainWindowStateManager.saveCurrentState();
    }, 100);

    // Open DevTools in development mode after window is shown and positioned
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }, 500); // Small delay to ensure window is fully rendered
    }

    // Initialize auto-updater when window is ready
    if (process.env.NODE_ENV !== 'development') {
      setupAutoUpdater(mainWindow);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowStateManager = null;
  });
}

// Initialize app when ready
app.whenReady().then(initializeApp);

// Register standalone handlers
app.whenReady().then(() => {
  // No duplicate handlers needed - they are registered in registerDockerContainerHandlers()
});

// Save window state before quitting
app.on('before-quit', () => {
  log.info('App is about to quit, saving window state');
  if (mainWindowStateManager) {
    mainWindowStateManager.saveCurrentState();
  }
});

// Quit when all windows are closed
app.on('window-all-closed', async () => {
  // Stop Docker containers
  if (dockerSetup) {
    await dockerSetup.stop();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

