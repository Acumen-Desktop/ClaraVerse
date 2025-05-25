// Stats display logic for the welcome screen
// This file handles fetching and displaying system stats in the UI

// Use the already declared ipcRenderer from welcome_frontend.js
// const { ipcRenderer } = require('electron'); // Already declared in welcome_frontend.js

class StatsDisplay {
  constructor() {
    this.statsLoaded = false;
    // Get ipcRenderer from the global require since it's already loaded
    this.ipcRenderer = require('electron').ipcRenderer;
    this.initializeStats();
    this.initializeNativePopover();
  }

  /**
   * Initialize stats loading when DOM is ready
   */
  initializeStats() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.loadStats());
    } else {
      this.loadStats();
    }
  }

  /**
   * Initialize native popover event listeners
   */
  initializeNativePopover() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupNativePopoverEvents());
    } else {
      this.setupNativePopoverEvents();
    }
  }

  /**
   * Setup native popover event listeners
   */
  setupNativePopoverEvents() {
    const popover = document.getElementById('stats-popover');
    const refreshBtn = document.getElementById('stats-refresh-btn');

    if (popover) {
      // Listen for popover show events
      popover.addEventListener('beforetoggle', (e) => {
        if (e.newState === 'open') {
          // Load stats when popover is about to open
          if (!this.statsLoaded) {
            this.loadStats();
          }
        }
      });

      // Optional: Listen for popover toggle events
      popover.addEventListener('toggle', (e) => {
        console.log('Popover toggled:', e.newState);
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.refreshStats();
      });
    }
  }

  /**
   * Load and display system stats
   */
  async loadStats() {
    if (this.statsLoaded) return;

    try {
      console.log('Loading system stats...');
      const stats = await this.ipcRenderer.invoke('get-system-stats');
      this.displayStats(stats);
      this.statsLoaded = true;
      console.log('System stats loaded successfully');
    } catch (error) {
      console.error('Error loading system stats:', error);
      this.displayErrorStats();
    }
  }

  /**
   * Display stats in the UI
   */
  displayStats(stats) {
    const elements = {
      user: document.getElementById('stat-user'),
      os: document.getElementById('stat-os'),
      platform: document.getElementById('stat-platform'),
      cpu: document.getElementById('stat-cpu'),
      memory: document.getElementById('stat-memory'),
      node: document.getElementById('stat-node')
    };

    // Update each stat element
    Object.entries(elements).forEach(([key, element]) => {
      if (element) {
        const value = stats[key] || 'N/A';
        element.textContent = value;
        element.title = value; // Add tooltip for long values
      }
    });
  }

  /**
   * Display error/fallback stats when loading fails
   */
  displayErrorStats() {
    const fallbackStats = {
      user: 'Unknown',
      os: 'Unknown',
      platform: 'Unknown',
      cpu: 'Unknown',
      memory: 'Unknown',
      node: 'Unknown'
    };

    this.displayStats(fallbackStats);
  }

  /**
   * Refresh stats (can be called externally)
   */
  async refreshStats() {
    const refreshBtn = document.getElementById('stats-refresh-btn');
    const refreshIcon = refreshBtn?.querySelector('.refresh-icon');

    // Add loading state
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.style.opacity = '0.7';
    }
    if (refreshIcon) {
      refreshIcon.style.transform = 'rotate(360deg)';
    }

    try {
      this.statsLoaded = false;
      await this.loadStats();
    } finally {
      // Remove loading state
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
      }
      if (refreshIcon) {
        setTimeout(() => {
          refreshIcon.style.transform = 'rotate(0deg)';
        }, 300);
      }
    }
  }

  /**
   * Get current stats without updating UI
   */
  async getCurrentStats() {
    try {
      return await this.ipcRenderer.invoke('get-system-stats');
    } catch (error) {
      console.error('Error getting current stats:', error);
      return null;
    }
  }
}

// Initialize stats display when script loads
const statsDisplay = new StatsDisplay();

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatsDisplay;
}

// Make available globally for debugging
window.statsDisplay = statsDisplay;
