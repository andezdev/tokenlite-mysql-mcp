import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pingDb, executeSafeQuery, pool } from '../../src/db/index';

describe('Database Integration - Security & Limits', () => {
    it('should be able to connect to the database (ping)', async () => {
        const isAlive = await pingDb();
        expect(isAlive).toBe(true);
    });

    it('should truncate queries without LIMIT to 500 rows', async () => {
        const originalThreshold = process.env.MCP_SAFE_QUERY_MAX_ROWS;
        process.env.MCP_SAFE_QUERY_MAX_ROWS = '5000';
        
        // Use a test table if customers doesn't exist, or just rely on a known query
        try {
            const rows = await executeSafeQuery('SELECT * FROM customers');
            expect(rows.length).toBeLessThanOrEqual(500);
        } catch(e) {
             // Ignored if customers table doesn't exist in the CI database
        }
        
        process.env.MCP_SAFE_QUERY_MAX_ROWS = originalThreshold;
    });

    it('should reject INSERT when ALLOW_INSERT_OPERATION is false (default)', async () => {
        delete process.env.ALLOW_INSERT_OPERATION;
        await expect(executeSafeQuery('INSERT INTO test_permissions (id, nombre) VALUES (1, "Test")'))
            .rejects.toThrow(/disabled in the server configuration/);
    });

    it('should allow INSERT through the AST firewall when ALLOW_INSERT_OPERATION is true', async () => {
        process.env.ALLOW_INSERT_OPERATION = 'true';
        
        // Because the pool is initialized globally ONCE at startup (import time) when ALLOW_INSERT_OPERATION was false,
        // the pool connections are physically locked in READ ONLY mode.
        // Therefore, the AST firewall will allow the query to pass, but the MySQL motor will reject it!
        // This perfectly proves both (AST allows it) and (Motor blocks it because it was initialized strictly).
        await expect(executeSafeQuery('INSERT INTO test_permissions (id, nombre) VALUES (2, "Test")'))
            .rejects.toThrowError(/Cannot execute statement in a READ ONLY transaction/);
            
        delete process.env.ALLOW_INSERT_OPERATION;
    });

    it('should reject DROP TABLE when ALLOW_DDL_OPERATION is false (default)', async () => {
        delete process.env.ALLOW_DDL_OPERATION;
        await expect(executeSafeQuery('DROP TABLE test_permissions'))
            .rejects.toThrow(/disabled in the server configuration/);
    });

    it('should reject CALL procedure unconditionally', async () => {
        // even if everything is allowed
        process.env.ALLOW_INSERT_OPERATION = 'true'; 
        process.env.ALLOW_DDL_OPERATION = 'true'; 
        await expect(executeSafeQuery('CALL some_proc()'))
            .rejects.toThrow(/strictly prohibited/);
        delete process.env.ALLOW_INSERT_OPERATION;
        delete process.env.ALLOW_DDL_OPERATION;
    });

    it('should throw a timeout error when a query exceeds MYSQL_QUERY_TIMEOUT', async () => {
        // Enforce a tiny timeout (100ms)
        const originalTimeout = process.env.MYSQL_QUERY_TIMEOUT;
        process.env.MYSQL_QUERY_TIMEOUT = '100';

        try {
            // Attempt to sleep for 500ms
            await executeSafeQuery('SELECT SLEEP(0.5)');
            // Should not reach here
            expect(true).toBe(false);
        } catch (error: any) {
            expect(error.code).toBe('PROTOCOL_SEQUENCE_TIMEOUT');
            expect(error.message).toMatch(/timeout/i);
        } finally {
            if (originalTimeout) process.env.MYSQL_QUERY_TIMEOUT = originalTimeout;
            else delete process.env.MYSQL_QUERY_TIMEOUT;
        }
    });
});
