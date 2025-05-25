# Electron Helpers

This directory contains helper modules for the Electron main process.

## Logging Helper (`log.cjs`)

Centralized logging configuration with colors for all log levels. This ensures consistent logging format and colors across the entire application.

### Features

- **Colored console output** with different colors for each log level
- **Consistent formatting** with timestamps and level indicators
- **Environment-based log levels** (development vs production)
- **File logging** without colors for clean log files
- **Convenience methods** for common logging patterns

### Usage

```javascript
const log = require('./helpers/log.cjs');

// Basic logging with line numbers and file names (preferred format)
log.info('Line 42 myfile.js: Operation completed successfully');
log.warn('Line 55 myfile.js: Configuration file not found, using defaults');
log.error('Line 67 myfile.js: Failed to connect to database');

// Different log levels (automatically colored)
log.silly('Line 10 myfile.js: Detailed debug information');
log.debug('Line 15 myfile.js: Debug information');
log.verbose('Line 20 myfile.js: Verbose information');
log.info('Line 25 myfile.js: General information');
log.warn('Line 30 myfile.js: Warning message');
log.error('Line 35 myfile.js: Error message');

// Convenience methods
log.fileOperation(42, 'myfile.js', 'File saved successfully', { path: '/path/to/file.json' });
log.windowEvent(55, 'myfile.js', 'main-window', 'resize', { width: 1200, height: 800 });
log.errorWithContext(67, 'myfile.js', 'Database connection failed', new Error('Connection timeout'));

// Access raw electron-log instance for advanced features
log.raw.scope('database').info('Line 80 myfile.js: Database query executed');
```

### Color Scheme

- **Error**: Red with bold font
- **Warn**: Orange with bold font  
- **Info**: Blue
- **Verbose**: Dark gray
- **Debug**: Light gray
- **Silly**: Purple

### Log Levels by Environment

**Development:**
- Console: `silly` (shows all logs)
- File: `debug`

**Production:**
- Console: `info` (shows info, warn, error)
- File: `warn` (shows warn, error only)

## Window State Helper (`window_state.cjs`)

Manages window state persistence across application restarts, including position, size, and display states.

### Features

- **Multi-monitor support** with intelligent positioning
- **State validation** to ensure windows appear on visible displays
- **Automatic state saving** on window events (resize, move, maximize, etc.)
- **Throttled saving** to prevent excessive file writes
- **Factory functions** for common window types

### Usage

```javascript
const { createMainWindowStateManager, createWelcomeWindowStateManager } = require('./helpers/window_state.cjs');

// Create a window state manager
const windowStateManager = createMainWindowStateManager();

// Get window options for BrowserWindow constructor
const windowOptions = windowStateManager.getWindowOptions();

// Create window with saved state
const window = new BrowserWindow({
  ...windowOptions,
  // ... other window options
});

// Setup automatic state saving
windowStateManager.setupEventHandlers(window);

// Restore window state (maximize, fullscreen)
windowStateManager.restoreWindowState(window);
```

## Best Practices

1. **Always include line numbers and file names** in log messages for easier debugging
2. **Use appropriate log levels** - reserve `error` for actual errors, `warn` for warnings, `info` for general information
3. **Import the helpers at the top** of your files for consistency
4. **Use the convenience methods** when they fit your use case
5. **Test window state management** on multiple monitors when possible
