const { app, BrowserWindow, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const DockerSetup = require('./dockerSetup.cjs');
const { setupAutoUpdater } = require('./updateService.cjs');
const SplashScreen = require('./splash.cjs');
const WelcomeScreen = require('./welcome.cjs');
const { createAppMenu } = require('./menu.cjs');
const { setupIpcHandlers, setupWelcomeHandlers, setupStandaloneHandlers } = require('./ipc/main_handle.cjs');

// Configure the main process logger
log.transports.file.level = 'info';
log.info('Application starting...');

// Global variables
let mainWindow;
let splash;
let welcomeScreen;
let dockerSetup;
let dockerHandlersRegistered = false;

// Window state management
const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function saveWindowState(window) {
  try {
    if (!window || window.isDestroyed()) {
      log.warn('Cannot save window state: window is destroyed or null');
      return;
    }

    const bounds = window.getBounds();
    const isMaximized = window.isMaximized();
    const isFullScreen = window.isFullScreen();

    const state = {
      bounds,
      isMaximized,
      isFullScreen,
      timestamp: Date.now()
    };

    // Ensure the user data directory exists
    const userDataDir = app.getPath('userData');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2));
    log.info('Window state saved:', state);
    console.log('✅ Window state saved to:', WINDOW_STATE_FILE);
  } catch (error) {
    log.error('Failed to save window state:', error);
  }
}

function loadWindowState() {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf8'));
      log.info('Raw loaded window state:', state);

      // Validate the state has valid bounds
      if (state && state.bounds) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

        // More lenient validation - just ensure bounds are reasonable
        if (state.bounds.width > 200 && state.bounds.height > 150 &&
            state.bounds.width <= screenWidth + 100 && state.bounds.height <= screenHeight + 100) {

          // Get all displays for multi-monitor support
          const allDisplays = screen.getAllDisplays();
          let isOnAnyDisplay = false;

          // Check if window is visible on any display
          for (const display of allDisplays) {
            const { x: dispX, y: dispY, width: dispWidth, height: dispHeight } = display.workArea;

            // Check if window overlaps with this display
            const windowRight = state.bounds.x + state.bounds.width;
            const windowBottom = state.bounds.y + state.bounds.height;
            const displayRight = dispX + dispWidth;
            const displayBottom = dispY + dispHeight;

            // Window is on this display if there's any overlap
            if (state.bounds.x < displayRight && windowRight > dispX &&
                state.bounds.y < displayBottom && windowBottom > dispY) {
              isOnAnyDisplay = true;
              log.info(`Main window is visible on display: ${display.id} at ${dispX},${dispY} ${dispWidth}x${dispHeight}`);
              break;
            }
          }

          // Only adjust position if window is completely off all displays
          if (!isOnAnyDisplay) {
            log.warn('Main window is off all displays, repositioning to primary display');
            state.bounds.x = Math.max(0, Math.min(state.bounds.x, screenWidth - state.bounds.width));
            state.bounds.y = Math.max(0, Math.min(state.bounds.y, screenHeight - state.bounds.height));
          } else {
            log.info('Main window position is valid for multi-monitor setup');
          }

          log.info('Successfully loaded and validated window state:', state);
          console.log('✅ Window state loaded from:', WINDOW_STATE_FILE);
          return state;
        } else {
          log.warn('Window state bounds are invalid:', state.bounds, 'Screen:', { screenWidth, screenHeight });
        }
      } else {
        log.warn('Window state missing bounds:', state);
      }
    } else {
      log.info('No window state file found, will use defaults');
    }
  } catch (error) {
    log.error('Failed to load window state:', error);
  }

  return null;
}

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
  // Use the refactored welcome handlers
  setupWelcomeHandlers(welcomeScreen, startMainAppWithDocker, startMainAppLimited);
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

  // Load saved window state or use defaults
  const savedState = loadWindowState();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Default window dimensions
  const defaultWidth = 1000;
  const defaultHeight = 700;
  const minWidth = 800;
  const minHeight = 600;

  // Use saved bounds or calculate centered position
  let windowOptions;
  if (savedState && savedState.bounds) {
    windowOptions = {
      x: savedState.bounds.x,
      y: savedState.bounds.y,
      width: savedState.bounds.width,
      height: savedState.bounds.height,
    };
    log.info(`Using saved window state:`, windowOptions);
  } else {
    // Center the window on screen
    windowOptions = {
      width: defaultWidth,
      height: defaultHeight,
      x: Math.floor((screenWidth - defaultWidth) / 2),
      y: Math.floor((screenHeight - defaultHeight) / 2),
    };
    log.info(`Using default window options (centered):`, windowOptions);
    log.info(`Screen dimensions:`, { screenWidth, screenHeight });
  }

  mainWindow = new BrowserWindow({
    ...windowOptions,
    minWidth,
    minHeight,
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

  // Restore window state if it was maximized or fullscreen
  if (savedState) {
    if (savedState.isMaximized) {
      mainWindow.maximize();
    }
    if (savedState.isFullScreen) {
      mainWindow.setFullScreen(true);
    }
  }

  // Create and set the application menu
  createAppMenu(mainWindow);

  // Setup standalone IPC handlers
  setupStandaloneHandlers(dockerSetup, mainWindow);

  // Add debug handler for window state testing
  const { ipcMain } = require('electron');
  ipcMain.handle('debug-save-window-state', () => {
    log.info('Manual window state save requested');
    saveWindowState(mainWindow);
    return 'Window state saved';
  });

  ipcMain.handle('debug-get-window-state', () => {
    const state = loadWindowState();
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
      setupWindowStateHandlers();

      const finalBounds = mainWindow?.getBounds();
      log.info(`Main window final bounds after show:`, finalBounds);

      // Save initial state
      saveWindowState(mainWindow);
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

  // Save window state when it changes - setup after window is ready
  const setupWindowStateHandlers = () => {
    const saveStateThrottled = (() => {
      let timeout;
      return (eventName) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          log.info(`Saving window state due to ${eventName} event`);
          saveWindowState(mainWindow);
        }, 500);
      };
    })();

    log.info('Setting up window state event handlers');

    mainWindow.on('resize', () => {
      const bounds = mainWindow.getBounds();
      log.debug('Window resize event triggered, new bounds:', bounds);
      console.log('🔄 Window resized to:', bounds);
      saveStateThrottled('resize');
    });

    mainWindow.on('move', () => {
      const bounds = mainWindow.getBounds();
      log.debug('Window move event triggered, new bounds:', bounds);
      console.log('🔄 Window moved to:', bounds);
      saveStateThrottled('move');
    });

    mainWindow.on('maximize', () => {
      log.info('Window maximize event triggered');
      saveWindowState(mainWindow);
    });

    mainWindow.on('unmaximize', () => {
      log.info('Window unmaximize event triggered');
      saveWindowState(mainWindow);
    });

    mainWindow.on('enter-full-screen', () => {
      log.info('Window enter-full-screen event triggered');
      saveWindowState(mainWindow);
    });

    mainWindow.on('leave-full-screen', () => {
      log.info('Window leave-full-screen event triggered');
      saveWindowState(mainWindow);
    });
  };

  mainWindow.on('closed', () => {
    // Save final state before closing
    if (mainWindow) {
      saveWindowState(mainWindow);
    }
    mainWindow = null;
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    saveWindowState(mainWindow);
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

