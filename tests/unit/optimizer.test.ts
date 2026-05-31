import { describe, it, expect } from 'vitest';
import { injectLimitAst, OptimizerError } from '../../src/db/optimizer.js';

describe('Safe-Query Optimizer - AST Parser', () => {
    it('should inject LIMIT 500 when no limit is present and return astType select', () => {
        const sql = 'SELECT * FROM users';
        const { sql: optimized, astType } = injectLimitAst(sql);
        expect(optimized.toUpperCase()).toContain('LIMIT 500');
        expect(astType).toBe('select');
    });

    it('should cap existing limits to 500 if they exceed the max', () => {
        const sql = 'SELECT * FROM users LIMIT 1000';
        const { sql: optimized } = injectLimitAst(sql);
        expect(optimized.toUpperCase()).toContain('LIMIT 500');
        expect(optimized.toUpperCase()).not.toContain('LIMIT 1000');
    });

    it('should leave existing safe limits intact', () => {
        const sql = 'SELECT * FROM users LIMIT 10';
        const { sql: optimized } = injectLimitAst(sql);
        expect(optimized.toUpperCase()).toContain('LIMIT 10');
        expect(optimized.toUpperCase()).not.toContain('LIMIT 500');
    });

    it('should not throw for non-SELECT statements but just parse and return the astType', () => {
        const sql = 'UPDATE users SET name = "John"';
        const result = injectLimitAst(sql);
        expect(result.sql).toBe(sql); // original sql
        expect(result.astType).toBe('update');
        
        const deleteSql = 'DELETE FROM users';
        expect(injectLimitAst(deleteSql).astType).toBe('delete');

        const insertSql = "INSERT INTO users (id) VALUES (1)";
        expect(injectLimitAst(insertSql).astType).toBe('insert');
    });

    it('should throw OptimizerError for multiple statements', () => {
        const sql = 'SELECT * FROM users; SELECT * FROM orders;';
        expect(() => injectLimitAst(sql)).toThrow(OptimizerError);
        expect(() => injectLimitAst(sql)).toThrow(/Multiple statements/);
    });

    it('should allow SHOW commands to pass through with astType show', () => {
        const sql = 'SHOW CREATE TABLE users';
        const result = injectLimitAst(sql);
        expect(result.sql).toBe(sql); 
        expect(result.astType).toBe('show');
    });
});
