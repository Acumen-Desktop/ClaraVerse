// Centralized IPC handlers for ClaraVerse
// This file contains all IPC communication handlers between the main and renderer processes

const { ipcMain, shell, systemPreferences, app } = require('electron');
const path = require('path');
const log = require('electron-log');
const { checkForUpdates } = require('../updateService.cjs');

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function setupIpcHandlers(dockerSetup) {
  // Service Management Handlers
  ipcMain.handle('get-service-ports', async () => {
    return dockerSetup ? dockerSetup.ports : null;
  });

  ipcMain.handle('check-n8n-health', async () => {
    try {
      return await dockerSetup.checkN8NHealth();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('start-n8n', async () => {
    try {
      return await dockerSetup.startN8N();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('stop-n8n', async () => {
    try {
      return await dockerSetup.stopN8N();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-python-port', async () => {
    try {
      return dockerSetup ? dockerSetup.ports.python : null;
    } catch (error) {
      return null;
    }
  });

  ipcMain.handle('check-python-backend', async () => {
    try {
      const port = dockerSetup ? dockerSetup.ports.python : null;
      return { port };
    } catch (error) {
      return { port: null };
    }
  });

  // Docker Container Management Handlers
  ipcMain.handle('get-containers', async () => {
    try {
      if (!dockerSetup) return [];

      const docker = dockerSetup.docker;
      const containers = await docker.listContainers({ all: true });

      return containers.map((container) => {
        const ports = container.Ports.map((p) =>
          p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}` : `${p.PrivatePort}`
        );

        return {
          id: container.Id,
          name: container.Names[0].replace(/^\//, ''),
          image: container.Image,
          status: container.Status,
          state: container.State === 'running' ? 'running' :
                 container.State === 'exited' ? 'stopped' : container.State,
          ports: ports,
          created: new Date(container.Created * 1000).toLocaleString()
        };
      });
    } catch (error) {
      console.error('Error listing containers:', error);
      return [];
    }
  });

  ipcMain.handle('container-action', async (_event, { containerId, action }) => {
    try {
      if (!dockerSetup) throw new Error('Docker setup not initialized');

      const docker = dockerSetup.docker;
      const container = docker.getContainer(containerId);

      switch (action) {
        case 'start':
          await container.start();
          break;
        case 'stop':
          await container.stop();
          break;
        case 'restart':
          await container.restart();
          break;
        case 'remove':
          await container.remove({ force: true });
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`Error performing action ${action} on container:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('create-container', async (_event, containerConfig) => {
    try {
      if (!dockerSetup) throw new Error('Docker setup not initialized');

      const docker = dockerSetup.docker;

      // Format ports for Docker API
      const portBindings = {};
      const exposedPorts = {};

      containerConfig.ports.forEach((port) => {
        const containerPort = `${port.container}/tcp`;
        exposedPorts[containerPort] = {};
        portBindings[containerPort] = [{ HostPort: port.host.toString() }];
      });

      // Format volumes for Docker API
      const binds = containerConfig.volumes.map((volume) =>
        `${volume.host}:${volume.container}`
      );

      // Format environment variables
      const env = Object.entries(containerConfig.env).map(([key, value]) => `${key}=${value}`);

      // Create container
      const container = await docker.createContainer({
        Image: containerConfig.image,
        name: containerConfig.name,
        ExposedPorts: exposedPorts,
        Env: env,
        HostConfig: {
          PortBindings: portBindings,
          Binds: binds,
          NetworkMode: 'clara_network'
        }
      });

      // Start the container
      await container.start();

      return { success: true, id: container.id };
    } catch (error) {
      console.error('Error creating container:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-container-stats', async (_event, containerId) => {
    try {
      if (!dockerSetup) throw new Error('Docker setup not initialized');

      const docker = dockerSetup.docker;
      const container = docker.getContainer(containerId);

      const stats = await container.stats({ stream: false });

      // Calculate CPU usage percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemCpuDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuCount = stats.cpu_stats.online_cpus || 1;
      const cpuPercent = (cpuDelta / systemCpuDelta) * cpuCount * 100;

      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 1;
      const memoryPercent = (memoryUsage / memoryLimit) * 100;

      // Format network I/O
      let networkRx = 0;
      let networkTx = 0;

      if (stats.networks) {
        Object.keys(stats.networks).forEach(iface => {
          networkRx += stats.networks[iface].rx_bytes || 0;
          networkTx += stats.networks[iface].tx_bytes || 0;
        });
      }

      return {
        cpu: `${cpuPercent.toFixed(2)}%`,
        memory: `${formatBytes(memoryUsage)} / ${formatBytes(memoryLimit)} (${memoryPercent.toFixed(2)}%)`,
        network: `↓ ${formatBytes(networkRx)} / ↑ ${formatBytes(networkTx)}`
      };
    } catch (error) {
      console.error('Error getting container stats:', error);
      return { cpu: 'N/A', memory: 'N/A', network: 'N/A' };
    }
  });

  ipcMain.handle('get-container-logs', async (_event, containerId) => {
    try {
      if (!dockerSetup) throw new Error('Docker setup not initialized');

      const docker = dockerSetup.docker;
      const container = docker.getContainer(containerId);

      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100,
        follow: false
      });

      return logs.toString();
    } catch (error) {
      console.error('Error getting container logs:', error);
      return '';
    }
  });

  // Add handler for restarting interpreter container
  ipcMain.handle('restartInterpreterContainer', async () => {
    try {
      if (!dockerSetup || !dockerSetup.docker) {
        throw new Error('Docker setup not initialized');
      }

      log.info('Restarting interpreter container...');

      // Check if container exists
      try {
        // Stop and remove the interpreter container
        const container = await dockerSetup.docker.getContainer('clara_interpreter');
        log.info('Stopping interpreter container...');
        await container.stop();
        log.info('Removing interpreter container...');
        await container.remove();
      } catch (containerError) {
        log.error('Error handling existing container:', containerError);
        // Continue even if container doesn't exist or can't be stopped/removed
      }

      // Start a new container
      log.info('Starting new interpreter container...');
      await dockerSetup.startContainer(dockerSetup.containers.interpreter);
      log.info('Interpreter container restarted successfully');
      return { success: true };
    } catch (error) {
      log.error('Error restarting interpreter container:', error);
      return { success: false, error: error.message };
    }
  });
}

// Welcome screen handlers
function setupWelcomeHandlers(welcomeScreen, startMainAppWithDocker, startMainAppLimited) {
  // Check container engine availability
  ipcMain.handle('check-container-engine', async () => {
    if (!welcomeScreen) return { available: false, error: 'Welcome screen not initialized' };
    return await welcomeScreen.checkContainerEngine();
  });

  // Check network connectivity
  ipcMain.handle('check-network', async () => {
    if (!welcomeScreen) return { available: false, error: 'Welcome screen not initialized' };
    return await welcomeScreen.checkNetwork();
  });

  // Check storage space
  ipcMain.handle('check-storage', async () => {
    if (!welcomeScreen) return { sufficient: false, error: 'Welcome screen not initialized' };
    return await welcomeScreen.checkStorage();
  });

  // Start main app with container setup
  ipcMain.handle('start-main-app', async () => {
    await startMainAppWithDocker();
  });

  // Start main app in limited mode (no containers)
  ipcMain.handle('start-main-app-limited', async () => {
    startMainAppLimited();
  });

  // Open setup guide
  ipcMain.handle('open-setup-guide', async () => {
    shell.openExternal('https://github.com/badboysm890/ClaraVerse/blob/main/PODMAN_SETUP.md');
  });

  // Open external URL
  ipcMain.handle('open-external', async (_, url) => {
    shell.openExternal(url);
  });
}

// Standalone handlers that don't require specific setup objects
function setupStandaloneHandlers(dockerSetup, mainWindow) {
  // Handle IPC messages
  ipcMain.handle('get-app-path', () => app.getPath('userData'));
  ipcMain.handle('getWorkflowsPath', () => {
    return path.join(app.getAppPath(), 'workflows', 'n8n_workflows_full.json');
  });

  // Add handler for checking updates
  ipcMain.handle('check-for-updates', () => {
    return checkForUpdates();
  });

  // Handle microphone permission request
  ipcMain.handle('request-microphone-permission', async () => {
    if (process.platform === 'darwin') {
      const status = await systemPreferences.getMediaAccessStatus('microphone');
      if (status === 'not-determined') {
        return await systemPreferences.askForMediaAccess('microphone');
      }
      return status === 'granted';
    }
    return true;
  });

  // IPC handler to get service ports
  ipcMain.handle('get-service-ports', () => {
    if (dockerSetup && dockerSetup.ports) {
      return dockerSetup.ports;
    }
    return null; // Or throw an error if setup isn't complete
  });

  // IPC handler to get Python port specifically
  ipcMain.handle('get-python-port', () => {
    if (dockerSetup && dockerSetup.ports && dockerSetup.ports.python) {
      return dockerSetup.ports.python;
    }
    return null;
  });

  // IPC handler to check Python backend status
  ipcMain.handle('check-python-backend', async () => {
    try {
      if (!dockerSetup || !dockerSetup.ports || !dockerSetup.ports.python) {
        return { status: 'error', message: 'Python backend not configured' };
      }

      // Check if Python container is running
      const isRunning = await dockerSetup.isPythonRunning();
      if (!isRunning) {
        return { status: 'error', message: 'Python backend container not running' };
      }

      return {
        status: 'running',
        port: dockerSetup.ports.python
      };
    } catch (error) {
      log.error('Error checking Python backend:', error);
      return { status: 'error', message: error.message };
    }
  });

  // Handle backend status updates
  ipcMain.on('backend-status', (event, status) => {
    if (mainWindow) {
      mainWindow.webContents.send('backend-status', status);
    }
  });

  // Handle Python status updates
  ipcMain.on('python-status', (event, status) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-status', status);
    }
  });
}

// Export functions for CommonJS
module.exports = {
  setupIpcHandlers,
  setupWelcomeHandlers,
  setupStandaloneHandlers
};