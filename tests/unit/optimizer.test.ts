import { describe, it, expect } from 'vitest';
import { injectLimitAst, OptimizerError } from '../../src/db/optimizer.js';

describe('Safe-Query Optimizer - AST Parser', () => {
    it('should inject LIMIT 500 when no limit is present', () => {
        const sql = 'SELECT * FROM users';
        const optimized = injectLimitAst(sql);
        // The parser might add backticks or format differently, but it must contain LIMIT 500
        expect(optimized.toUpperCase()).toContain('LIMIT 500');
    });

    it('should cap existing limits to 500 if they exceed the max', () => {
        const sql = 'SELECT * FROM users LIMIT 1000';
        const optimized = injectLimitAst(sql);
        expect(optimized.toUpperCase()).toContain('LIMIT 500');
        expect(optimized.toUpperCase()).not.toContain('LIMIT 1000');
    });

    it('should leave existing safe limits intact', () => {
        const sql = 'SELECT * FROM users LIMIT 10';
        const optimized = injectLimitAst(sql);
        expect(optimized.toUpperCase()).toContain('LIMIT 10');
        expect(optimized.toUpperCase()).not.toContain('LIMIT 500');
    });

    it('should throw OptimizerError for non-SELECT statements', () => {
        const sql = 'UPDATE users SET name = "John"';
        expect(() => injectLimitAst(sql)).toThrow(OptimizerError);
        expect(() => injectLimitAst(sql)).toThrow(/Only SELECT or SHOW/);
    });

    it('should throw OptimizerError for multiple statements', () => {
        const sql = 'SELECT * FROM users; SELECT * FROM orders;';
        expect(() => injectLimitAst(sql)).toThrow(OptimizerError);
        expect(() => injectLimitAst(sql)).toThrow(/Multiple statements/);
    });

    it('should allow SHOW commands to pass through without parsing', () => {
        const sql = 'SHOW CREATE TABLE users';
        const optimized = injectLimitAst(sql);
        expect(optimized).toBe(sql); // Exact match
    });
});
