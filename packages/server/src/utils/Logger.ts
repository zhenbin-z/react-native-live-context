type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m',  // Reset
};

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private useColors: boolean;

  constructor(level: LogLevel = 'info', prefix: string = '[LiveContext-Server]', useColors: boolean = true) {
    this.level = level;
    this.prefix = prefix;
    this.useColors = useColors && process.stdout.isTTY;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    
    let formatted = `${this.prefix} ${timestamp} ${levelStr} ${message}`;
    
    if (data) {
      formatted += ` ${JSON.stringify(data, null, 2)}`;
    }
    
    if (this.useColors) {
      const color = LOG_COLORS[level];
      formatted = `${color}${formatted}${LOG_COLORS.reset}`;
    }
    
    return formatted;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  child(prefix: string): Logger {
    return new Logger(this.level, `${this.prefix}${prefix}`, this.useColors);
  }
}