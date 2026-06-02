import { describe, it, expect, vi } from 'vitest';
import { getIndexHint } from '../../src/db/optimizer.js';

function mockPool(rows: any[]) {
    return { query: vi.fn().mockResolvedValue([rows]) } as any;
}

function mockPoolError() {
    return { query: vi.fn().mockRejectedValue(new Error('connection lost')) } as any;
}

describe('getIndexHint', () => {
    it('should list available secondary indexes', async () => {
        const pool = mockPool([
            { Key_name: 'PRIMARY', Column_name: 'id' },
            { Key_name: 'idx_customer_id', Column_name: 'customer_id' },
            { Key_name: 'idx_created_at', Column_name: 'created_at' },
        ]);
        const hint = await getIndexHint('orders', pool);
        expect(hint).toContain('Available indexes');
        expect(hint).toContain('idx_customer_id (customer_id)');
        expect(hint).toContain('idx_created_at (created_at)');
    });

    it('should group composite index columns', async () => {
        const pool = mockPool([
            { Key_name: 'PRIMARY', Column_name: 'id' },
            { Key_name: 'idx_composite', Column_name: 'tenant_id' },
            { Key_name: 'idx_composite', Column_name: 'created_at' },
        ]);
        const hint = await getIndexHint('events', pool);
        expect(hint).toContain('idx_composite (tenant_id, created_at)');
    });

    it('should indicate no secondary indexes when only PRIMARY exists', async () => {
        const pool = mockPool([
            { Key_name: 'PRIMARY', Column_name: 'id' },
        ]);
        const hint = await getIndexHint('orders', pool);
        expect(hint).toContain('No secondary indexes found');
        expect(hint).toContain('PRIMARY KEY');
    });

    it('should return generic hint for invalid table names', async () => {
        const pool = mockPool([]);
        const hint = await getIndexHint('orders; DROP TABLE', pool);
        expect(hint).toContain('Please add an indexed filter');
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('should return generic hint for empty table name', async () => {
        const pool = mockPool([]);
        const hint = await getIndexHint('', pool);
        expect(hint).toContain('Please add an indexed filter');
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('should return generic hint when query fails', async () => {
        const pool = mockPoolError();
        const hint = await getIndexHint('orders', pool);
        expect(hint).toContain('Please add an indexed filter');
    });
});
