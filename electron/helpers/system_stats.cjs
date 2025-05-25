const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const log = require('./log.cjs');

const execAsync = promisify(exec);

class SystemStats {
  constructor() {
    log.info('Line 8 system_stats.cjs: SystemStats initialized');
  }

  /**
   * Get comprehensive system and user information
   * @returns {Promise<Object>} System stats object
   */
  async getSystemStats() {
    try {
      const stats = {
        user: await this.getUserInfo(),
        system: await this.getSystemInfo(),
        hardware: await this.getHardwareInfo(),
        runtime: this.getRuntimeInfo()
      };

      log.info('Line 22 system_stats.cjs: System stats collected successfully');
      return stats;
    } catch (error) {
      log.error('Line 25 system_stats.cjs: Error collecting system stats:', error);
      return this.getFallbackStats();
    }
  }

  /**
   * Get user information
   * @returns {Promise<Object>} User info object
   */
  async getUserInfo() {
    try {
      const userInfo = os.userInfo();
      return {
        username: userInfo.username,
        homedir: userInfo.homedir,
        shell: userInfo.shell || 'Unknown'
      };
    } catch (error) {
      log.warn('Line 40 system_stats.cjs: Error getting user info:', error);
      return {
        username: 'Unknown',
        homedir: 'Unknown',
        shell: 'Unknown'
      };
    }
  }

  /**
   * Get system information
   * @returns {Promise<Object>} System info object
   */
  async getSystemInfo() {
    try {
      const platform = os.platform();
      const release = os.release();
      const type = os.type();
      const arch = os.arch();
      const hostname = os.hostname();

      // Get more detailed OS info based on platform
      let osVersion = `${type} ${release}`;
      try {
        if (platform === 'darwin') {
          const { stdout } = await execAsync('sw_vers -productVersion');
          osVersion = `macOS ${stdout.trim()}`;
        } else if (platform === 'linux') {
          try {
            const { stdout } = await execAsync('lsb_release -d -s');
            osVersion = stdout.trim().replace(/"/g, '');
          } catch {
            // Fallback for systems without lsb_release
            try {
              const { stdout } = await execAsync('cat /etc/os-release | grep PRETTY_NAME');
              const match = stdout.match(/PRETTY_NAME="(.+)"/);
              if (match) osVersion = match[1];
            } catch {
              // Keep default
            }
          }
        } else if (platform === 'win32') {
          try {
            const { stdout } = await execAsync('wmic os get Caption /value');
            const match = stdout.match(/Caption=(.+)/);
            if (match) osVersion = match[1].trim();
          } catch {
            // Keep default
          }
        }
      } catch (error) {
        log.warn('Line 81 system_stats.cjs: Error getting detailed OS version:', error);
      }

      return {
        platform,
        arch,
        hostname,
        osVersion,
        uptime: os.uptime()
      };
    } catch (error) {
      log.warn('Line 91 system_stats.cjs: Error getting system info:', error);
      return {
        platform: 'Unknown',
        arch: 'Unknown',
        hostname: 'Unknown',
        osVersion: 'Unknown',
        uptime: 0
      };
    }
  }

  /**
   * Get hardware information
   * @returns {Promise<Object>} Hardware info object
   */
  async getHardwareInfo() {
    try {
      const cpus = os.cpus();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;

      // Get CPU model (first CPU info)
      const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';
      const cpuCores = cpus.length;

      // Format memory in GB
      const totalMemoryGB = (totalMemory / (1024 ** 3)).toFixed(1);
      const usedMemoryGB = (usedMemory / (1024 ** 3)).toFixed(1);
      const freeMemoryGB = (freeMemory / (1024 ** 3)).toFixed(1);

      return {
        cpu: {
          model: cpuModel,
          cores: cpuCores,
          speed: cpus.length > 0 ? cpus[0].speed : 0
        },
        memory: {
          total: totalMemoryGB,
          used: usedMemoryGB,
          free: freeMemoryGB,
          totalBytes: totalMemory,
          usedBytes: usedMemory,
          freeBytes: freeMemory
        }
      };
    } catch (error) {
      log.warn('Line 133 system_stats.cjs: Error getting hardware info:', error);
      return {
        cpu: {
          model: 'Unknown',
          cores: 0,
          speed: 0
        },
        memory: {
          total: '0.0',
          used: '0.0',
          free: '0.0',
          totalBytes: 0,
          usedBytes: 0,
          freeBytes: 0
        }
      };
    }
  }

  /**
   * Get runtime information
   * @returns {Object} Runtime info object
   */
  getRuntimeInfo() {
    try {
      return {
        nodeVersion: process.version,
        electronVersion: process.versions.electron || 'Unknown',
        v8Version: process.versions.v8 || 'Unknown',
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      };
    } catch (error) {
      log.warn('Line 163 system_stats.cjs: Error getting runtime info:', error);
      return {
        nodeVersion: 'Unknown',
        electronVersion: 'Unknown',
        v8Version: 'Unknown',
        platform: 'Unknown',
        arch: 'Unknown',
        pid: 0
      };
    }
  }

  /**
   * Get fallback stats when main collection fails
   * @returns {Object} Fallback stats object
   */
  getFallbackStats() {
    return {
      user: {
        username: 'Unknown',
        homedir: 'Unknown',
        shell: 'Unknown'
      },
      system: {
        platform: process.platform || 'Unknown',
        arch: process.arch || 'Unknown',
        hostname: 'Unknown',
        osVersion: 'Unknown',
        uptime: 0
      },
      hardware: {
        cpu: {
          model: 'Unknown',
          cores: 0,
          speed: 0
        },
        memory: {
          total: '0.0',
          used: '0.0',
          free: '0.0',
          totalBytes: 0,
          usedBytes: 0,
          freeBytes: 0
        }
      },
      runtime: {
        nodeVersion: process.version || 'Unknown',
        electronVersion: process.versions.electron || 'Unknown',
        v8Version: process.versions.v8 || 'Unknown',
        platform: process.platform || 'Unknown',
        arch: process.arch || 'Unknown',
        pid: process.pid || 0
      }
    };
  }

  /**
   * Format stats for display in the welcome screen
   * @returns {Promise<Object>} Formatted stats for UI
   */
  async getFormattedStats() {
    const stats = await this.getSystemStats();
    
    return {
      user: stats.user.username,
      os: stats.system.osVersion,
      platform: `${stats.system.platform}/${stats.system.arch}`,
      cpu: `${stats.hardware.cpu.model.substring(0, 30)}${stats.hardware.cpu.model.length > 30 ? '...' : ''} (${stats.hardware.cpu.cores} cores)`,
      memory: `${stats.hardware.memory.used}GB / ${stats.hardware.memory.total}GB`,
      node: stats.runtime.nodeVersion
    };
  }
}

module.exports = SystemStats;
