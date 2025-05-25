const log = require('../helpers/log.cjs');
const PrerequisiteChecker = require('./prerequisite_checker.cjs');
const WelcomeWindow = require('./welcome_window.cjs');
const WelcomeHandlers = require('./welcome_handlers.cjs');

class WelcomeScreen {
  constructor() {
    log.info('Line 7 welcome/index.cjs: Initializing WelcomeScreen');
    
    this.prerequisiteChecker = new PrerequisiteChecker();
    this.welcomeWindow = new WelcomeWindow();
    this.welcomeHandlers = null;
    
    // Store reference to window for backward compatibility
    this.window = this.welcomeWindow.getWindow();
  }

  setupHandlers(startMainAppWithDocker, startMainAppLimited) {
    log.info('Line 17 welcome/index.cjs: Setting up welcome handlers');
    this.welcomeHandlers = new WelcomeHandlers(
      this.prerequisiteChecker,
      startMainAppWithDocker,
      startMainAppLimited
    );
  }

  // Backward compatibility methods - delegate to prerequisiteChecker
  async checkContainerEngine() {
    return await this.prerequisiteChecker.checkContainerEngine();
  }

  async checkNetwork() {
    return await this.prerequisiteChecker.checkNetwork();
  }

  async checkStorage() {
    return await this.prerequisiteChecker.checkStorage();
  }

  // Delegate window methods to welcomeWindow
  close() {
    log.info('Line 37 welcome/index.cjs: Closing welcome screen');
    
    // Cleanup handlers first
    if (this.welcomeHandlers) {
      this.welcomeHandlers.cleanup();
      this.welcomeHandlers = null;
    }
    
    // Close window
    if (this.welcomeWindow) {
      this.welcomeWindow.close();
      this.welcomeWindow = null;
    }
    
    // Clear window reference
    this.window = null;
  }

  hide() {
    if (this.welcomeWindow) {
      this.welcomeWindow.hide();
    }
  }

  show() {
    if (this.welcomeWindow) {
      this.welcomeWindow.show();
    }
  }

  isDestroyed() {
    return !this.welcomeWindow || this.welcomeWindow.isDestroyed();
  }
}

module.exports = WelcomeScreen;
