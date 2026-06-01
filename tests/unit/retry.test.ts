import { describe, it, expect } from 'vitest';
import { isRetryableError } from '../../src/db/index';

describe('Connection Resilience - isRetryableError', () => {
    it('should identify ECONNREFUSED as retryable', () => {
        expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
    });

    it('should identify PROTOCOL_CONNECTION_LOST as retryable', () => {
        expect(isRetryableError({ code: 'PROTOCOL_CONNECTION_LOST' })).toBe(true);
    });

    it('should identify ECONNRESET as retryable', () => {
        expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    });

    it('should identify ETIMEDOUT as retryable', () => {
        expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
    });

    it('should identify ER_CON_COUNT_ERROR as retryable', () => {
        expect(isRetryableError({ code: 'ER_CON_COUNT_ERROR' })).toBe(true);
    });

    it('should identify "Connection lost" message as retryable', () => {
        expect(isRetryableError({ message: 'Connection lost: The server closed the connection.' })).toBe(true);
    });

    it('should NOT retry syntax errors', () => {
        expect(isRetryableError({ code: 'ER_PARSE_ERROR', message: 'You have an error in your SQL syntax' })).toBe(false);
    });

    it('should NOT retry permission errors', () => {
        expect(isRetryableError({ code: 'ER_ACCESS_DENIED_ERROR', message: 'Access denied' })).toBe(false);
    });

    it('should NOT retry bad field errors', () => {
        expect(isRetryableError({ code: 'ER_BAD_FIELD_ERROR', message: 'Unknown column' })).toBe(false);
    });

    it('should NOT retry timeout errors (query timeout, not connection)', () => {
        expect(isRetryableError({ code: 'PROTOCOL_SEQUENCE_TIMEOUT', message: 'Query timeout' })).toBe(false);
    });

    it('should handle errors with no code or message', () => {
        expect(isRetryableError({})).toBe(false);
        expect(isRetryableError({ code: undefined })).toBe(false);
    });
});
