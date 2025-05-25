# Welcome Module

This module manages the welcome screen flow for ClaraVerse, including prerequisite checking and user onboarding.

## Architecture

The welcome module has been refactored into smaller, focused files for better maintainability:

### Core Files

- **`index.cjs`** - Main welcome screen orchestrator that coordinates all components
- **`prerequisite_checker.cjs`** - Handles all prerequisite checks (container engine, network, storage)
- **`welcome_window.cjs`** - Manages the welcome window creation and lifecycle
- **`welcome_handlers.cjs`** - Handles IPC communication for welcome screen actions
- **`welcome.html`** - The welcome screen UI (clean HTML, no inline JavaScript)
- **`welcome_frontend.js`** - Frontend JavaScript logic for UI interactions
- **`welcome.css`** - Stylesheet for the welcome screen

### Legacy Files

- **`welcome_old.cjs`** - DEPRECATED: Original monolithic file, kept for reference

## Usage

```javascript
const WelcomeScreen = require('./welcome');

// Create welcome screen
const welcomeScreen = new WelcomeScreen();

// Setup IPC handlers
welcomeScreen.setupHandlers(startMainAppWithDocker, startMainAppLimited);

// Close when done
welcomeScreen.close();
```

## Startup Flow

1. **App starts** → `electron/main.cjs` creates `WelcomeScreen`
2. **Welcome screen shows** → User sees prerequisite status
3. **User chooses action**:
   - Continue with containers → `start-main-app` → Docker setup → Main window
   - Skip containers → `start-main-app-limited` → Main window directly
   - Get help → Opens setup guide

## Prerequisite Checks

The `PrerequisiteChecker` performs three checks:

1. **Container Engine**: Checks for Podman (preferred) or Docker
2. **Network**: Tests internet connectivity
3. **Storage**: Verifies sufficient disk space (>2GB)

## Frontend Architecture

The frontend has been completely separated from the backend:

- **No inline JavaScript**: All JavaScript moved to `welcome_frontend.js`
- **Clean HTML**: Uses semantic elements and data attributes instead of onclick handlers
- **Event-driven**: Uses proper event listeners instead of global functions
- **Class-based**: Frontend logic organized in a `WelcomeFrontend` class

## Benefits of Refactoring

- **Separation of concerns**: Each file has a single responsibility
- **Easier testing**: Individual modules can be tested in isolation
- **Better maintainability**: Changes to one aspect don't affect others
- **Reusability**: Components can be reused elsewhere if needed
- **Cleaner code**: Smaller files are easier to understand and modify
- **Better security**: No inline JavaScript, proper event handling
- **Modern practices**: Uses classes, modules, and clean separation

## Migration Notes

The refactoring maintains full backward compatibility. Existing code that imports `welcome.cjs` will continue to work without changes.
