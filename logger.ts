import { LOGGING } from './constants';

/**
 * 简单的日志工具
 */
class Logger {
	private enabled: boolean;
	private prefix: string;

	constructor() {
		this.enabled = LOGGING.ENABLED;
		this.prefix = LOGGING.PREFIX;
	}

	private formatMessage(level: string, message: string): string {
		return `${this.prefix} [${level}] ${message}`;
	}

	log(message: string, ...args: any[]): void {
		if (this.enabled) {
			console.log(this.formatMessage('LOG', message), ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		// 错误日志始终显示
		console.error(this.formatMessage('ERROR', message), ...args);
	}

	warn(message: string, ...args: any[]): void {
		if (this.enabled) {
			console.warn(this.formatMessage('WARN', message), ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.enabled) {
			console.log(this.formatMessage('DEBUG', message), ...args);
		}
	}
}

export const logger = new Logger();
