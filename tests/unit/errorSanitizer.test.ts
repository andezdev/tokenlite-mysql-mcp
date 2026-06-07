import { describe, it, expect } from 'vitest';
import { sanitizeDatabaseError } from '../../src/utils/errorSanitizer.js';
import { OptimizerError } from '../../src/db/optimizer.js';
import { RateLimitError } from '../../src/utils/rateLimiter.js';

describe('sanitizeDatabaseError', () => {
    it('should pass through OptimizerError messages unchanged', () => {
        const error = new OptimizerError('Full table scan detected on table users.');
        expect(sanitizeDatabaseError(error)).toBe('Full table scan detected on table users.');
    });

    it('should pass through RateLimitError messages unchanged', () => {
        const error = new RateLimitError('Rate limit exceeded (60 requests/min).');
        expect(sanitizeDatabaseError(error)).toBe('Rate limit exceeded (60 requests/min).');
    });

    it('should map known MySQL error codes to safe messages', () => {
        const error = Object.assign(new Error("Unknown column 'foo' in 'field list'"), {
            code: 'ER_BAD_FIELD_ERROR',
        });
        expect(sanitizeDatabaseError(error)).toBe('A referenced column does not exist in the database.');
    });

    it('should redact sensitive stack trace details from generic errors', () => {
        const error = new Error('failed at /app/src/db/index.ts:42:10 with ER_ACCESS_DENIED_ERROR');
        const sanitized = sanitizeDatabaseError(error);
        expect(sanitized).not.toContain('/app/src/db/index.ts');
        expect(sanitized).not.toContain('ER_ACCESS_DENIED_ERROR');
    });
});
