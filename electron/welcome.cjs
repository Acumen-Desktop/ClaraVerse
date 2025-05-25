const { BrowserWindow, app, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const log = require('electron-log');

const execAsync = promisify(exec);

// Welcome screen window state management
const WELCOME_WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'welcome-window-state.json');

function saveWelcomeWindowState(window) {
  try {
    if (!window || window.isDestroyed()) {
      log.warn('Cannot save welcome window state: window is destroyed or null');
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

    fs.writeFileSync(WELCOME_WINDOW_STATE_FILE, JSON.stringify(state, null, 2));
    log.info('Welcome window state saved:', state);
    console.log('✅ Welcome window state saved to:', WELCOME_WINDOW_STATE_FILE);
  } catch (error) {
    log.error('Failed to save welcome window state:', error);
  }
}

function loadWelcomeWindowState() {
  try {
    if (fs.existsSync(WELCOME_WINDOW_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(WELCOME_WINDOW_STATE_FILE, 'utf8'));
      log.info('Raw loaded welcome window state:', state);

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
              log.info(`Welcome window is visible on display: ${display.id} at ${dispX},${dispY} ${dispWidth}x${dispHeight}`);
              break;
            }
          }

          // Only adjust position if window is completely off all displays
          if (!isOnAnyDisplay) {
            log.warn('Welcome window is off all displays, repositioning to primary display');
            state.bounds.x = Math.max(0, Math.min(state.bounds.x, screenWidth - state.bounds.width));
            state.bounds.y = Math.max(0, Math.min(state.bounds.y, screenHeight - state.bounds.height));
          } else {
            log.info('Welcome window position is valid for multi-monitor setup');
          }

          log.info('Successfully loaded and validated welcome window state:', state);
          console.log('✅ Welcome window state loaded from:', WELCOME_WINDOW_STATE_FILE);
          return state;
        } else {
          log.warn('Welcome window state bounds are invalid:', state.bounds, 'Screen:', { screenWidth, screenHeight });
        }
      } else {
        log.warn('Welcome window state missing bounds:', state);
      }
    } else {
      log.info('No welcome window state file found, will use defaults');
    }
  } catch (error) {
    log.error('Failed to load welcome window state:', error);
  }

  return null;
}

class WelcomeScreen {
  constructor() {
    const isDev = process.env.NODE_ENV === 'development';

    // Load saved window state or use defaults
    const savedState = loadWelcomeWindowState();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Default window dimensions
    const defaultWidth = Math.min(700, Math.floor(screenWidth * 0.6));
    const defaultHeight = Math.min(600, Math.floor(screenHeight * 0.7));
    const minWidth = 500;
    const minHeight = 400;

    // Use saved bounds or calculate centered position
    let windowOptions;
    if (savedState && savedState.bounds) {
      windowOptions = {
        x: savedState.bounds.x,
        y: savedState.bounds.y,
        width: savedState.bounds.width,
        height: savedState.bounds.height,
      };
      log.info(`Using saved welcome window state:`, windowOptions);
    } else {
      // Center the window on screen
      windowOptions = {
        width: defaultWidth,
        height: defaultHeight,
        x: Math.floor((screenWidth - defaultWidth) / 2),
        y: Math.floor((screenHeight - defaultHeight) / 2),
      };
      log.info(`Using default welcome window options (centered):`, windowOptions);
      log.info(`Screen dimensions:`, { screenWidth, screenHeight });
    }

    this.window = new BrowserWindow({
      ...windowOptions,
      minWidth,
      minHeight,
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

    // Restore window state if it was maximized or fullscreen
    if (savedState) {
      if (savedState.isMaximized) {
        this.window.maximize();
      }
      if (savedState.isFullScreen) {
        this.window.setFullScreen(true);
      }
    }

    // Log any errors
    this.window.webContents.on('crashed', (e) => {
      console.error('Welcome screen crashed:', e);
    });

    this.window.webContents.on('did-fail-load', (_event, code, description) => {
      console.error('Failed to load welcome screen:', code, description);
    });

    const htmlPath = isDev
      ? path.join(__dirname, 'welcome.html')
      : path.join(app.getAppPath(), 'electron', 'welcome.html');

    console.log('Loading welcome screen from:', htmlPath);
    this.window.loadFile(htmlPath);

    // Show window when ready
    this.window.once('ready-to-show', () => {
      const bounds = this.window.getBounds();
      log.info(`Welcome window ready to show with bounds:`, bounds);

      this.window.show();

      // Focus the window to ensure it's in front
      this.window.focus();

      // Setup window state handlers after window is shown
      setTimeout(() => {
        this.setupWindowStateHandlers();

        const finalBounds = this.window?.getBounds();
        log.info(`Welcome window final bounds after show:`, finalBounds);

        // Save initial state
        saveWelcomeWindowState(this.window);
      }, 100);
    });
  }

  setupWindowStateHandlers() {
    const saveStateThrottled = (() => {
      let timeout;
      return (eventName) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          log.info(`Saving welcome window state due to ${eventName} event`);
          saveWelcomeWindowState(this.window);
        }, 500);
      };
    })();

