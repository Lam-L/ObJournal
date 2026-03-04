import { LOGGING } from '../constants';

/**
 * Simple logging utility
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
		// Error logs always shown
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

	/** Thumbnail cache logs (controlled by LOGGING.THUMBNAIL) */
	thumbnail(message: string, ...args: unknown[]): void {
		if (LOGGING.THUMBNAIL) {
			console.log(`${this.prefix} [缩略图] ${message}`, ...args);
		}
	}

	thumbnailWarn(message: string, ...args: unknown[]): void {
		if (LOGGING.THUMBNAIL) {
			console.warn(`${this.prefix} [缩略图] ${message}`, ...args);
		}
	}
}

export const logger = new Logger();
