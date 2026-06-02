import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/db/index.js';

describe('Pool Pressure & Concurrency', () => {
    afterAll(async () => {
        await pool.end();
    });

    it('should handle concurrent queries up to the connection limit', async () => {
        const concurrency = 10;
        const queries = Array.from({ length: concurrency }, () =>
            pool.query('SELECT SLEEP(0.05)')
        );
        const results = await Promise.all(queries);
        expect(results).toHaveLength(concurrency);
    });

    it('should queue requests when all connections are busy', async () => {
        const concurrency = 15; // exceeds default connectionLimit of 10
        const queries = Array.from({ length: concurrency }, () =>
            pool.query('SELECT SLEEP(0.05)')
        );
        const results = await Promise.all(queries);
        expect(results).toHaveLength(concurrency);
    });

    it('should handle query timeout gracefully', async () => {
        try {
            await pool.query({ sql: 'SELECT SLEEP(5)', timeout: 100 });
            expect.unreachable('should have timed out');
        } catch (e: any) {
            expect(e.message).toMatch(/timeout|PROTOCOL_SEQUENCE_TIMEOUT/i);
        }
    });
});
