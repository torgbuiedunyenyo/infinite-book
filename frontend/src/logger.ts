/**
 * Frontend logging utility for The Infinite Book
 * Provides structured, leveled console logging with timestamps and context
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Set log level from URL param ?log=debug|info|warn|error, defaults to info
const getLogLevel = (): LogLevel => {
  const params = new URLSearchParams(window.location.search);
  const level = params.get('log')?.toLowerCase();
  
  switch (level) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    default: return LogLevel.INFO; // Default to INFO for frontend
  }
};

let currentLevel = getLogLevel();

// CSS styles for console output
const styles = {
  timestamp: 'color: #888; font-size: 10px;',
  debug: 'color: #888;',
  info: 'color: #2196F3; font-weight: bold;',
  warn: 'color: #FF9800; font-weight: bold;',
  error: 'color: #F44336; font-weight: bold;',
  component: 'color: #9C27B0; font-weight: bold;',
  data: 'color: #4CAF50;',
};

const levelStyles: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: styles.debug,
  [LogLevel.INFO]: styles.info,
  [LogLevel.WARN]: styles.warn,
  [LogLevel.ERROR]: styles.error,
};

const levelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

interface LogContext {
  [key: string]: unknown;
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function truncateString(str: string, maxLength: number = 100): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + `... [${str.length} chars]`;
}

function sanitizeValue(value: unknown, depth: number = 0): unknown {
  if (depth > 2) return '[nested]';
  
  if (value === null || value === undefined) return value;
  
  if (typeof value === 'string') {
    return truncateString(value, 200);
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  
  if (Array.isArray(value)) {
    if (value.length > 5) {
      return [...value.slice(0, 5).map(v => sanitizeValue(v, depth + 1)), `... +${value.length - 5} more`];
    }
    return value.map(v => sanitizeValue(v, depth + 1));
  }
  
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    const keys = Object.keys(value as object);
    for (const key of keys.slice(0, 10)) {
      sanitized[key] = sanitizeValue((value as Record<string, unknown>)[key], depth + 1);
    }
    if (keys.length > 10) {
      sanitized['...'] = `${keys.length - 10} more`;
    }
    return sanitized;
  }
  
  return String(value);
}

class FrontendLogger {
  private component: string;
  
  constructor(component: string) {
    this.component = component;
  }
  
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (level < currentLevel) return;
    
    const timestamp = formatTimestamp();
    const levelName = levelNames[level];
    const levelStyle = levelStyles[level];
    
    const prefix = `%c${timestamp} %c${levelName} %c[${this.component}]%c`;
    const prefixStyles = [styles.timestamp, levelStyle, styles.component, ''];
    
    if (context && Object.keys(context).length > 0) {
      const sanitized = sanitizeValue(context);
      
      if (level === LogLevel.ERROR) {
        console.error(prefix, ...prefixStyles, message, sanitized);
      } else if (level === LogLevel.WARN) {
        console.warn(prefix, ...prefixStyles, message, sanitized);
      } else {
        console.log(prefix, ...prefixStyles, message, sanitized);
      }
    } else {
      if (level === LogLevel.ERROR) {
        console.error(prefix, ...prefixStyles, message);
      } else if (level === LogLevel.WARN) {
        console.warn(prefix, ...prefixStyles, message);
      } else {
        console.log(prefix, ...prefixStyles, message);
      }
    }
  }
  
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }
  
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }
  
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }
  
  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }
  
  /**
   * Create a child logger with additional component context
   */
  child(subComponent: string): FrontendLogger {
    return new FrontendLogger(`${this.component}:${subComponent}`);
  }
  
  /**
   * Log a group of related messages
   */
  group(title: string, fn: () => void): void {
    if (currentLevel > LogLevel.DEBUG) {
      fn();
      return;
    }
    
    console.group(`%c${this.component}%c ${title}`, styles.component, '');
    fn();
    console.groupEnd();
  }
  
  /**
   * Log a collapsed group
   */
  groupCollapsed(title: string, fn: () => void): void {
    if (currentLevel > LogLevel.DEBUG) {
      fn();
      return;
    }
    
    console.groupCollapsed(`%c${this.component}%c ${title}`, styles.component, '');
    fn();
    console.groupEnd();
  }
  
  /**
   * Time an async operation
   */
  async time<T>(operation: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    const start = performance.now();
    this.debug(`Starting: ${operation}`, context);
    
    try {
      const result = await fn();
      const duration = (performance.now() - start).toFixed(2);
      this.debug(`Completed: ${operation} (${duration}ms)`, context);
      return result;
    } catch (error) {
      const duration = (performance.now() - start).toFixed(2);
      this.error(`Failed: ${operation} (${duration}ms)`, {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  
  /**
   * Log a visual separator
   */
  separator(title?: string): void {
    if (currentLevel > LogLevel.DEBUG) return;
    
    if (title) {
      console.log(`%c═══════════════════════════════════════════════════════════`, 'color: #2196F3');
      console.log(`%c  ${title}`, 'color: #2196F3; font-weight: bold;');
      console.log(`%c═══════════════════════════════════════════════════════════`, 'color: #2196F3');
    } else {
      console.log(`%c───────────────────────────────────────────────────────────`, 'color: #888');
    }
  }
  
  /**
   * Log a table (for arrays of objects)
   */
  table(data: unknown[]): void {
    if (currentLevel > LogLevel.DEBUG) return;
    console.table(data);
  }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): FrontendLogger {
  return new FrontendLogger(component);
}

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
  console.log(`%cLog level set to: ${levelNames[level]}`, 'color: #9C27B0; font-weight: bold;');
}

/**
 * Get the current log level
 */
export function getLogLevelName(): string {
  return levelNames[currentLevel];
}

// Pre-created loggers for main components
export const appLogger = createLogger('App');
export const navLogger = createLogger('Navigation');
export const rendererLogger = createLogger('Renderer');
export const apiLogger = createLogger('API');
export const cacheLogger = createLogger('Cache');

// Add to window for debugging
declare global {
  interface Window {
    infiniteBook: {
      setLogLevel: (level: 'debug' | 'info' | 'warn' | 'error') => void;
      getLogLevel: () => string;
    };
  }
}

window.infiniteBook = {
  setLogLevel: (level: string) => {
    const levelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };
    if (levelMap[level] !== undefined) {
      setLogLevel(levelMap[level]);
    } else {
      console.error('Invalid log level. Use: debug, info, warn, or error');
    }
  },
  getLogLevel: getLogLevelName,
};

// Log initial setup
console.log(
  '%c📚 The Infinite Book - Frontend Logger Initialized',
  'color: #9C27B0; font-size: 14px; font-weight: bold;'
);
console.log(
  `%cLog level: ${levelNames[currentLevel]} (use ?log=debug for verbose logging, or window.infiniteBook.setLogLevel('debug'))`,
  'color: #888; font-size: 11px;'
);

