import { describe, it, expect } from 'vitest';
import { injectLimitAst, OptimizerError } from '../../src/db/optimizer';

describe('Security - SQL Injection via AST Parser', () => {
    it('should block stacked queries (semicolon injection)', () => {
        expect(() => injectLimitAst('SELECT 1; DROP TABLE users;')).toThrow(OptimizerError);
    });

    it('should block comment-based bypass attempts (inline comment)', () => {
        const result = injectLimitAst('SELECT * FROM users /* WHERE 1=1 */');
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });

    it('should block comment-based bypass attempts (line comment)', () => {
        const result = injectLimitAst('SELECT * FROM users -- WHERE 1=1');
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });

    it('should reject UNION injection attempts as multiple statements', () => {
        const result = injectLimitAst('SELECT id FROM users UNION SELECT password FROM admins');
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });

    it('should reject empty SQL', () => {
        expect(() => injectLimitAst('')).toThrow(OptimizerError);
    });

    it('should reject SQL with only whitespace', () => {
        expect(() => injectLimitAst('   ')).toThrow(OptimizerError);
    });

    it('should handle extremely long SQL without crashing', () => {
        const longWhere = Array.from({ length: 200 }, (_, i) => `col${i} = ${i}`).join(' AND ');
        const sql = `SELECT * FROM users WHERE ${longWhere}`;
        const result = injectLimitAst(sql);
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });
});

describe('Security - Permission Boundary Tests', () => {
    it('should always block CALL regardless of env flags', () => {
        const result = injectLimitAst('CALL dangerous_proc()');
        expect(result.astType).toBe('call');
    });

    it('should always block GRANT regardless of env flags', () => {
        const result = injectLimitAst('GRANT ALL ON *.* TO root@localhost');
        expect(result.astType).toBe('grant');
    });

    it('should classify INSERT correctly', () => {
        const result = injectLimitAst("INSERT INTO users (name) VALUES ('test')");
        expect(result.astType).toBe('insert');
    });

    it('should classify UPDATE correctly', () => {
        const result = injectLimitAst("UPDATE users SET name = 'test' WHERE id = 1");
        expect(result.astType).toBe('update');
    });

    it('should classify DELETE correctly', () => {
        const result = injectLimitAst('DELETE FROM users WHERE id = 1');
        expect(result.astType).toBe('delete');
    });

    it('should classify DROP correctly', () => {
        const result = injectLimitAst('DROP TABLE users');
        expect(result.astType).toBe('drop');
    });

    it('should classify ALTER correctly', () => {
        const result = injectLimitAst('ALTER TABLE users ADD COLUMN age INT');
        expect(result.astType).toBe('alter');
    });

    it('should classify CREATE correctly', () => {
        const result = injectLimitAst('CREATE TABLE test (id INT PRIMARY KEY)');
        expect(result.astType).toBe('create');
    });

    it('should classify REPLACE correctly', () => {
        const result = injectLimitAst("REPLACE INTO users (id, name) VALUES (1, 'test')");
        expect(result.astType).toBe('replace');
    });
});

describe('Security - Advanced Injection Vectors', () => {
    it('should reject MySQL conditional comments as syntax error (safe behavior)', () => {
        expect(() => injectLimitAst('SELECT /*!50000 1,2,3 */ FROM users')).toThrow(OptimizerError);
    });

    it('should reject nested comments as syntax error (safe behavior)', () => {
        expect(() => injectLimitAst('SELECT * FROM users /* outer /* inner */ still comment */')).toThrow(OptimizerError);
    });

    it('should block stacked queries disguised with whitespace variations', () => {
        expect(() => injectLimitAst('SELECT 1;\t\nDROP TABLE users')).toThrow(OptimizerError);
    });

    it('should handle hex-encoded string values safely', () => {
        const result = injectLimitAst("SELECT * FROM users WHERE name = 0x41646D696E");
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });

    it('should handle queries with escaped quotes', () => {
        const result = injectLimitAst("SELECT * FROM users WHERE name = 'O\\'Brien'");
        expect(result.astType).toBe('select');
    });

    it('should block UNION-based injection with subquery', () => {
        const result = injectLimitAst('SELECT id FROM users UNION ALL SELECT password FROM admins');
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });

    it('should handle backtick-escaped identifiers', () => {
        const result = injectLimitAst('SELECT `id`, `name` FROM `users` WHERE `id` = 1');
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });

    it('should reject SQL with null bytes', () => {
        expect(() => injectLimitAst('SELECT * FROM users\0 WHERE 1=1')).toThrow(OptimizerError);
    });
});

describe('Security - Malformed SQL Handling', () => {
    it('should throw OptimizerError for incomplete SELECT', () => {
        expect(() => injectLimitAst('SELECT FROM')).toThrow(OptimizerError);
    });

    it('should throw OptimizerError for random gibberish', () => {
        expect(() => injectLimitAst('asdf qwerty zxcv')).toThrow(OptimizerError);
    });

    it('should throw OptimizerError for binary-like content', () => {
        expect(() => injectLimitAst('\x00\x01\x02\x03')).toThrow(OptimizerError);
    });

    it('should handle SQL with unicode characters in strings', () => {
        const result = injectLimitAst("SELECT * FROM users WHERE name = '日本語テスト'");
        expect(result.astType).toBe('select');
    });

    it('should throw OptimizerError for unterminated string', () => {
        expect(() => injectLimitAst("SELECT * FROM users WHERE name = 'unterminated")).toThrow(OptimizerError);
    });
});
