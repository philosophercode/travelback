type LogLevel = 'error' | 'warn' | 'info' | 'debug';

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel && ['error', 'warn', 'info', 'debug'].includes(envLevel)) {
      this.logLevel = envLevel as LogLevel;
    } else {
      this.logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(level) <= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (args.length > 0) {
      // Format args to avoid verbose object dumps
      const formattedArgs = args.map(arg => {
        if (arg instanceof Error) {
          // Extract error info without dumping the entire error object
          const errorInfo: Record<string, unknown> = {
            message: arg.message,
            name: arg.name,
          };
          if (arg.stack) {
            errorInfo.stack = arg.stack;
          }
          // Check if error has any database-related properties and exclude them
          const errorObj = arg as unknown as Record<string, unknown>;
          for (const key in errorObj) {
            if (key !== 'message' && key !== 'name' && key !== 'stack' && key !== 'code') {
              const value = errorObj[key];
              // Skip database client/pool objects
              if (typeof value === 'object' && value !== null) {
                if ('query' in value || 'connect' in value || '_poolUseCount' in value) {
                  continue; // Skip database objects
                }
              }
              // Only include simple properties
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                errorInfo[key] = value;
              }
            }
          }
          return errorInfo;
        }
        // For objects, sanitize to avoid database client dumps
        if (typeof arg === 'object' && arg !== null) {
          try {
            // Check if it's a database client or pool object (has internal pg properties)
            if ('query' in arg || 'connect' in arg || '_poolUseCount' in arg || 'release' in arg) {
              return '[Database client/pool object]';
            }
            // Recursively check nested objects for database clients
            const sanitized = this.sanitizeObject(arg);
            return JSON.stringify(sanitized, null, 2);
          } catch {
            return '[Object]';
          }
        }
        return arg;
      });
      // Ensure all args are strings/primitives to prevent object dumps
      const stringArgs = formattedArgs.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return arg;
      });
      console[level === 'error' ? 'error' : 'log'](prefix, message, ...stringArgs);
    } else {
      console[level === 'error' ? 'error' : 'log'](prefix, message);
    }
  }

  private sanitizeObject(obj: unknown, depth = 0): unknown {
    // Prevent infinite recursion
    if (depth > 5) {
      return '[Max depth reached]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    // Check if it's a database client/pool object
    if (typeof obj === 'object') {
      const objRecord = obj as Record<string, unknown>;
      if ('query' in objRecord || 'connect' in objRecord || '_poolUseCount' in objRecord || 'release' in objRecord) {
        return '[Database client/pool object]';
      }

      // Recursively sanitize object properties
      const sanitized: Record<string, unknown> = {};
      for (const key in objRecord) {
        const value = objRecord[key];
        // Skip Symbol properties
        if (typeof key === 'symbol') {
          continue;
        }
        // Recursively sanitize nested objects
        if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeObject(value, depth + 1);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return obj;
  }

  error(message: string, ...args: unknown[]): void {
    this.formatMessage('error', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.formatMessage('warn', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.formatMessage('info', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.formatMessage('debug', message, ...args);
  }
}

export const logger = new Logger();

