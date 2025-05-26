// Lean Docker Setup - Essential services only
// This version skips heavy services like N8N and interpreter

const DockerSetup = require('./dockerSetup.cjs');

class LeanDockerSetup extends DockerSetup {
  constructor() {
    super();
    
    // Override containers to include only essential services
    this.containers = {
      // Core backend (lean version)
      backend: {
        name: 'clara_backend',
        image: 'clara17verse/clara-backend:lean',
        ports: { '8000/tcp': [{ HostPort: this.ports.python.toString() }] },
        env: [
          'PYTHONUNBUFFERED=1',
          'CLARA_MODE=lean'
        ],
        networks: ['clara_network'],
        restart: 'unless-stopped'
      }
      
      // Skip heavy services:
      // - N8N (736MB)
      // - Interpreter (1.77GB) 
      // - Ollama container (use local Ollama instead)
    };
    
    console.log('🚀 Lean Docker Setup initialized - Essential services only');
  }
  
  async setupDocker(statusCallback = () => {}) {
    try {
      statusCallback('Setting up lean ClaraVerse (essential services only)...');
      
      // Check if Ollama is running locally
      const ollamaRunning = await this.isOllamaRunning();
      if (!ollamaRunning) {
        statusCallback('⚠️  Ollama not detected locally. Please install and start Ollama:', 'warning');
        statusCallback('   brew install ollama && ollama serve', 'info');
        throw new Error('Ollama is required for lean mode. Please install and start Ollama locally.');
      }
      
      statusCallback('✅ Using local Ollama instance');
      
      // Create network
      await this.createNetwork();
      statusCallback('Network created successfully');
      
      // Check and pull lean backend image
      try {
        await this.docker.getImage(this.containers.backend.image).inspect();
        statusCallback('Using existing lean backend image...');
      } catch (error) {
        if (error.statusCode === 404) {
          statusCallback('Pulling lean backend image...');
          await this.pullImage(this.containers.backend.image, statusCallback);
        } else {
          throw error;
        }
      }
      
      // Start lean backend
      statusCallback('Starting lean backend service...');
      await this.startContainer(this.containers.backend);
      
      statusCallback('🎉 Lean ClaraVerse setup complete!');
      statusCallback('💡 Total size: ~300MB (vs 5GB+ full version)');
      
      return true;
    } catch (error) {
      statusCallback(`Lean setup failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

module.exports = LeanDockerSetup;
