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

    it('should assign confidence scores to heuristic FKs', () => {
        const ordersNode = schemaGraph.get('orders');
        const fk = ordersNode?.foreignKeys.find(f => f.columnName === 'customer_id' && f.isHeuristic);
        expect(fk).toBeDefined();
        expect(fk?.confidence).toBeGreaterThanOrEqual(70);
        expect(fk?.confidence).toBeLessThanOrEqual(100);
    });

    it('should not assign confidence to explicit FKs', () => {
        const shippingNode = schemaGraph.get('shipping_addresses');
        const fk = shippingNode?.foreignKeys.find(f => f.columnName === 'customer_id' && !f.isHeuristic);
        expect(fk).toBeDefined();
        expect(fk?.confidence).toBeUndefined();
    });

    it('should resolve real PK column name instead of assuming id', () => {
        const ordersNode = schemaGraph.get('orders');
        const fk = ordersNode?.foreignKeys.find(f => f.columnName === 'customer_id' && f.isHeuristic);
        expect(fk?.referencedColumn).toBe('id');
    });

    it('should detect self-referencing FK (categories.parent_id → categories)', () => {
        const categoriesNode = schemaGraph.get('categories');
        expect(categoriesNode).toBeDefined();

        const fk = categoriesNode?.foreignKeys.find(f => f.columnName === 'parent_id');
        expect(fk).toBeDefined();
        expect(fk?.referencedTable).toBe('categories');
        expect(fk?.isHeuristic).toBe(true);
        expect(fk?.confidence).toBeGreaterThanOrEqual(70);
    });

    it('should give higher confidence to indexed _id columns (MUL)', () => {
        // orders.customer_id has INDEX idx_customer_id → gets +10 for MUL
        const ordersNode = schemaGraph.get('orders');
        const fk = ordersNode?.foreignKeys.find(f => f.columnName === 'customer_id' && f.isHeuristic);
        expect(fk?.confidence).toBe(100); // name(40) + type(30) + PRI(20) + MUL(10)
    });

    it('should reject type-mismatched heuristic FKs (INT tag_id vs VARCHAR tags.uuid)', () => {
        const ptNode = schemaGraph.get('product_tags');
        expect(ptNode).toBeDefined();

        // tag_id should NOT produce a heuristic FK to tags because INT != VARCHAR
        const tagFk = ptNode?.foreignKeys.find(f => f.columnName === 'tag_id' && f.isHeuristic);
        expect(tagFk).toBeUndefined();
    });

    it('should include new test tables in the graph', () => {
        expect(schemaGraph.has('tags')).toBe(true);
        expect(schemaGraph.has('product_tags')).toBe(true);
        expect(schemaGraph.has('categories')).toBe(true);
    });
});
