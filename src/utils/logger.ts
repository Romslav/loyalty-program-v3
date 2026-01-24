import fs from 'fs';
import path from 'path';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private logDir = path.join(process.cwd(), 'logs');

  constructor() {
    this.ensureLogDir();
  }

  private ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private format(level: LogLevel, message: string, data?: any): string {
    const timestamp = this.getTimestamp();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
  }

  private write(level: LogLevel, message: string, data?: any) {
    const formatted = this.format(level, message, data);
    console.log(formatted);

    // Write to file
    const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, formatted + '\n');
  }

  info(message: string, data?: any) {
    this.write('info', message, data);
  }

  warn(message: string, data?: any) {
    this.write('warn', message, data);
  }

  error(message: string, data?: any) {
    this.write('error', message, data);
  }

  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      this.write('debug', message, data);
    }
  }
}

export const logger = new Logger();
