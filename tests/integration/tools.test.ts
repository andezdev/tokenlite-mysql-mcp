import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { handleSearchSchema } from '../../src/tools/searchSchema.js';
import { handleExecuteQuery } from '../../src/tools/executeQuery.js';
import { buildSchemaGraph } from '../../src/db/schema.js';
import { pool } from '../../src/db/index.js';

describe('MCP Tools Integration & Risk Mitigations', () => {
    beforeAll(async () => {
        await buildSchemaGraph();
    });

    afterAll(async () => {
        await pool.end();
    });

    it('[Risk A & C] search_schema should fetch DDL On-Demand and include auto-join context', async () => {
        const result = await handleSearchSchema({ query: 'orders' });
        expect(result.isError).toBeUndefined();
        
        const content = result.content[0].text as string;
        
        expect(content).toContain('CREATE TABLE `orders`');
        expect(content).toContain('CREATE TABLE `customers`');
        expect(content).toMatch(/INFERRED PARENT \(confidence: \d+\): `orders`\.`customer_id` -> `customers`\.`id`/);
    });

    it('[Risk B] execute_safe_query should intercept ER_BAD_FIELD_ERROR and suggest refresh_schema', async () => {
        const result = await handleExecuteQuery({ sql: 'SELECT imaginary_column FROM customers' });
        
        expect(result.isError).toBe(true);
        const content = result.content[0].text as string;
        
        expect(content).toContain('refresh_schema');
        expect(content).not.toMatch(/ER_BAD_FIELD_ERROR|at\s+[\w./\\-]+:\d+/);
    });
});
