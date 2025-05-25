const { exec } = require('child_process');
const { promisify } = require('util');
const log = require('../helpers/log.cjs');

const execAsync = promisify(exec);

class PrerequisiteChecker {
  constructor() {
    log.info('Line 8 prerequisite_checker.cjs: PrerequisiteChecker initialized');
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

  async startPodman() {
    try {
      log.info('Line 113 prerequisite_checker.cjs: Attempting to start Podman');

      // Check if podman machine exists, if not initialize it
      try {
        await execAsync('podman machine list');
      } catch (error) {
        log.info('Line 118 prerequisite_checker.cjs: No Podman machine found, initializing...');
        await execAsync('podman machine init');
      }

      // Start the podman machine
      log.info('Line 123 prerequisite_checker.cjs: Starting Podman machine...');
      await execAsync('podman machine start');

      // Wait a moment for the machine to fully start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify it's working
      await execAsync('podman info');

      log.info('Line 131 prerequisite_checker.cjs: Podman started successfully');
      return { success: true, message: 'Podman started successfully' };

    } catch (error) {
      log.error('Line 135 prerequisite_checker.cjs: Failed to start Podman:', error.message);
      return {
        success: false,
        error: error.message,
        details: 'Failed to start Podman. You may need to run "podman machine init" and "podman machine start" manually.'
      };
    }
  }

  async checkAllPrerequisites() {
    log.info('Line 144 prerequisite_checker.cjs: Starting prerequisite checks');

    const results = {
      container: await this.checkContainerEngine(),
      network: await this.checkNetwork(),
      storage: await this.checkStorage()
    };

    log.info('Line 151 prerequisite_checker.cjs: Prerequisite check results:', results);
    return results;
  }
}

module.exports = PrerequisiteChecker;
