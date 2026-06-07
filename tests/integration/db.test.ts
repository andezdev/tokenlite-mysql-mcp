import { describe, it, expect } from 'vitest';
import { executeSafeQuery, pool } from '../../src/db/index';
import { getQueryRowLimit } from '../../src/utils/queryLimits';

describe('Database Integration - Security & Limits', () => {
    it('should be able to connect to the database (ping)', async () => {
        const [rows] = await pool.query('SELECT 1 AS ok');
        expect(rows).toBeDefined();
    });

    it('should truncate queries without LIMIT to the configured row limit', async () => {
        const originalThreshold = process.env.MCP_EXPLAIN_MAX_SCAN_ROWS;
        process.env.MCP_EXPLAIN_MAX_SCAN_ROWS = '5000';

        try {
            const result = await executeSafeQuery('SELECT * FROM customers');
            expect(Array.isArray(result.data)).toBe(true);
            expect(result.data.length).toBeLessThanOrEqual(getQueryRowLimit());
        } finally {
            if (originalThreshold) {
                process.env.MCP_EXPLAIN_MAX_SCAN_ROWS = originalThreshold;
            } else {
                delete process.env.MCP_EXPLAIN_MAX_SCAN_ROWS;
            }
        }
    });

    it('should reject INSERT when ALLOW_INSERT_OPERATION is false (default)', async () => {
        delete process.env.ALLOW_INSERT_OPERATION;
        await expect(executeSafeQuery('INSERT INTO test_permissions (id, nombre) VALUES (1, "Test")'))
            .rejects.toThrow(/disabled in the server configuration/);
    });

    it('should allow INSERT through the AST firewall when ALLOW_INSERT_OPERATION is true', async () => {
        process.env.ALLOW_INSERT_OPERATION = 'true';
        const uniqueId = Date.now();

        try {
            await executeSafeQuery(
                `INSERT INTO test_permissions (id, nombre) VALUES (${uniqueId}, 'Test')`
            );
        } catch (error: any) {
            expect(error.message).not.toMatch(/disabled in the server configuration/);
        } finally {
            delete process.env.ALLOW_INSERT_OPERATION;
        }
    });

    it('should reject DROP TABLE when ALLOW_DDL_OPERATION is false (default)', async () => {
        delete process.env.ALLOW_DDL_OPERATION;
        await expect(executeSafeQuery('DROP TABLE test_permissions'))
            .rejects.toThrow(/disabled in the server configuration/);
    });

    it('should reject CALL procedure unconditionally', async () => {
        process.env.ALLOW_INSERT_OPERATION = 'true';
        process.env.ALLOW_DDL_OPERATION = 'true';
        await expect(executeSafeQuery('CALL some_proc()'))
            .rejects.toThrow(/strictly prohibited/);
        delete process.env.ALLOW_INSERT_OPERATION;
        delete process.env.ALLOW_DDL_OPERATION;
    });

    it('should throw a timeout error when a query exceeds MYSQL_QUERY_TIMEOUT', async () => {
        const originalTimeout = process.env.MYSQL_QUERY_TIMEOUT;
        process.env.MYSQL_QUERY_TIMEOUT = '100';

        try {
            await executeSafeQuery('SELECT SLEEP(0.5)');
            expect.unreachable('should have timed out');
        } catch (error: any) {
            expect(error.code).toBe('PROTOCOL_SEQUENCE_TIMEOUT');
            expect(error.message).toMatch(/timeout/i);
        } finally {
            if (originalTimeout) process.env.MYSQL_QUERY_TIMEOUT = originalTimeout;
            else delete process.env.MYSQL_QUERY_TIMEOUT;
        }
    });
});
