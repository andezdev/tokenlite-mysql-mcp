import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/schema.js', () => ({
    schemaGraph: new Map([
        ['customers', { name: 'customers', foreignKeys: [] }],
        ['orders', { name: 'orders', foreignKeys: [] }],
        ['order_items', { name: 'order_items', foreignKeys: [] }],
    ]),
}));

describe('completeTableNames', () => {
    let completeTableNames: (value: string) => string[];

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../../src/utils/tableCompletions.js');
        completeTableNames = mod.completeTableNames;
    });

    it('should return all tables when value is empty', () => {
        const results = completeTableNames('');
        expect(results).toContain('customers');
        expect(results).toContain('orders');
    });

    it('should filter tables by partial match', () => {
        const results = completeTableNames('order');
        expect(results).toEqual(['orders', 'order_items']);
    });
});
