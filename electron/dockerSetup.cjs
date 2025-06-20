const { EventEmitter } = require('events');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const tar = require('tar-fs');
const http = require('http');

class DockerSetup extends EventEmitter {
  constructor(options = {}) {
    super();
    this.isDevMode = process.env.NODE_ENV === 'development';
    this.appDataPath = path.join(os.homedir(), '.clara');

    // Lean mode configuration
    this.leanMode = options.leanMode || false;
    console.log(`DockerSetup: Initializing in ${this.leanMode ? 'LEAN' : 'FULL'} mode`);

    // Docker binary paths - using Docker CLI path for both docker and compose commands
    this.dockerPath = '/usr/local/bin/docker';

    // Initialize Docker client with the first working socket
    this.docker = this.initializeDockerClient();

    // Path for storing pull timestamps
    this.pullTimestampsPath = path.join(this.appDataPath, 'pull_timestamps.json');

    // Container configuration
    this.containers = {
      python: {
        name: 'clara_python',
        image: this.leanMode ? 'clara17verse/clara-backend:lean' : 'clara17verse/clara-backend:latest',
        port: 5001,
        internalPort: 5000,
        healthCheck: this.isPythonRunning.bind(this),
        volumes: [
          `${this.appDataPath}:/root/.clara`
        ]
      },
      interpreter: {
        name: 'clara_interpreter',
        image: 'clara17verse/clara-interpreter:latest',
        port: 8000,
        internalPort: 8000,
        healthCheck: this.isInterpreterRunning.bind(this),
        volumes: [
          `${path.join(this.appDataPath, 'interpreter')}:/app/data`
        ]
      },
      n8n: {
        name: 'clara_n8n',
        image: 'n8nio/n8n',
        port: 5678,
        internalPort: 5678,
        healthCheck: this.checkN8NHealth.bind(this),
        volumes: [
          `${path.join(this.appDataPath, 'n8n')}:/home/node/.n8n`
        ]
      },
      ollama: {
        name: 'clara_ollama',
        image: 'ollama/ollama',
        port: 11434,
        internalPort: 11434,
        healthCheck: this.isOllamaRunning.bind(this),
        volumes: [
          `${path.join(this.appDataPath, 'ollama')}:/root/.ollama`
        ]
      }
    };

    // Ensure app data directory exists
    if (!fs.existsSync(this.appDataPath)) {
      fs.mkdirSync(this.appDataPath, { recursive: true });
    }

    // Initialize pull timestamps if not exists
    this.initializePullTimestamps();

    // Docker Compose file path
    this.composeFilePath = path.join(this.appDataPath, 'docker-compose.yml');

    // Docker Desktop app paths
    this.dockerAppPaths = {
      darwin: '/Applications/Docker.app'
    };

    // Get the app root directory
    this.appRoot = path.resolve(__dirname, '..');

    // Default ports with fallbacks
    this.ports = {
      python: 5001,
      n8n: 5678,
      ollama: 11434,
      interpreter: 8000
    };

    // Maximum retry attempts for service health checks
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds

    // Clara container names
    this.containerNames = ['clara_python', 'clara_n8n', 'clara_ollama', 'clara_interpreter'];

    // Create subdirectories for each service
    Object.keys(this.containers).forEach(service => {
      const servicePath = path.join(this.appDataPath, service);
      if (!fs.existsSync(servicePath)) {
        fs.mkdirSync(servicePath, { recursive: true });
      }
    });
  }

  // Get containers based on mode (lean vs full)
  getActiveContainers() {
    if (this.leanMode) {
      // Lean mode: only essential backend service
      return {
        python: this.containers.python
      };
    } else {
      // Full mode: all services
      return this.containers;
    }
  }

