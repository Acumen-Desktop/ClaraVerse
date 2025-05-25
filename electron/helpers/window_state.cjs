const { app, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('./log.cjs');


log.info('Line 42 myfile.js: Operation completed successfully');
log.warn('Line 55 myfile.js: Configuration warning');
log.error('Line 67 myfile.js: Something went wrong');

class WindowStateManager {
  constructor(options) {
    this.options = options;
    this.stateFile = path.join(app.getPath('userData'), options.fileName);
    this.window = null;
    this.saveTimeout = null;
  }

  /**
   * Save window state to disk
   */
  saveState(window) {
    try {
      if (!window || window.isDestroyed()) {
        log.warn(`Line 20 window_state.cjs: Cannot save window state for ${this.options.fileName}: window is destroyed or null`);
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

      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
      log.info(`Line 42 window_state.cjs: Window state saved for ${this.options.fileName}:`, state);
      log.info(`Line 43 window_state.cjs: Window state saved to: ${this.stateFile}`);
    } catch (error) {
      log.error(`Line 45 window_state.cjs: Failed to save window state for ${this.options.fileName}:`, error);
    }
  }

  /**
   * Load window state from disk
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        log.info(`Line 56 window_state.cjs: Raw loaded window state for ${this.options.fileName}:`, state);

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
                log.info(`Line 85 window_state.cjs: Window ${this.options.fileName} is visible on display: ${display.id} at ${dispX},${dispY} ${dispWidth}x${dispHeight}`);
                break;
              }
            }

            // Only adjust position if window is completely off all displays
            if (!isOnAnyDisplay) {
              log.warn(`Line 92 window_state.cjs: Window ${this.options.fileName} is off all displays, repositioning to primary display`);
              state.bounds.x = Math.max(0, Math.min(state.bounds.x, screenWidth - state.bounds.width));
              state.bounds.y = Math.max(0, Math.min(state.bounds.y, screenHeight - state.bounds.height));
            } else {
              log.info(`Line 96 window_state.cjs: Window ${this.options.fileName} position is valid for multi-monitor setup`);
            }

            log.info(`Line 99 window_state.cjs: Successfully loaded and validated window state for ${this.options.fileName}:`, state);
            log.info(`Line 100 window_state.cjs: Window state loaded from: ${this.stateFile}`);
            return state;
          } else {
            log.warn(`Line 103 window_state.cjs: Window state bounds are invalid for ${this.options.fileName}:`, state.bounds, 'Screen:', { screenWidth, screenHeight });
          }
        } else {
          log.warn(` Line 107 window_state.cjs: Window state missing bounds for ${this.options.fileName}:`, state);
        }
      } else {
        log.info(` Line 109 window_state.cjs: No window state file found for ${this.options.fileName}, will use defaults`);
      }
    } catch (error) {
      log.error(` Line 112 window_state.cjs: Failed to load window state for ${this.options.fileName}:`, error);
    }

    return null;
  }

  /**
   * Get window options for BrowserWindow constructor
   */
  getWindowOptions() {
    const savedState = this.loadState();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Use saved bounds or calculate centered position
    if (savedState && savedState.bounds) {
      const windowOptions = {
        x: savedState.bounds.x,
        y: savedState.bounds.y,
        width: savedState.bounds.width,
        height: savedState.bounds.height,
      };
      log.info(` Line 134 window_state.cjs: Using saved window state for ${this.options.fileName}:`, windowOptions);
      return windowOptions;
    } else {
      // Center the window on screen
      const windowOptions = {
        width: this.options.defaultWidth,
        height: this.options.defaultHeight,
        x: Math.floor((screenWidth - this.options.defaultWidth) / 2),
        y: Math.floor((screenHeight - this.options.defaultHeight) / 2),
      };
      log.info(`  Line 144 window_state.cjs: Using default window options for ${this.options.fileName} (centered):`, windowOptions);
      log.info(` Line 145 window_state.cjs: Screen dimensions:`, { screenWidth, screenHeight });
      return windowOptions;
    }
  }

  /**
   * Restore window state (maximize, fullscreen) after window creation
   */
  restoreWindowState(window) {
    const savedState = this.loadState();
    if (savedState) {
      if (savedState.isMaximized) {
        window.maximize();
      }
      if (savedState.isFullScreen) {
        window.setFullScreen(true);
      }
    }
  }

  /**
   * Setup event handlers for automatic state saving
   */
  setupEventHandlers(window) {
    this.window = window;

    const saveStateThrottled = (eventName) => {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(() => {
        log.info(` Line 176 window_state.cjs: Saving window state for ${this.options.fileName} due to ${eventName} event`);
        this.saveState(window);
      }, 500);
    };

    log.info(` Line 181 window_state.cjs: Setting up window state event handlers for ${this.options.fileName}`);

    window.on('resize', () => {
      const bounds = window.getBounds();
      log.debug(`Line 185 window_state.cjs: Window resize event triggered for ${this.options.fileName}, new bounds:`, bounds);
      log.debug(`Line 186 window_state.cjs: Window ${this.options.fileName} resized to:`, bounds);
      saveStateThrottled('resize');
    });

    window.on('move', () => {
      const bounds = window.getBounds();
      log.debug(`Line 192 window_state.cjs: Window move event triggered for ${this.options.fileName}, new bounds:`, bounds);
      log.debug(`Line 193 window_state.cjs: Window ${this.options.fileName} moved to:`, bounds);
      saveStateThrottled('move');
    });

    window.on('maximize', () => {
      log.info(` Line 198 window_state.cjs: Window maximize event triggered for ${this.options.fileName}`);
      this.saveState(window);
    });

    window.on('unmaximize', () => {
      log.info(`  Line 203 window_state.cjs: Window unmaximize event triggered for ${this.options.fileName}`);
      this.saveState(window);
    });

    window.on('enter-full-screen', () => {
      log.info(`  Line 208 window_state.cjs: Window enter-full-screen event triggered for ${this.options.fileName}`);
      this.saveState(window);
    });

    window.on('leave-full-screen', () => {
      log.info(`  Line 213 window_state.cjs: Window leave-full-screen event triggered for ${this.options.fileName}`);
      this.saveState(window);
    });

    window.on('closed', () => {
      // Save final state before closing
      if (window && !window.isDestroyed()) {
        this.saveState(window);
      }
      this.window = null;
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
    });
  }

  /**
   * Manually save current window state
   */
  saveCurrentState() {
    if (this.window && !this.window.isDestroyed()) {
      this.saveState(this.window);
    }
  }

  /**
   * Get current saved state
   */
  getCurrentState() {
    return this.loadState();
  }
}

// Factory functions for common window types
function createMainWindowStateManager() {
  return new WindowStateManager({
    fileName: 'window-state.json',
    defaultWidth: 1000,
    defaultHeight: 700,
    minWidth: 800,
    minHeight: 600
  });
}

function createWelcomeWindowStateManager() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  return new WindowStateManager({
    fileName: 'welcome-window-state.json',
    defaultWidth: Math.min(700, Math.floor(screenWidth * 0.6)),
    defaultHeight: Math.min(600, Math.floor(screenHeight * 0.7)),
    minWidth: 500,
    minHeight: 400
  });
}

module.exports = {
  WindowStateManager,
  createMainWindowStateManager,
  createWelcomeWindowStateManager
};
