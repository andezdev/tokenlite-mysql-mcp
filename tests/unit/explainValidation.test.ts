import { describe, it, expect } from 'vitest';
import { validateExplainSelect, assertWriteScope, OptimizerError } from '../../src/db/optimizer.js';

describe('validateExplainSelect', () => {
    it('should allow valid SELECT queries', () => {
        const result = validateExplainSelect('SELECT id FROM users WHERE id = 1');
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });

    it('should block ANALYZE statements', () => {
        expect(() => validateExplainSelect('ANALYZE SELECT * FROM users'))
            .toThrow(OptimizerError);
        expect(() => validateExplainSelect('ANALYZE SELECT * FROM users'))
            .toThrow(/ANALYZE is not allowed/);
    });

    it('should block non-SELECT statements', () => {
        expect(() => validateExplainSelect('DELETE FROM users WHERE id = 1'))
            .toThrow(/Only SELECT queries can be explained/);
    });
});

describe('assertWriteScope', () => {
    it('should reject UPDATE without WHERE', () => {
        expect(() => assertWriteScope('update', false))
            .toThrow(/UPDATE without a WHERE clause is not allowed/);
    });

    it('should reject DELETE without WHERE', () => {
        expect(() => assertWriteScope('delete', false))
            .toThrow(/DELETE without a WHERE clause is not allowed/);
    });

    it('should allow UPDATE with WHERE', () => {
        expect(() => assertWriteScope('update', true)).not.toThrow();
    });
});
