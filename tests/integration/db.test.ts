import { describe, it, expect, beforeAll } from 'vitest';
import { pingDb, executeSafeQuery } from '../../src/db/index';

describe('Database Integration', () => {
    it('should be able to connect to the database (ping)', async () => {
        const isAlive = await pingDb();
        expect(isAlive).toBe(true);
    });

    it('should truncate queries without LIMIT to 500 rows', async () => {
        // Temporarily set high threshold so the Optimizer doesn't block the full table scan
        const originalThreshold = process.env.MCP_SAFE_QUERY_MAX_ROWS;
        process.env.MCP_SAFE_QUERY_MAX_ROWS = '5000';
        
        const rows = await executeSafeQuery('SELECT * FROM customers');
        expect(rows.length).toBe(500); // Because of AST limit injection
        
        process.env.MCP_SAFE_QUERY_MAX_ROWS = originalThreshold;
    });
});
