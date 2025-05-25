// DEPRECATED: This file is kept for backward compatibility
// The new modular structure is in ./index.cjs
// This file will be renamed to welcome_old.cjs in a future cleanup

// Import the new modular welcome screen
const WelcomeScreen = require('./index.cjs');

// Re-export for backward compatibility
module.exports = WelcomeScreen;