    log.info('Setting up welcome window state event handlers');

    this.window.on('resize', () => {
      const bounds = this.window.getBounds();
      log.debug('Welcome window resize event triggered, new bounds:', bounds);
      console.log('🔄 Welcome window resized to:', bounds);
      saveStateThrottled('resize');
    });

    this.window.on('move', () => {
      const bounds = this.window.getBounds();
      log.debug('Welcome window move event triggered, new bounds:', bounds);
      console.log('🔄 Welcome window moved to:', bounds);
      saveStateThrottled('move');
    });

    this.window.on('maximize', () => {
      log.info('Welcome window maximize event triggered');
      saveWelcomeWindowState(this.window);
    });

    this.window.on('unmaximize', () => {
      log.info('Welcome window unmaximize event triggered');
      saveWelcomeWindowState(this.window);
    });

    this.window.on('enter-full-screen', () => {
      log.info('Welcome window enter-full-screen event triggered');
      saveWelcomeWindowState(this.window);
    });

    this.window.on('leave-full-screen', () => {
      log.info('Welcome window leave-full-screen event triggered');
      saveWelcomeWindowState(this.window);
    });
  }

  async checkContainerEngine() {
    try {
      // Check for Podman first
      try {
        await execAsync('command -v podman');
        await execAsync('podman --version');
        // Try to check if Podman is actually working (but don't fail if it's not running)
        try {
          await execAsync('podman info');
          return { available: true, engine: 'Podman', status: 'running' };
        } catch (infoError) {
          // Podman is installed but not running/configured
          return { available: true, engine: 'Podman', status: 'not_running', details: 'Podman is installed but may need to be started' };
        }
      } catch (podmanError) {
        // Check for Docker
        try {
          await execAsync('command -v docker');
          await execAsync('docker --version');
          // Try to check if Docker is actually working
          try {
            await execAsync('docker info');
            return { available: true, engine: 'Docker', status: 'running' };
          } catch (infoError) {
            // Docker is installed but not running
            return { available: true, engine: 'Docker', status: 'not_running', details: 'Docker is installed but not running' };
          }
        } catch (dockerError) {
          return {
            available: false,
            error: 'Neither Podman nor Docker found',
            details: 'Please install Podman (recommended) or Docker to continue'
          };
        }
      }
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }

  async checkNetwork() {
    try {
      // Try to reach a reliable endpoint
      await execAsync('curl -s --max-time 5 https://www.google.com > /dev/null');
      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: 'No internet connection detected'
      };
    }
  }

  async checkStorage() {
    try {
      const homeDir = require('os').homedir();

      // Get disk usage (this is a simplified check)
      try {
        const { stdout } = await execAsync(`df -h "${homeDir}" | tail -1`);
        const parts = stdout.trim().split(/\s+/);
        const available = parts[3]; // Available space

        // Parse available space (rough check)
        const availableNum = parseFloat(available);
        const unit = available.slice(-1).toUpperCase();

        let availableGB = 0;
        if (unit === 'G') {
          availableGB = availableNum;
        } else if (unit === 'T') {
          availableGB = availableNum * 1024;
        } else if (unit === 'M') {
          availableGB = availableNum / 1024;
        }

        return {
          sufficient: availableGB > 2, // Need at least 2GB
          available: available,
          availableGB: availableGB
        };
      } catch (dfError) {
        // Fallback for systems without df command
        return {
          sufficient: true,
          available: 'Unknown',
          availableGB: 0
        };
      }
    } catch (error) {
      return {
        sufficient: true,
        available: 'Unknown',
        error: error.message
      };
    }
  }

  close() {
    if (this.window) {
      // Save final state before closing
      saveWelcomeWindowState(this.window);
      this.window.close();
      this.window = null;
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
}

module.exports = WelcomeScreen;
