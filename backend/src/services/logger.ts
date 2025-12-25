/**
 * Comprehensive logging utility for The Infinite Book
 * Provides structured, leveled logging with timestamps and context
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Set via LOG_LEVEL env var: 'debug', 'info', 'warn', 'error'
const currentLevel: LogLevel = (() => {
  const level = process.env.LOG_LEVEL?.toLowerCase() || 'debug';
  switch (level) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    default: return LogLevel.DEBUG;
  }
})();

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const levelColors: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: colors.gray,
  [LogLevel.INFO]: colors.cyan,
  [LogLevel.WARN]: colors.yellow,
  [LogLevel.ERROR]: colors.red,
};

const levelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO ',
  [LogLevel.WARN]: 'WARN ',
  [LogLevel.ERROR]: 'ERROR',
};

interface LogContext {
  [key: string]: unknown;
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

function truncateString(str: string, maxLength: number = 200): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + `... [truncated, ${str.length} chars total]`;
}

function sanitizeValue(value: unknown, depth: number = 0): unknown {
  if (depth > 3) return '[nested too deep]';
  
  if (value === null || value === undefined) return value;
  
  if (typeof value === 'string') {
    // Check for binary/base64 image data and truncate
    if (value.length > 1000 && (value.includes('base64') || /^[A-Za-z0-9+/=]{100,}$/.test(value))) {
      return `[binary data, ${value.length} chars]`;
    }
    return truncateString(value, 500);
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  
  if (Array.isArray(value)) {
    if (value.length > 10) {
      return [...value.slice(0, 10).map(v => sanitizeValue(v, depth + 1)), `... and ${value.length - 10} more`];
    }
    return value.map(v => sanitizeValue(v, depth + 1));
  }
  
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    const keys = Object.keys(value as object);
    for (const key of keys.slice(0, 20)) {
      sanitized[key] = sanitizeValue((value as Record<string, unknown>)[key], depth + 1);
    }
    if (keys.length > 20) {
      sanitized['...'] = `${keys.length - 20} more keys`;
    }
    return sanitized;
  }
  
  return String(value);
}

function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return '';
  
  const sanitized = sanitizeValue(context) as Record<string, unknown>;
  
  try {
    return '\n' + colors.dim + JSON.stringify(sanitized, null, 2) + colors.reset;
  } catch {
    return '\n' + colors.dim + '[unserializable context]' + colors.reset;
  }
}

class Logger {
  private component: string;
  
  constructor(component: string) {
    this.component = component;
  }
  
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (level < currentLevel) return;
    
    const timestamp = formatTimestamp();
    const levelColor = levelColors[level];
    const levelName = levelNames[level];
    
    const prefix = `${colors.dim}${timestamp}${colors.reset} ${levelColor}${levelName}${colors.reset} ${colors.magenta}[${this.component}]${colors.reset}`;
    const contextStr = formatContext(context);
    
    const output = `${prefix} ${message}${contextStr}`;
    
    if (level === LogLevel.ERROR) {
      console.error(output);
    } else if (level === LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
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
  child(subComponent: string): Logger {
    return new Logger(`${this.component}:${subComponent}`);
  }
  
  /**
   * Time an async operation and log its duration
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
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
  
  /**
   * Log a separator line for visual clarity
   */
  separator(title?: string): void {
    if (currentLevel > LogLevel.DEBUG) return;
    const line = '═'.repeat(60);
    if (title) {
      console.log(`\n${colors.cyan}${line}${colors.reset}`);
      console.log(`${colors.cyan}  ${title}${colors.reset}`);
      console.log(`${colors.cyan}${line}${colors.reset}`);
    } else {
      console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
    }
  }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

// Pre-created loggers for main components
export const serverLogger = createLogger('Server');
export const dbLogger = createLogger('Database');
export const llmLogger = createLogger('LLM');
export const generatorLogger = createLogger('Generator');
export const routesLogger = createLogger('Routes');

