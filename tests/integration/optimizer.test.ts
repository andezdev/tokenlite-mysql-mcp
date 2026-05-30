import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeQueryPlan, OptimizerError } from '../../src/db/optimizer.js';
import { pool } from '../../src/db/index.js';

describe('Safe-Query Optimizer - EXPLAIN Analysis', () => {
    const originalMaxRows = process.env.MCP_SAFE_QUERY_MAX_ROWS;

    beforeAll(() => {
        // Lower the threshold to 1 row to trigger blocks because InnoDB estimates 3 rows
        process.env.MCP_SAFE_QUERY_MAX_ROWS = '1';
    });

    afterAll(async () => {
        process.env.MCP_SAFE_QUERY_MAX_ROWS = originalMaxRows;
        await pool.end();
    });

    it('should block Full Table Scans when estimated rows exceed threshold', async () => {
        // 'orders' has no indexes on 'status' and 3 rows, so it scans > 2 rows
        const sql = "SELECT * FROM orders WHERE status = 'shipped'";
        
        await expect(analyzeQueryPlan(sql, pool)).rejects.toThrow(OptimizerError);
        await expect(analyzeQueryPlan(sql, pool)).rejects.toThrow(/Full table scan detected on table 'orders'/);
    });

    it('should allow indexed queries', async () => {
        // 'customers' has a primary key on 'id', so selecting by id uses index (type: const or range)
        const sql = "SELECT * FROM customers WHERE id = 1";
        
        // Should not throw
        await expect(analyzeQueryPlan(sql, pool)).resolves.toBeUndefined();
    });

    it('should allow queries that scan fewer rows than the threshold', async () => {
        // Suppose we have a small table (e.g. categories might only have 2 rows)
        // Wait, orders only has 2 rows... let's temporarily set threshold to 2000
        process.env.MCP_SAFE_QUERY_MAX_ROWS = '2000';
        
        const sql = "SELECT * FROM orders";
        
        // Now it shouldn't throw because estimated rows (~1502) < 2000
        await expect(analyzeQueryPlan(sql, pool)).resolves.toBeUndefined();
        
        // Revert threshold back
        process.env.MCP_SAFE_QUERY_MAX_ROWS = '2';
    });
});
