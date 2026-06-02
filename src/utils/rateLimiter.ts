import { log } from './logger.js';

const RATE_LIMIT_RPM = parseInt(process.env.MCP_RATE_LIMIT_RPM || '60', 10);

const timestamps: number[] = [];

export class RateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}

export function checkRateLimit(): void {
    if (RATE_LIMIT_RPM <= 0) return;

    const now = Date.now();
    const windowStart = now - 60_000;

    // Evict expired timestamps
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
        timestamps.shift();
    }

    if (timestamps.length >= RATE_LIMIT_RPM) {
        const oldestInWindow = timestamps[0];
        const retryAfterMs = oldestInWindow + 60_000 - now;
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);
        log("warning", `Rate limit exceeded: ${RATE_LIMIT_RPM} requests/min. Retry after ${retryAfterSec}s.`, "rate-limiter");
        throw new RateLimitError(
            `Rate limit exceeded (${RATE_LIMIT_RPM} requests/min). Please wait ${retryAfterSec} seconds before retrying.`
        );
    }

    timestamps.push(now);
}

export function resetRateLimit(): void {
    timestamps.length = 0;
}
