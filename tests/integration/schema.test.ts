import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildSchemaGraph, schemaGraph } from '../../src/db/schema.js';
import { pool } from '../../src/db/index.js';

describe('Schema Graph & Heuristic Engine', () => {
    beforeAll(async () => {
        await buildSchemaGraph();
    });

    afterAll(async () => {
        await pool.end();
    });

    it('should extract all tables', () => {
        expect(schemaGraph.size).toBeGreaterThan(0);
        expect(schemaGraph.has('customers')).toBe(true);
        expect(schemaGraph.has('orders')).toBe(true);
    });

    it('should infer the foreign key from orders to customers via heuristics', () => {
        const ordersNode = schemaGraph.get('orders');
        expect(ordersNode).toBeDefined();
        
        // Orders should have a heuristic FK pointing to customers
        const fk = ordersNode?.foreignKeys.find(f => f.columnName === 'customer_id');
        expect(fk).toBeDefined();
        expect(fk?.referencedTable).toBe('customers');
        expect(fk?.isHeuristic).toBe(true);
    });

    it('should NOT add fake foreign keys to unrelated columns', () => {
        const customersNode = schemaGraph.get('customers');
        // Customers has 'id', 'name', 'email', 'created_at' -> No '_id' suffix meaning no heuristic FKs
        expect(customersNode?.foreignKeys.length).toBe(0);
    });
});
