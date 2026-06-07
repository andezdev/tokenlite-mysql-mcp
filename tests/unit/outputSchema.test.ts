import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

const explainRows = [{
    id: 1,
    select_type: 'SIMPLE',
    table: 'customers',
    partitions: null,
    type: 'const',
    possible_keys: 'PRIMARY',
    key: 'PRIMARY',
    key_len: '4',
    ref: 'const',
    rows: 1,
    filtered: 100,
    Extra: null,
}];

vi.mock('../../src/db/index.js', () => {
    const mockPool = {
        query: vi.fn().mockResolvedValue([[{ version: '8.0.35' }]]),
        pool: {
            _allConnections: [1, 2],
            _freeConnections: [1],
            _connectionQueue: [],
        },
    };
    return {
        pool: mockPool,
        executeExplainQuery: vi.fn().mockResolvedValue(explainRows),
    };
});

vi.mock('../../src/utils/rateLimiter.js', () => ({
    checkRateLimit: vi.fn(),
}));

describe('Ping structuredContent', () => {
    it('should return structuredContent with status, server_version, and pool', async () => {
        const { handlePing } = await import('../../src/tools/ping');
        const result = await handlePing();

        expect(result.structuredContent).toBeDefined();
        const sc = result.structuredContent as any;
        expect(sc.status).toBe('ok');
        expect(sc.server_version).toBe('8.0.35');
        expect(sc.pool).toEqual({ active: 2, idle: 1, queue: 0 });
    });

    it('should also return text content for backward compatibility', async () => {
        const { handlePing } = await import('../../src/tools/ping');
        const result = await handlePing();

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe('ok');
    });
});

describe('ExplainQuery structuredContent', () => {
    it('should accept MySQL 8 EXPLAIN columns in outputSchema', async () => {
        const { explainOutputSchema } = await import('../../src/tools/explainQuery');
        const schema = z.object(explainOutputSchema);
        expect(() => schema.parse({ rows: explainRows })).not.toThrow();
    });

    it('should return structuredContent with rows', async () => {
        const { handleExplainQuery } = await import('../../src/tools/explainQuery');
        const result = await handleExplainQuery({ sql: 'SELECT * FROM orders WHERE id = 1' });

        expect(result.structuredContent).toBeDefined();
        const sc = result.structuredContent as any;
        expect(sc.rows).toHaveLength(1);
        expect(sc.rows[0].table).toBe('customers');
        expect(sc.rows[0].filtered).toBe(100);
    });
});
