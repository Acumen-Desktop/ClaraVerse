const { BrowserWindow, app } = require('electron');
const path = require('path');
const log = require('../helpers/log.cjs');
const { createWelcomeWindowStateManager } = require('../helpers/window_state.cjs');

class WelcomeWindow {
  constructor() {
    this.window = null;
    this.windowStateManager = null;
    this.createWindow();
  }

  createWindow() {
    const isDev = process.env.NODE_ENV === 'development';

    // Create window state manager
    this.windowStateManager = createWelcomeWindowStateManager();

    // Get window options from state manager
    const windowOptions = this.windowStateManager.getWindowOptions();

    this.window = new BrowserWindow({
      ...windowOptions,
      minWidth: 1000,
      minHeight: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      resizable: true,
      movable: true,
      show: false,
      backgroundColor: '#f5f5f5',
      title: 'Welcome to ClaraVerse'
    });

    // Restore window state (maximize, fullscreen)
    this.windowStateManager.restoreWindowState(this.window);

    // Log any errors
    this.window.webContents.on('crashed', (e) => {
      log.error('Line 38 welcome_window.cjs: Welcome screen crashed:', e);
    });

    this.window.webContents.on('did-fail-load', (_event, code, description) => {
      log.error('Line 42 welcome_window.cjs: Failed to load welcome screen:', code, description);
    });

    const htmlPath = isDev
      ? path.join(__dirname, 'welcome.html')
      : path.join(app.getAppPath(), 'electron', 'welcome.html');

    log.info('Line 48 welcome_window.cjs: Loading welcome screen from:', htmlPath);
    this.window.loadFile(htmlPath);

    // Show window when ready
    this.window.once('ready-to-show', () => {
      const bounds = this.window.getBounds();
      log.info('Line 53 welcome_window.cjs: Welcome window ready to show with bounds:', bounds);

      this.window.show();
      this.window.webContents.openDevTools();

      // Focus the window to ensure it's in front
      this.window.focus();

      // Setup window state handlers after window is shown
      setTimeout(() => {
        this.windowStateManager.setupEventHandlers(this.window);

        const finalBounds = this.window?.getBounds();
        log.info('Line 63 welcome_window.cjs: Welcome window final bounds after show:', finalBounds);

        // Save initial state
        this.windowStateManager.saveCurrentState();
      }, 100);
    });
  }

  getWindow() {
    return this.window;
  }

  close() {
    if (this.window) {
      // Save final state before closing
      this.windowStateManager.saveCurrentState();
      this.window.close();
      this.window = null;
      this.windowStateManager = null;
    }
  }

  hide() {
    if (this.window) {
      this.window.hide();
    }
  }

  show() {
    if (this.window) {
      this.window.show();
    }
  }

  isDestroyed() {
    return !this.window || this.window.isDestroyed();
  }
}

module.exports = WelcomeWindow;