  async execAsync(command, timeout = 60000) {
    // Detect if we're using Podman or Docker and adjust commands accordingly
    const isPodman = this.isUsingPodman();
    const containerEngine = isPodman ? 'podman' : 'docker';
    const enginePath = isPodman ? '/usr/local/bin/podman' : this.dockerPath;

    // Replace docker-compose with appropriate compose command
    if (isPodman) {
      command = command
        .replace(/^docker-compose\s/, `${enginePath} compose `)
        .replace(/^docker\s/, `${enginePath} `);
    } else {
      command = command
        .replace(/^docker-compose\s/, `"${this.dockerPath}" compose `)
        .replace(/^docker\s/, `"${this.dockerPath}" `);
    }

    return new Promise((resolve, reject) => {
      exec(command, {
        timeout,
        env: {
          ...process.env,
          PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
        }
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  isUsingPodman() {
    // Check if current socket is a Podman socket
    if (this.docker && this.docker.modem && this.docker.modem.socketPath) {
      const socketPath = this.docker.modem.socketPath;
      return socketPath.includes('podman') || socketPath.includes('/run/user/');
    }
    return false;
  }

  async findAvailablePort(startPort, endPort = startPort + 100) {
    for (let port = startPort; port <= endPort; port++) {
      try {
        await this.execAsync(`lsof -i :${port}`);
      } catch (error) {
        // If lsof fails, it means the port is available
        return port;
      }
    }
    throw new Error(`No available ports found between ${startPort} and ${endPort}`);
  }

  async isPortInUse(port) {
    try {
      await this.execAsync(`lsof -i :${port}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  async findWorkingDockerSocket() {
    console.log('DockerSetup: Searching for working container engine socket...');

    // List of possible Docker/Podman socket locations (Podman first for preference)
    const possibleSockets = [
      // Podman socket locations (prioritized)
      path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'podman.sock'),
      path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'podman-machine-default', 'podman.sock'),
      `/run/user/${process.getuid ? process.getuid() : 1000}/podman/podman.sock`,
      path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'qemu', 'podman.sock'),
      '/run/podman/podman.sock',
      // Docker Desktop locations
      path.join(os.homedir(), '.docker', 'desktop', 'docker.sock'),
      path.join(os.homedir(), '.docker', 'docker.sock'),
      // Traditional Linux socket locations
      '/var/run/docker.sock',
      '/run/docker.sock',
      // WSL2 socket location
      '/mnt/wsl/docker-desktop/docker.sock',
      // Colima socket location (for macOS/Linux)
      path.join(os.homedir(), '.colima', 'docker.sock'),
      // Rancher Desktop socket location
      path.join(os.homedir(), '.rd', 'docker.sock')
    ];

    console.log('DockerSetup: Checking socket locations:', possibleSockets);

    // Windows pipe
    if (process.platform === 'win32') {
      return '//./pipe/docker_engine';
    }

    // Check environment variable first
    if (process.env.DOCKER_HOST) {
      const match = process.env.DOCKER_HOST.match(/unix:\/\/(.*)/);
      if (match && match[1]) {
        try {
          const docker = new Docker({ socketPath: match[1] });
          await docker.ping();
          console.log('Using Docker socket from DOCKER_HOST:', match[1]);
          return match[1];
        } catch (error) {
          console.log('DOCKER_HOST socket not working:', error.message);
        }
      }
    }

    // Try each socket location
    for (const socketPath of possibleSockets) {
      try {
        console.log(`DockerSetup: Checking socket: ${socketPath}`);
        if (fs.existsSync(socketPath)) {
          console.log(`DockerSetup: Socket exists, testing connection...`);
          const docker = new Docker({ socketPath });
          await docker.ping();
          console.log(`DockerSetup: Socket working! Using: ${socketPath}`);
          return socketPath;
        } else {
          console.log(`DockerSetup: Socket does not exist: ${socketPath}`);
        }
      } catch (error) {
        console.log(`DockerSetup: Socket test failed for ${socketPath}:`, error.message);
        continue;
      }
    }

    throw new Error('No working Docker socket found');
  }

  initializeDockerClient() {
    try {
      // For Windows, always use the named pipe
      if (process.platform === 'win32') {
        return new Docker({ socketPath: '//./pipe/docker_engine' });
      }

      // For other platforms, try to find a working socket synchronously (Podman first)
      const socketPaths = [
        process.env.DOCKER_HOST ? process.env.DOCKER_HOST.replace('unix://', '') : null,
        // Podman socket locations (prioritized)
        path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'podman.sock'),
        path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'podman-machine-default', 'podman.sock'),
        `/run/user/${process.getuid ? process.getuid() : 1000}/podman/podman.sock`,
        path.join(os.homedir(), '.local', 'share', 'containers', 'podman', 'machine', 'qemu', 'podman.sock'),
        '/run/podman/podman.sock',
        // Docker Desktop locations
        path.join(os.homedir(), '.docker', 'desktop', 'docker.sock'),
        path.join(os.homedir(), '.docker', 'docker.sock'),
        '/var/run/docker.sock',
        '/run/docker.sock',
        '/mnt/wsl/docker-desktop/docker.sock',
        path.join(os.homedir(), '.colima', 'docker.sock'),
        path.join(os.homedir(), '.rd', 'docker.sock')
      ].filter(Boolean);

      for (const socketPath of socketPaths) {
        if (fs.existsSync(socketPath)) {
          try {
            return new Docker({ socketPath });
          } catch (error) {
            console.log(`Failed to initialize Docker with socket ${socketPath}:`, error.message);
          }
        }
      }

      // If no socket works, fall back to default
      return new Docker({ socketPath: '/var/run/docker.sock' });
    } catch (error) {
      console.error('Error initializing Docker client:', error);
      // Return a default client - the isDockerRunning check will handle the error case
      return new Docker({ socketPath: '/var/run/docker.sock' });
    }
  }

  async isDockerRunning() {
    try {
      console.log('DockerSetup: Checking if container engine is accessible...');

      // If current client isn't working, try to find a working socket
      try {
        console.log('DockerSetup: Trying current Docker client...');
        await this.docker.ping();
        console.log('DockerSetup: Current Docker client is working');
        return true;
      } catch (error) {
        console.log('DockerSetup: Current socket not working, trying to find working socket...');
        console.log('DockerSetup: Current socket error:', error.message);

        // Current socket not working, try to find a working one
        const workingSocket = await this.findWorkingDockerSocket();
        console.log('DockerSetup: Found working socket:', workingSocket);

        this.docker = new Docker({ socketPath: workingSocket });
        await this.docker.ping();
        console.log('DockerSetup: New socket is working');
        return true;
      }
    } catch (error) {
      console.error('DockerSetup: Container engine is not running or not accessible:', error.message);
      console.error('DockerSetup: Full error details:', error);
      return false;
    }
  }

  async createNetwork() {
    try {
      // First check if the network already exists
      const networks = await this.docker.listNetworks();
      const networkExists = networks.some(network => network.Name === 'clara_network');

      if (networkExists) {
        console.log('Network clara_network already exists, skipping creation');
        return;
      }

      // Create the network if it doesn't exist
      try {
        await this.docker.createNetwork({
          Name: 'clara_network',
          Driver: 'bridge'
        });
        console.log('Successfully created clara_network');
      } catch (error) {
        // Special handling for conflict error (network created between our check and creation)
        if (error.statusCode === 409) {
          console.log('Network already exists (409 error), continuing...');
          return;
        }

        // Log details for other errors to help troubleshooting
        console.error('Error creating network:', error.message);
        console.error('Error details:', error);

        // For Mac-specific issues, provide more guidance
        if (process.platform === 'darwin') {
          console.log('On macOS, make sure Docker Desktop is running and properly configured');
          console.log('Try restarting Docker Desktop if issues persist');
        }

        throw new Error(`Failed to create network: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in createNetwork:', error.message);
      // Don't throw here to allow the application to continue even if network creation fails
      // We'll let containers attempt to connect, which might work if the network exists but we failed to detect it
    }
  }

  async pullImage(imageName, statusCallback) {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err, stream) => {
        if (err) {
          console.error('Error pulling image:', err);
          reject(err);
          return;
        }

        let lastStatus = '';
        stream.on('data', (data) => {
          const lines = data.toString().split('\n').filter(Boolean);
          lines.forEach(line => {
            try {
              const parsed = JSON.parse(line);
              if (parsed.status && parsed.status !== lastStatus) {
                lastStatus = parsed.status;
                statusCallback(`Pulling ${imageName}: ${parsed.status}`);
              }
              if (parsed.error) {
                console.error('Pull error:', parsed.error);
                reject(new Error(parsed.error));
              }
            } catch (e) {
              // Ignore parse errors
            }
          });
        });

        stream.on('end', () => {
          statusCallback(`Successfully pulled ${imageName}`);
          resolve();
        });

        stream.on('error', (error) => {
          console.error('Stream error:', error);
          reject(error);
        });
      });
    });
  }

  async startContainer(config) {
    try {
      // Special handling for Ollama - if it's already running on the system, skip container creation
      if (config.name === 'clara_ollama') {
        const isRunning = await this.isOllamaRunning();
        if (isRunning) {
          console.log('Ollama is already running on the system, skipping container creation');
          return;
        }
      }

      // Check if container exists and is running
      try {
        const existingContainer = await this.docker.getContainer(config.name);
        const containerInfo = await existingContainer.inspect();

        if (containerInfo.State.Running) {
          console.log(`Container ${config.name} is already running, checking health...`);

          // Check if the running container is healthy
          const isHealthy = await config.healthCheck();
          if (isHealthy) {
            console.log(`Container ${config.name} is running and healthy, skipping recreation`);
            return;
          }

          console.log(`Container ${config.name} is running but not healthy, will recreate`);
          await existingContainer.stop();
          await existingContainer.remove({ force: true });
        } else {
          console.log(`Container ${config.name} exists but is not running, will recreate`);
          await existingContainer.remove({ force: true });
        }
      } catch (error) {
        if (error.statusCode !== 404) {
          console.error(`Error checking container ${config.name}:`, error);
        } else {
          console.log(`No existing container ${config.name}, will create new one`);
        }
      }

      // First ensure we have the image
      try {
        await this.docker.getImage(config.image).inspect();
      } catch (error) {
        if (error.statusCode === 404) {
          console.log(`Image ${config.image} not found locally, pulling...`);
          await this.pullImage(config.image, (status) => console.log(status));
        } else {
          throw error;
        }
      }

      console.log(`Creating container ${config.name} with port mapping ${config.internalPort} -> ${config.port}`);

      // Create and start container
      const containerConfig = {
        Image: config.image,
        name: config.name,
        ExposedPorts: {
          [`${config.internalPort}/tcp`]: {}
        },
        HostConfig: {
          PortBindings: {
            [`${config.internalPort}/tcp`]: [{ HostPort: config.port.toString() }]
          },
          Binds: config.volumes,
          NetworkMode: 'clara_network'
        },
        Env: [
          'PYTHONUNBUFFERED=1',
          'OLLAMA_BASE_URL=http://clara_ollama:11434'
        ]
      };

      const newContainer = await this.docker.createContainer(containerConfig);
      console.log(`Container ${config.name} created, starting...`);
      await newContainer.start();
      console.log(`Container ${config.name} started, waiting for health check...`);

      // Initial delay to give the container time to fully start
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Wait for health check
      let healthy = false;
      for (let i = 0; i < 5; i++) {
        console.log(`Health check attempt ${i + 1} for ${config.name}...`);
        try {
          healthy = await config.healthCheck();
          console.log(`Health check result for ${config.name}: ${healthy}`);
          if (healthy) break;
        } catch (error) {
          console.error(`Health check error for ${config.name}:`, error);
        }
        // Increased delay between attempts to 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (!healthy) {
        // Get container logs to help diagnose the issue
        const container = await this.docker.getContainer(config.name);
        const logs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 50
        });
        console.error(`Container logs for ${config.name}:`, logs.toString());
        throw new Error(`Container ${config.name} failed health check after 5 attempts`);
      }
    } catch (error) {
      console.error(`Error starting ${config.name}:`, error);
      throw error;
    }
  }

