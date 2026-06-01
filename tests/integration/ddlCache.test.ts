import { describe, it, expect, beforeAll, vi } from 'vitest';
import { buildSchemaGraph, getTableDDL, invalidateDdlCache } from '../../src/db/schema';
import { pool } from '../../src/db/index';

describe('DDL Cache with TTL', () => {
    beforeAll(async () => {
        await buildSchemaGraph();
    });

    it('should return cached DDL on second call without querying the database', async () => {
        invalidateDdlCache();

        const querySpy = vi.spyOn(pool, 'query');

        const ddl1 = await getTableDDL('customers');
        expect(ddl1).toBeTruthy();
        const queryCountAfterFirst = querySpy.mock.calls.length;

        const ddl2 = await getTableDDL('customers');
        expect(ddl2).toBe(ddl1);
        expect(querySpy.mock.calls.length).toBe(queryCountAfterFirst);

        querySpy.mockRestore();
    });

    it('should fetch fresh DDL after cache invalidation', async () => {
        const ddl1 = await getTableDDL('customers');
        expect(ddl1).toBeTruthy();

        invalidateDdlCache();

        const querySpy = vi.spyOn(pool, 'query');

        const ddl2 = await getTableDDL('customers');
        expect(ddl2).toBeTruthy();
        expect(querySpy.mock.calls.length).toBeGreaterThan(0);

        querySpy.mockRestore();
    });

    it('should invalidate cache when buildSchemaGraph is called', async () => {
        const ddl1 = await getTableDDL('orders');
        expect(ddl1).toBeTruthy();

        await buildSchemaGraph();

        const querySpy = vi.spyOn(pool, 'query');

        const ddl2 = await getTableDDL('orders');
        expect(ddl2).toBeTruthy();
        expect(querySpy.mock.calls.length).toBeGreaterThan(0);

        querySpy.mockRestore();
    });
});
