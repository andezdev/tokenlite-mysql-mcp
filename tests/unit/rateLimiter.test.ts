import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, resetRateLimit, RateLimitError } from '../../src/utils/rateLimiter.js';

describe('Rate Limiter', () => {
    beforeEach(() => {
        resetRateLimit();
    });

    it('should allow requests within the limit', () => {
        for (let i = 0; i < 10; i++) {
            expect(() => checkRateLimit()).not.toThrow();
        }
    });

    it('should block requests exceeding the limit', () => {
        // Default MCP_RATE_LIMIT_RPM is 60
        for (let i = 0; i < 60; i++) {
            checkRateLimit();
        }
        expect(() => checkRateLimit()).toThrow(RateLimitError);
    });

    it('should include retry-after info in the error message', () => {
        for (let i = 0; i < 60; i++) {
            checkRateLimit();
        }
        try {
            checkRateLimit();
        } catch (e: any) {
            expect(e).toBeInstanceOf(RateLimitError);
            expect(e.message).toContain('Rate limit exceeded');
            expect(e.message).toContain('60 requests/min');
            expect(e.message).toMatch(/wait \d+ seconds/);
        }
    });

    it('should allow requests again after the window expires', () => {
        vi.useFakeTimers();

        for (let i = 0; i < 60; i++) {
            checkRateLimit();
        }
        expect(() => checkRateLimit()).toThrow(RateLimitError);

        // Advance past the 60s window
        vi.advanceTimersByTime(61_000);

        expect(() => checkRateLimit()).not.toThrow();

        vi.useRealTimers();
    });

    it('should evict old timestamps progressively', () => {
        vi.useFakeTimers();

        // Fill up the window
        for (let i = 0; i < 60; i++) {
            checkRateLimit();
        }
        expect(() => checkRateLimit()).toThrow(RateLimitError);

        // Advance 30s — oldest 30 entries should still be in window
        vi.advanceTimersByTime(30_000);
        expect(() => checkRateLimit()).toThrow(RateLimitError);

        // Advance another 31s — all original entries expired
        vi.advanceTimersByTime(31_000);
        expect(() => checkRateLimit()).not.toThrow();

        vi.useRealTimers();
    });
});