  async initializePullTimestamps() {
    try {
      if (!fs.existsSync(this.pullTimestampsPath)) {
        const initialTimestamps = {};
        Object.keys(this.containers).forEach(key => {
          initialTimestamps[this.containers[key].image] = 0;
        });
        fs.writeFileSync(this.pullTimestampsPath, JSON.stringify(initialTimestamps, null, 2));
      }
    } catch (error) {
      console.error('Error initializing pull timestamps:', error);
    }
  }

  getPullTimestamps() {
    try {
      if (fs.existsSync(this.pullTimestampsPath)) {
        return JSON.parse(fs.readFileSync(this.pullTimestampsPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error reading pull timestamps:', error);
    }
    return {};
  }

  updatePullTimestamp(imageName) {
    try {
      const timestamps = this.getPullTimestamps();
      timestamps[imageName] = Date.now();
      fs.writeFileSync(this.pullTimestampsPath, JSON.stringify(timestamps, null, 2));
    } catch (error) {
      console.error('Error updating pull timestamp:', error);
    }
  }

  async checkImageUpdate(imageName) {
    try {
      // First try to inspect the local image
      try {
        await this.docker.getImage(imageName).inspect();
      } catch (error) {
        // If image doesn't exist locally, we need to pull it
        if (error.statusCode === 404) {
          return true;
        }
      }

      // Try to pull the image to check for updates
      return new Promise((resolve, reject) => {
        this.docker.pull(imageName, (err, stream) => {
          if (err) {
            // If we can't pull, but have local image, use local
            if (err.statusCode === 404) {
              resolve(false);
              return;
            }
            reject(err);
            return;
          }

          let needsUpdate = false;

          stream.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
              try {
                const parsed = JSON.parse(line);
                // Check for "up to date" message
                if (parsed.status && parsed.status.includes('up to date')) {
                  needsUpdate = false;
                }
                // Check for "downloading" or "extracting" which indicates an update
                if (parsed.status && (parsed.status.includes('Downloading') || parsed.status.includes('Extracting'))) {
                  needsUpdate = true;
                }
              } catch (e) {
                // Ignore parse errors
              }
            });
          });

          stream.on('end', () => {
            resolve(needsUpdate);
          });

          stream.on('error', (error) => {
            console.error('Stream error during pull:', error);
            resolve(true); // If we can't determine, assume update needed
          });
        });
      });
    } catch (error) {
      console.error('Error checking image update:', error);
      return true; // If we can't determine, assume update needed
    }
  }

  shouldPullImage(imageName, forceCheck = false) {
    try {
      if (forceCheck) {
        return this.checkImageUpdate(imageName);
      }

      const timestamps = this.getPullTimestamps();
      const lastPull = timestamps[imageName] || 0;
      const daysSinceLastPull = (Date.now() - lastPull) / (1000 * 60 * 60 * 24);
      return daysSinceLastPull >= 10;
    } catch (error) {
      console.error('Error checking pull timestamp:', error);
      return true; // Pull if there's an error reading timestamps
    }
  }

  async setup(statusCallback, forceUpdateCheck = false) {
    try {
      console.log('DockerSetup: Starting setup process...');

      console.log('DockerSetup: Checking if container engine is running...');
      const dockerRunning = await this.isDockerRunning();
      console.log(`DockerSetup: Container engine running: ${dockerRunning}`);

      if (!dockerRunning) {
        let dockerDownloadLink;
        let podmanDownloadLink;
        let installMessage;
        switch (process.platform) {
          case 'darwin':
            dockerDownloadLink = 'https://desktop.docker.com/mac/main/arm64/Docker.dmg';
            podmanDownloadLink = 'https://podman.io/getting-started/installation';
            installMessage = 'install Podman (recommended) or Docker Desktop';
            break;
          case 'win32':
            dockerDownloadLink = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe';
            podmanDownloadLink = 'https://podman.io/getting-started/installation';
            installMessage = 'install Podman (recommended) or Docker Desktop';
            break;
          case 'linux':
          default:
            dockerDownloadLink = 'https://docs.docker.com/engine/install/';
            podmanDownloadLink = 'https://podman.io/getting-started/installation';
            installMessage = 'install Podman (recommended) or Docker Engine';
            break;
        }
        const errorMessage = `Container engine is not running. Please ${installMessage}:\n\nPodman (recommended): ${podmanDownloadLink}\nDocker: ${dockerDownloadLink}\n\nAfter installing and starting your container engine, please restart Clara.`;
        console.error('DockerSetup: Container engine not running:', errorMessage);
        statusCallback(errorMessage, 'error');
        throw new Error(errorMessage);
      }

      const engineName = this.isUsingPodman() ? 'Podman' : 'Docker';
      statusCallback(`Using ${engineName} as container engine`);
      statusCallback('Creating container network...');
      await this.createNetwork();

      // Get active containers based on mode
      const activeContainers = this.getActiveContainers();
      const containerCount = Object.keys(activeContainers).length;

      if (this.leanMode) {
        statusCallback(`🚀 Lean mode: Setting up ${containerCount} essential service(s) only`);
        statusCallback('💡 Skipping heavy services (interpreter, N8N) for faster startup');
      } else {
        statusCallback(`🔥 Full mode: Setting up all ${containerCount} services`);
      }

      // Check if Ollama is running on the system
      const ollamaRunning = await this.isOllamaRunning();

      // Check and pull images if needed
      for (const [name, config] of Object.entries(activeContainers)) {
        // Skip pulling Ollama image if Ollama is already running
        if (name === 'ollama' && ollamaRunning) {
          statusCallback('Ollama is already running on the system, skipping image pull and container creation.');
          continue;
        }

        // Check if image exists locally
        try {
          await this.docker.getImage(config.image).inspect();
          statusCallback(`Using existing ${name} image...`);
        } catch (error) {
          if (error.statusCode === 404) {
            statusCallback(`Pulling ${name} image...`);
            await this.pullImage(config.image, statusCallback);
          } else {
            throw error;
          }
        }
      }

      // Start containers in sequence
      for (const [name, config] of Object.entries(activeContainers)) {
        // Skip starting Ollama container if Ollama is already running
        if (name === 'ollama' && ollamaRunning) {
          continue;
        }
        statusCallback(`Starting ${name} service...`);
        await this.startContainer(config);
      }

      statusCallback('All services started successfully');
      return true;
    } catch (error) {
      statusCallback(`Setup failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async stop() {
    try {
      for (const [name, config] of Object.entries(this.containers)) {
        try {
          const container = await this.docker.getContainer(config.name);
          await container.stop();
          await container.remove();
        } catch (error) {
          // Ignore errors if container doesn't exist
        }
      }

      // Clean up network
      try {
        const network = await this.docker.getNetwork('clara_network');
        await network.remove();
      } catch (error) {
        // Ignore network removal errors
      }
    } catch (error) {
      console.error('Error stopping services:', error);
      throw error;
    }
  }

  async isPythonRunning() {
    try {
      if (!this.ports.python) {
        console.log('Python port not set');
        return false;
      }

      console.log(`Checking Python health at http://localhost:${this.ports.python}/health`);

      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${this.ports.python}/health`, (res) => {
          console.log(`Python health check status code: ${res.statusCode}`);

          if (res.statusCode === 200) {
            let data = '';
            res.on('data', chunk => {
              data += chunk;
            });
            res.on('end', () => {
              console.log('Python health check response:', data);
              try {
                const jsonResponse = JSON.parse(data);
                const isHealthy = jsonResponse.status === 'healthy' || jsonResponse.status === 'ok';
                console.log(`Python health parsed result: ${isHealthy}`);
                resolve(isHealthy);
              } catch (e) {
                console.error('Failed to parse health check JSON:', e);
                resolve(false);
              }
            });
          } else {
            reject(new Error(`Python health check failed with status ${res.statusCode}`));
          }
        });

        req.on('error', (error) => {
          console.error('Python health check request error:', error);
          resolve(false);
        });

        req.setTimeout(5000, () => {
          console.error('Python health check timeout');
          req.destroy();
          resolve(false);
        });
      });

      return response;
    } catch (error) {
      console.error('Python health check error:', error);
      return false;
    }
  }

  async checkN8NHealth() {
    try {
      const response = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${this.ports.n8n}/healthz`, (res) => {
          if (res.statusCode === 200) {
            resolve({ success: true });
          } else {
            reject(new Error(`N8N health check failed with status ${res.statusCode}`));
          }
        }).on('error', (error) => reject(error));
      });
      return response;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async isOllamaRunning() {
    try {
      // First check if Ollama is running on the system
      const response = await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:11434/api/tags', (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            reject(new Error(`HTTP status ${res.statusCode}`));
          }
        });

        req.on('error', () => resolve(false));

        // Add timeout to avoid hanging
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (response) {
        console.log('Found Ollama running on system');
        return true;
      }

      // If not running on system, check container
      try {
        const container = await this.docker.getContainer('clara_ollama');
        const info = await container.inspect();
        return info.State.Running;
      } catch (error) {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async isInterpreterRunning() {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${this.ports.interpreter}/health`, (res) => {
          if (res.statusCode === 200) {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              try {
                const jsonResponse = JSON.parse(data);
                const isHealthy = jsonResponse.status === 'healthy';
                resolve(isHealthy);
              } catch (e) {
                resolve(false);
              }
            });
          } else {
            resolve(false);
          }
        });

        req.on('error', () => resolve(false));

        req.setTimeout(5000, () => {
          req.destroy();
          resolve(false);
        });
      });

      return response;
    } catch (error) {
      return false;
    }
  }
}

module.exports = DockerSetup;