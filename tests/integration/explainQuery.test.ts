import { describe, it, expect, beforeAll } from 'vitest';
import { handleExplainQuery } from '../../src/tools/explainQuery';
import { buildSchemaGraph } from '../../src/db/schema';

describe('Explain Query Tool', () => {
    beforeAll(async () => {
        await buildSchemaGraph();
    });

    it('should return EXPLAIN output for a query using an index', async () => {
        const result = await handleExplainQuery({ sql: 'SELECT * FROM customers WHERE id = 1' });
        expect(result.isError).toBeUndefined();

        const text = result.content[0].text;
        expect(text).toContain('id');
        expect(text).toContain('select_type');
        expect(text).toContain('table');
    });

    it('should return EXPLAIN output showing full table scan', async () => {
        const result = await handleExplainQuery({ sql: 'SELECT * FROM customers' });
        expect(result.isError).toBeUndefined();

        const text = result.content[0].text;
        expect(text).toContain('ALL');
    });

    it('should return error for invalid SQL', async () => {
        const result = await handleExplainQuery({ sql: 'NOT VALID SQL' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('EXPLAIN Error');
    });

    it('should work regardless of write permission flags', async () => {
        process.env.ALLOW_INSERT_OPERATION = 'false';
        process.env.ALLOW_DELETE_OPERATION = 'false';

        const result = await handleExplainQuery({ sql: 'SELECT * FROM customers WHERE id = 1' });
        expect(result.isError).toBeUndefined();

        delete process.env.ALLOW_INSERT_OPERATION;
        delete process.env.ALLOW_DELETE_OPERATION;
    });
});
