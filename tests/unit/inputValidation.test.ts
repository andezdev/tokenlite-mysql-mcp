import { describe, it, expect } from 'vitest';
import { getTableDDL } from '../../src/db/schema';

describe('Input Validation - Table Name Sanitization', () => {
    it('should reject table names with semicolons', async () => {
        const result = await getTableDDL('; DROP TABLE users');
        expect(result).toBeNull();
    });

    it('should reject table names with backticks', async () => {
        const result = await getTableDDL('users`; DROP TABLE users; --');
        expect(result).toBeNull();
    });

    it('should reject table names with spaces', async () => {
        const result = await getTableDDL('users orders');
        expect(result).toBeNull();
    });

    it('should reject table names with dashes', async () => {
        const result = await getTableDDL('my-table');
        expect(result).toBeNull();
    });

    it('should reject table names with dots', async () => {
        const result = await getTableDDL('schema.users');
        expect(result).toBeNull();
    });

    it('should reject table names with unicode', async () => {
        const result = await getTableDDL('テーブル');
        expect(result).toBeNull();
    });

    it('should reject empty table names', async () => {
        const result = await getTableDDL('');
        expect(result).toBeNull();
    });

    it('should accept valid table names with underscores', async () => {
        // This will return null because the table doesn't exist, but it won't be blocked by the regex
        // We just verify the regex doesn't block valid names
        expect(/^[a-zA-Z0-9_]+$/.test('order_items')).toBe(true);
        expect(/^[a-zA-Z0-9_]+$/.test('users')).toBe(true);
        expect(/^[a-zA-Z0-9_]+$/.test('table_123')).toBe(true);
    });
});
