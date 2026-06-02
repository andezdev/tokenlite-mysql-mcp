import { describe, it, expect } from 'vitest';
import { resolveTargetTable, computeConfidence } from '../../src/db/schema.js';

describe('resolveTargetTable', () => {
    const tables = new Set(['customers', 'orders', 'categories', 'address']);

    it('should match exact table name', () => {
        expect(resolveTargetTable('address', 'orders', tables)).toBe('address');
    });

    it('should match plural with s', () => {
        expect(resolveTargetTable('customer', 'orders', tables)).toBe('customers');
    });

    it('should match plural with es', () => {
        expect(resolveTargetTable('order', 'items', tables)).toBe('orders');
    });

    it('should match y → ies', () => {
        const t = new Set(['companies']);
        expect(resolveTargetTable('company', 'orders', t)).toBe('companies');
    });

    it('should detect self-reference with parent_id', () => {
        expect(resolveTargetTable('parent', 'categories', tables)).toBe('categories');
    });

    it('should detect self-reference when baseName matches singular of table', () => {
        expect(resolveTargetTable('category', 'categories', tables)).toBe('categories');
    });

    it('should return null when no match found', () => {
        expect(resolveTargetTable('nonexistent', 'orders', tables)).toBeNull();
    });
});

describe('computeConfidence', () => {
    const intPri = { columnName: 'id', dataType: 'int', columnKey: 'PRI' };
    const varcharPri = { columnName: 'id', dataType: 'varchar', columnKey: 'PRI' };
    const intUni = { columnName: 'code', dataType: 'int', columnKey: 'UNI' };

    it('should return 100 for full match: name + type + PRI + indexed', () => {
        // name=40 + type=30 + PRI=20 + MUL=10 = 100
        expect(computeConfidence('int', 'MUL', intPri)).toBe(100);
    });

    it('should return 90 for name + type + PRI (not indexed)', () => {
        expect(computeConfidence('int', null, intPri)).toBe(90);
    });

    it('should return 60 for name + PRI but type mismatch (below threshold)', () => {
        // name=40 + type=0 + PRI=20 = 60
        expect(computeConfidence('int', null, varcharPri)).toBe(60);
    });

    it('should use UNI score (+15) instead of PRI (+20)', () => {
        // name=40 + type=30 + UNI=15 = 85
        expect(computeConfidence('int', null, intUni)).toBe(85);
    });

    it('should return 40 when no target PK info available', () => {
        expect(computeConfidence('int', null, undefined)).toBe(40);
    });

    it('should add 10 for indexed source column (MUL)', () => {
        expect(computeConfidence('int', 'MUL', intPri)).toBe(100);
        expect(computeConfidence('int', null, intPri)).toBe(90);
    });
});
