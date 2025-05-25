// Welcome screen frontend logic
// This file handles all UI interactions and IPC communication for the welcome screen

const { ipcRenderer } = require('electron');

class WelcomeFrontend {
  constructor() {
    this.checkInProgress = false;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Start checking prerequisites when page loads
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => this.checkPrerequisites(), 500);
    });

    // Setup button event listeners
    this.setupButtonListeners();
  }

  setupButtonListeners() {
    // Continue button
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.continueSetup());
    }

    // Retry button
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.retryCheck());
    }

    // Setup guide button
    const guideBtn = document.getElementById('guide-btn');
    if (guideBtn) {
      guideBtn.addEventListener('click', () => this.openGuide());
    }

    // Skip button
    const skipBtn = document.getElementById('skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipSetup());
    }

    // Start Podman button
    const startPodmanBtn = document.getElementById('start-podman-btn');
    if (startPodmanBtn) {
      startPodmanBtn.addEventListener('click', () => this.startPodman());
    }

    // External links with data-external-url attribute
    const externalLinks = document.querySelectorAll('a[data-external-url]');
    externalLinks.forEach(link => {
      const url = link.getAttribute('data-external-url');
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.openExternal(url);
      });
    });
  }

  async checkPrerequisites() {
    if (this.checkInProgress) return;
    this.checkInProgress = true;

    const retryBtn = document.getElementById('retry-btn');
    const retrySpinner = document.getElementById('retry-spinner');

    if (retryBtn) retryBtn.disabled = true;
    if (retrySpinner) retrySpinner.classList.remove('hidden');

    try {
      // Check container engine
      const containerResult = await ipcRenderer.invoke('check-container-engine');
      this.updateContainerStatus(containerResult);

      // Check network
      const networkResult = await ipcRenderer.invoke('check-network');
      this.updateNetworkStatus(networkResult);

      // Check storage
      const storageResult = await ipcRenderer.invoke('check-storage');
      this.updateStorageStatus(storageResult);

      // Update UI based on results
      this.updateActions(containerResult, networkResult, storageResult);

    } catch (error) {
      console.error('Error checking prerequisites:', error);
    } finally {
      this.checkInProgress = false;
      if (retryBtn) retryBtn.disabled = false;
      if (retrySpinner) retrySpinner.classList.add('hidden');
    }
  }

  updateContainerStatus(result) {
    const icon = document.getElementById('container-icon');
    const detail = document.getElementById('container-detail');
    const statusItem = document.getElementById('container-status');
    const startPodmanBtn = document.getElementById('start-podman-btn');

    if (!icon || !detail || !statusItem) return;

    // Hide Start Podman button by default
    if (startPodmanBtn) {
      startPodmanBtn.classList.add('hidden');
    }

    if (result.available) {
      if (result.status === 'running') {
        icon.className = 'status-icon success';
        icon.textContent = '✓';
        detail.textContent = `${result.engine} is available and running`;
        statusItem.style.borderColor = '#27ae60';
      } else {
        icon.className = 'status-icon warning';
        icon.textContent = '!';
        detail.textContent = `${result.engine} is installed but ${result.details || 'not running'}`;
        statusItem.style.borderColor = '#f39c12';

        // Show Start Podman button if Podman is installed but not running
        if (result.engine === 'Podman' && startPodmanBtn) {
          startPodmanBtn.classList.remove('hidden');
        }
      }
    } else {
      icon.className = 'status-icon error';
      icon.textContent = '✗';
      detail.textContent = result.details || 'No container engine found. Please install Podman or Docker.';
      statusItem.style.borderColor = '#e74c3c';

      const installationGuide = document.getElementById('installation-guide');
      if (installationGuide) {
        installationGuide.classList.remove('hidden');
      }
    }
  }

  updateNetworkStatus(result) {
    const icon = document.getElementById('network-icon');
    const detail = document.getElementById('network-detail');
    const statusItem = document.getElementById('network-status');

    if (!icon || !detail || !statusItem) return;

    if (result.available) {
      icon.className = 'status-icon success';
      icon.textContent = '✓';
      detail.textContent = 'Internet connection available';
      statusItem.style.borderColor = '#27ae60';
    } else {
      icon.className = 'status-icon warning';
      icon.textContent = '!';
      detail.textContent = 'Limited connectivity - some features may not work';
      statusItem.style.borderColor = '#f39c12';
    }
  }

  updateStorageStatus(result) {
    const icon = document.getElementById('storage-icon');
    const detail = document.getElementById('storage-detail');
    const statusItem = document.getElementById('storage-status');

    if (!icon || !detail || !statusItem) return;

    if (result.sufficient) {
      icon.className = 'status-icon success';
      icon.textContent = '✓';
      detail.textContent = `${result.available} available`;
      statusItem.style.borderColor = '#27ae60';
    } else {
      icon.className = 'status-icon warning';
      icon.textContent = '!';
      detail.textContent = `Only ${result.available} available - may need more space`;
      statusItem.style.borderColor = '#f39c12';
    }
  }

  updateActions(container, network, storage) {
    const continueBtn = document.getElementById('continue-btn');
    if (!continueBtn) return;

    if (container.available) {
      continueBtn.classList.remove('hidden');
      if (container.status === 'running') {
        continueBtn.className = 'btn success';
        continueBtn.innerHTML = '<span>🚀</span>Start ClaraVerse';
      } else {
        continueBtn.className = 'btn';
        continueBtn.innerHTML = `<span>🚀</span>Start ClaraVerse (${container.engine} will be started)`;
      }
    }
  }

  retryCheck() {
    this.checkPrerequisites();
  }

  continueSetup() {
    ipcRenderer.invoke('start-main-app');
  }

  skipSetup() {
    ipcRenderer.invoke('start-main-app-limited');
  }

  openGuide() {
    ipcRenderer.invoke('open-setup-guide');
  }

  openExternal(url) {
    ipcRenderer.invoke('open-external', url);
  }

  async startPodman() {
    const startPodmanBtn = document.getElementById('start-podman-btn');
    const startPodmanSpinner = document.getElementById('start-podman-spinner');
    const startPodmanText = document.getElementById('start-podman-text');

    if (!startPodmanBtn || !startPodmanSpinner || !startPodmanText) return;

    // Show loading state
    startPodmanBtn.disabled = true;
    startPodmanSpinner.classList.remove('hidden');
    startPodmanText.textContent = 'Starting Podman...';

    try {
      const result = await ipcRenderer.invoke('start-podman');

      if (result.success) {
        startPodmanText.textContent = '✓ Podman Started';
        startPodmanBtn.className = 'btn success';

        // Wait a moment then recheck prerequisites
        setTimeout(() => {
          this.checkPrerequisites();
        }, 1000);
      } else {
        startPodmanText.textContent = '✗ Failed to Start';
        startPodmanBtn.className = 'btn error';

        // Show error details
        const detail = document.getElementById('container-detail');
        if (detail) {
          detail.textContent = result.details || result.error || 'Failed to start Podman';
        }

        // Reset button after a delay
        setTimeout(() => {
          startPodmanBtn.className = 'btn primary';
          startPodmanText.textContent = '▶️ Start Podman';
          startPodmanBtn.disabled = false;
        }, 3000);
      }
    } catch (error) {
      console.error('Error starting Podman:', error);
      startPodmanText.textContent = '✗ Error';
      startPodmanBtn.className = 'btn error';

      // Reset button after a delay
      setTimeout(() => {
        startPodmanBtn.className = 'btn primary';
        startPodmanText.textContent = '▶️ Start Podman';
        startPodmanBtn.disabled = false;
      }, 3000);
    } finally {
      startPodmanSpinner.classList.add('hidden');
    }
  }
}

// Initialize the welcome frontend when the script loads
const welcomeFrontend = new WelcomeFrontend();
