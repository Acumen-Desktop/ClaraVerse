const electronLog = require('electron-log');

/**
 * Centralized logging configuration with colors for all levels
 * This helper ensures consistent logging format and colors across the application
 */

// ANSI color codes for terminal output
const ANSI_COLORS = {
  error: '\x1b[31m\x1b[1m',    // Red + Bold
  warn: '\x1b[33m\x1b[1m',     // Yellow + Bold
  info: '\x1b[36m',            // Cyan
  verbose: '\x1b[90m',         // Dark gray
  debug: '\x1b[37m',           // Light gray
  silly: '\x1b[35m',           // Magenta
  reset: '\x1b[0m'             // Reset
};

// CSS color configuration for browser DevTools (when in renderer process)
const CSS_COLORS = {
  error: 'color: #ff4757; font-weight: bold',      // Red
  warn: 'color: #ffa502; font-weight: bold',       // Orange
  info: 'color: #3742fa',                          // Blue
  verbose: 'color: #2f3542',                       // Dark gray
  debug: 'color: #747d8c',                         // Light gray
  silly: 'color: #5f27cd'                          // Purple
};

// Configure console transport with simple format
electronLog.transports.console.format = '{h}:{i}:{s}.{ms} › {text}';

// Configure console transport styles - enable colors
electronLog.transports.console.useStyles = true;

// Override the console transport to add colors manually
const originalConsoleTransport = electronLog.transports.console;
electronLog.transports.console = (info) => {
  // Check if we're in a terminal that supports colors
  const supportsColor = process.stdout && process.stdout.isTTY;

  if (supportsColor) {
    // Create colored message for terminal
    const color = ANSI_COLORS[info.level] || '';
    const reset = ANSI_COLORS.reset;
    const levelTag = `${color}[${info.level.toUpperCase()}]${reset}`;

    // Format timestamp
    const date = info.date || new Date();
    const timestamp = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;

    // Get message text
    const message = Array.isArray(info.data) ? info.data.join(' ') : String(info.data || '');

    // Print colored output directly to console
    console.log(`${timestamp} › ${levelTag} ${message}`);
  } else {
    // Fall back to original transport for non-TTY environments
    originalConsoleTransport(info);
  }
};

// Configure file transport format (no colors for file)
electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Helper function to detect if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

/**
 * Enhanced logging functions with colors and consistent formatting
 * Usage: log.info('Line 42 filename.js: Your message here')
 */
const log = {
  error: (...args) => {
    const message = args.join(' ');
    if (isBrowser) {
      electronLog.error(`%c[ERROR]%c ${message}`, CSS_COLORS.error, 'color: inherit');
    } else {
      electronLog.error(`${ANSI_COLORS.error}[ERROR]${ANSI_COLORS.reset} ${message}`);
    }
  },
  warn: (...args) => {
    const message = args.join(' ');
    if (isBrowser) {
      electronLog.warn(`%c[WARN]%c ${message}`, CSS_COLORS.warn, 'color: inherit');
    } else {
      electronLog.warn(`${ANSI_COLORS.warn}[WARN]${ANSI_COLORS.reset} ${message}`);
    }
  },
  info: (...args) => {
    const message = args.join(' ');
    if (isBrowser) {
      electronLog.info(`%c[INFO]%c ${message}`, CSS_COLORS.info, 'color: inherit');
    } else {
      electronLog.info(`${ANSI_COLORS.info}[INFO]${ANSI_COLORS.reset} ${message}`);
    }
  },
  verbose: (...args) => {
    const message = args.join(' ');
    if (isBrowser) {
      electronLog.verbose(`%c[VERBOSE]%c ${message}`, CSS_COLORS.verbose, 'color: inherit');
    } else {
      electronLog.verbose(`${ANSI_COLORS.verbose}[VERBOSE]${ANSI_COLORS.reset} ${message}`);
    }
  },
  debug: (...args) => {
    const message = args.join(' ');
    if (isBrowser) {
      electronLog.debug(`%c[DEBUG]%c ${message}`, CSS_COLORS.debug, 'color: inherit');
    } else {
      electronLog.debug(`${ANSI_COLORS.debug}[DEBUG]${ANSI_COLORS.reset} ${message}`);
    }
  },
  silly: (...args) => {
    const message = args.join(' ');
    if (isBrowser) {
      electronLog.silly(`%c[SILLY]%c ${message}`, CSS_COLORS.silly, 'color: inherit');
    } else {
      electronLog.silly(`${ANSI_COLORS.silly}[SILLY]${ANSI_COLORS.reset} ${message}`);
    }
  },

  // Convenience methods for common patterns
  fileOperation: (line, file, operation, details) => {
    const message = `Line ${line} ${file}: ${operation}`;
    if (isBrowser) {
      electronLog.info(`%c[INFO]%c ${message}`, CSS_COLORS.info, 'color: inherit', details || '');
    } else {
      electronLog.info(`${ANSI_COLORS.info}[INFO]${ANSI_COLORS.reset} ${message}`, details || '');
    }
  },

  windowEvent: (line, file, windowName, event, details) => {
    const message = `Line ${line} ${file}: Window ${windowName} ${event}`;
    if (isBrowser) {
      electronLog.debug(`%c[DEBUG]%c ${message}`, CSS_COLORS.debug, 'color: inherit', details || '');
    } else {
      electronLog.debug(`${ANSI_COLORS.debug}[DEBUG]${ANSI_COLORS.reset} ${message}`, details || '');
    }
  },

  errorWithContext: (line, file, message, error) => {
    const fullMessage = `Line ${line} ${file}: ${message}`;
    if (isBrowser) {
      electronLog.error(`%c[ERROR]%c ${fullMessage}`, CSS_COLORS.error, 'color: inherit', error);
    } else {
      electronLog.error(`${ANSI_COLORS.error}[ERROR]${ANSI_COLORS.reset} ${fullMessage}`, error);
    }
  },

  // Access to original electron-log instance for advanced usage
  raw: electronLog
};

// Set log levels based on environment
if (process.env.NODE_ENV === 'development') {
  electronLog.transports.console.level = 'silly';
  electronLog.transports.file.level = 'debug';
} else {
  electronLog.transports.console.level = 'info';
  electronLog.transports.file.level = 'warn';
}

module.exports = log;
