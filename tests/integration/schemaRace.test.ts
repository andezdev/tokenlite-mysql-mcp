import { describe, it, expect, afterAll } from 'vitest';
import { buildSchemaGraph, schemaGraph } from '../../src/db/schema.js';
import { handleSearchSchema } from '../../src/tools/searchSchema.js';
import { pool } from '../../src/db/index.js';

describe('Schema Graph Race Conditions', () => {
    afterAll(async () => {
        await pool.end();
    });

    it('should handle concurrent buildSchemaGraph calls without corruption', async () => {
        const builds = Array.from({ length: 5 }, () => buildSchemaGraph());
        await Promise.all(builds);

        expect(schemaGraph.size).toBeGreaterThan(0);
        expect(schemaGraph.has('customers')).toBe(true);
        expect(schemaGraph.has('orders')).toBe(true);

        // Verify graph integrity: every FK points to a valid table
        for (const [, node] of schemaGraph) {
            for (const fk of node.foreignKeys) {
                expect(schemaGraph.has(fk.referencedTable)).toBe(true);
            }
        }
    });

    it('should handle concurrent search_schema during graph rebuild', async () => {
        await buildSchemaGraph();

        const operations = [
            buildSchemaGraph(),
            handleSearchSchema({ query: 'orders' }),
            handleSearchSchema({ query: 'customers' }),
            buildSchemaGraph(),
            handleSearchSchema({ query: 'categories' }),
        ];

        const results = await Promise.all(operations);

        // buildSchemaGraph returns void (undefined), searchSchema returns content
        const searchResults = results.filter(r => r !== undefined);
        for (const result of searchResults) {
            const r = result as any;
            expect(r.content).toBeDefined();
            expect(r.content[0].text).toBeTruthy();
        }
    });
});
