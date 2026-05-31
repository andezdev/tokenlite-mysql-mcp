import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { injectLimitAst, analyzeQueryPlan } from './optimizer.js';

// Supress dotenv logs so they don't corrupt the MCP JSON-RPC stdout stream
(dotenv.config as any)({ quiet: true });

export const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'test',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000 // 10 seconds
});

// Session-Level Defense in Depth
const allowInsert = process.env.ALLOW_INSERT_OPERATION === 'true';
const allowUpdate = process.env.ALLOW_UPDATE_OPERATION === 'true';
const allowDelete = process.env.ALLOW_DELETE_OPERATION === 'true';
const allowDdl = process.env.ALLOW_DDL_OPERATION === 'true';

const isStrictReadOnlyMode = !(allowInsert || allowUpdate || allowDelete || allowDdl);

if (isStrictReadOnlyMode) {
    pool.on('connection', (connection: any) => {
        // At runtime this is a callback connection, despite what TS types say
        connection.query('SET SESSION TRANSACTION READ ONLY', (err: any) => {
            if (err) {
                console.error('[tokenlite-mysql-mcp] Warning: Failed to set connection to READ ONLY:', err.message);
            }
        });
    });
}

export function getDbName(): string {
    return process.env.DB_NAME || 'test';
}

/**
 * Executes a safe query with a Timeout and Granular Permissions.
 */
export async function executeSafeQuery(sql: string): Promise<any[]> {
    // AST Validation and Limit Injection
    const { sql: astOptimizedSql, astType } = injectLimitAst(sql);

    // Permission Enforcement
    if (astType !== 'select' && astType !== 'show') {
        const blockedTypes = ['call', 'grant', 'revoke', 'set', 'use'];
        if (blockedTypes.includes(astType)) {
            throw new Error(`Security Error: Dangerous operation '${astType}' is strictly prohibited.`);
        }

        const allowInsert = process.env.ALLOW_INSERT_OPERATION === 'true';
        const allowUpdate = process.env.ALLOW_UPDATE_OPERATION === 'true';
        const allowDelete = process.env.ALLOW_DELETE_OPERATION === 'true';
        const allowDdl = process.env.ALLOW_DDL_OPERATION === 'true';

        let isAllowed = false;
        if ((astType === 'insert' || astType === 'replace') && allowInsert) isAllowed = true;
        else if (astType === 'update' && allowUpdate) isAllowed = true;
        else if ((astType === 'delete' || astType === 'truncate') && allowDelete) isAllowed = true;
        else if (['create', 'alter', 'drop', 'rename'].includes(astType) && allowDdl) isAllowed = true;

        if (!isAllowed) {
            throw new Error(`Security Error: Operation '${astType}' is disabled in the server configuration.`);
        }
    }

    // Pre-flight Analysis (Only blocks full table scans on SELECT)
    if (astType === 'select') {
        await analyzeQueryPlan(astOptimizedSql, pool);
    }

    const [rows] = await pool.query({
        sql: astOptimizedSql,
        timeout: parseInt(process.env.MYSQL_QUERY_TIMEOUT || '15000', 10)
    });
    
    return rows as any[];
}

export async function pingDb(): Promise<boolean> {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (e) {
        return false;
    }
}
