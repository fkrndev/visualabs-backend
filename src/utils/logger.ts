/**
 * Structured logging utility
 * Replaces console.error with proper logging levels and context
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

interface LogContext {
  timestamp?: string;
  level: LogLevel;
  message: string;
  context?: string;
  userId?: number;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
}

class Logger {
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
  }

  private formatLog(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error): LogContext {
    const logEntry: LogContext = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
    };

    if (metadata) {
      logEntry.metadata = metadata;
    }

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    return logEntry;
  }

  private output(logEntry: LogContext) {
    const { level, timestamp, context, message, error, metadata } = logEntry;
    
    const logMessage = `[${timestamp}] [${level}] [${context}] ${message}`;
    
    switch (level) {
      case LogLevel.DEBUG:
        if (process.env.NODE_ENV === 'development') {
          console.debug(logMessage, metadata || '', error || '');
        }
        break;
      case LogLevel.INFO:
        console.info(logMessage, metadata || '');
        break;
      case LogLevel.WARN:
        console.warn(logMessage, metadata || '', error || '');
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(logMessage, metadata || '', error || '');
        break;
    }
  }

  debug(message: string, metadata?: Record<string, any>) {
    const logEntry = this.formatLog(LogLevel.DEBUG, message, metadata);
    this.output(logEntry);
  }

  info(message: string, metadata?: Record<string, any>) {
    const logEntry = this.formatLog(LogLevel.INFO, message, metadata);
    this.output(logEntry);
  }

  warn(message: string, metadata?: Record<string, any>) {
    const logEntry = this.formatLog(LogLevel.WARN, message, metadata);
    this.output(logEntry);
  }

  error(message: string, error?: Error | unknown, metadata?: Record<string, any>) {
    const logEntry = this.formatLog(LogLevel.ERROR, message, metadata, error as Error);
    this.output(logEntry);
  }

  fatal(message: string, error?: Error, metadata?: Record<string, any>) {
    const logEntry = this.formatLog(LogLevel.FATAL, message, metadata, error);
    this.output(logEntry);
  }
}

// Create context-specific loggers
export const createLogger = (context: string): Logger => {
  return new Logger(context);
};

// Default logger
export const logger = new Logger('App');
