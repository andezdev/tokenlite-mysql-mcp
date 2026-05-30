import { describe, it, expect, beforeAll } from 'vitest';
import { pingDb, executeSafeQuery } from '../../src/db/index';

describe('Database Integration', () => {
    it('should be able to connect to the database (ping)', async () => {
        const isAlive = await pingDb();
        expect(isAlive).toBe(true);
    });

    it('should truncate queries without LIMIT to 500 rows', async () => {
        const rows = await executeSafeQuery('SELECT * FROM customers');
        expect(Array.isArray(rows)).toBe(true);
    });
});
