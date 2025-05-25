const { ipcMain, shell } = require('electron');
const log = require('../helpers/log.cjs');
const SystemStats = require('../helpers/system_stats.cjs');

class WelcomeHandlers {
  constructor(prerequisiteChecker, startMainAppWithDocker, startMainAppLimited) {
    this.prerequisiteChecker = prerequisiteChecker;
    this.startMainAppWithDocker = startMainAppWithDocker;
    this.startMainAppLimited = startMainAppLimited;
    this.systemStats = new SystemStats();
    this.setupHandlers();
  }

  setupHandlers() {
    log.info('Line 12 welcome_handlers.cjs: Setting up welcome IPC handlers');

    // Check container engine
    ipcMain.handle('check-container-engine', async () => {
      if (!this.prerequisiteChecker) {
        return { available: false, error: 'Prerequisite checker not initialized' };
      }
      return await this.prerequisiteChecker.checkContainerEngine();
    });

    // Check network connectivity
    ipcMain.handle('check-network', async () => {
      if (!this.prerequisiteChecker) {
        return { available: false, error: 'Prerequisite checker not initialized' };
      }
      return await this.prerequisiteChecker.checkNetwork();
    });

    // Check storage space
    ipcMain.handle('check-storage', async () => {
      if (!this.prerequisiteChecker) {
        return { sufficient: false, error: 'Prerequisite checker not initialized' };
      }
      return await this.prerequisiteChecker.checkStorage();
    });

    // Start Podman
    ipcMain.handle('start-podman', async () => {
      log.info('Line 42 welcome_handlers.cjs: Starting Podman via IPC');
      if (!this.prerequisiteChecker) {
        return { success: false, error: 'Prerequisite checker not initialized' };
      }
      return await this.prerequisiteChecker.startPodman();
    });

    // Start main app with container setup
    ipcMain.handle('start-main-app', async () => {
      log.info('Line 35 welcome_handlers.cjs: Starting main app with containers');
      await this.startMainAppWithDocker();
    });

    // Start main app in limited mode (no containers)
    ipcMain.handle('start-main-app-limited', async () => {
      log.info('Line 40 welcome_handlers.cjs: Starting main app in limited mode');
      this.startMainAppLimited();
    });

    // Open setup guide
    ipcMain.handle('open-setup-guide', async () => {
      log.info('Line 45 welcome_handlers.cjs: Opening setup guide');
      shell.openExternal('https://github.com/badboysm890/ClaraVerse/blob/main/PODMAN_SETUP.md');
    });

    // Open external URL
    ipcMain.handle('open-external', async (_, url) => {
      log.info('Line 50 welcome_handlers.cjs: Opening external URL:', url);
      shell.openExternal(url);
    });

    // Get system stats
    ipcMain.handle('get-system-stats', async () => {
      try {
        log.info('Line 67 welcome_handlers.cjs: Getting system stats');
        return await this.systemStats.getFormattedStats();
      } catch (error) {
        log.error('Line 70 welcome_handlers.cjs: Error getting system stats:', error);
        return {
          user: 'Unknown',
          os: 'Unknown',
          platform: 'Unknown',
          cpu: 'Unknown',
          memory: 'Unknown',
          node: 'Unknown'
        };
      }
    });
  }

  cleanup() {
    log.info('Line 55 welcome_handlers.cjs: Cleaning up welcome IPC handlers');

    // Remove all welcome-specific handlers
    ipcMain.removeAllListeners('check-container-engine');
    ipcMain.removeAllListeners('check-network');
    ipcMain.removeAllListeners('check-storage');
    ipcMain.removeAllListeners('start-podman');
    ipcMain.removeAllListeners('start-main-app');
    ipcMain.removeAllListeners('start-main-app-limited');
    ipcMain.removeAllListeners('open-setup-guide');
    ipcMain.removeAllListeners('open-external');
    ipcMain.removeAllListeners('get-system-stats');
  }
}

module.exports = WelcomeHandlers;
