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

	log(_message: string, ..._args: unknown[]): void {}

	error(_message: string, ..._args: unknown[]): void {}

	warn(_message: string, ..._args: unknown[]): void {}

	debug(_message: string, ..._args: unknown[]): void {}

	thumbnail(_message: string, ..._args: unknown[]): void {}

	thumbnailWarn(_message: string, ..._args: unknown[]): void {}

	scroll(_message: string, ..._args: unknown[]): void {}
}

export const logger = new Logger();
