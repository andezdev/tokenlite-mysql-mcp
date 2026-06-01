import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { injectLimitAst, analyzeQueryPlan } from './optimizer.js';
import { log } from '../utils/logger.js';

// Supress dotenv logs so they don't corrupt the MCP JSON-RPC stdout stream
(dotenv.config as any)({ quiet: true });

const MAX_RETRY_ATTEMPTS = parseInt(process.env.MYSQL_RETRY_ATTEMPTS || '3', 10);
const RETRY_BASE_DELAY_MS = parseInt(process.env.MYSQL_RETRY_DELAY_MS || '1000', 10);
const QUEUE_LIMIT = parseInt(process.env.MYSQL_QUEUE_LIMIT || '50', 10);

const RETRYABLE_ERRORS = new Set([
    'ECONNREFUSED',
    'PROTOCOL_CONNECTION_LOST',
    'ECONNRESET',
    'ETIMEDOUT',
    'ER_CON_COUNT_ERROR',
]);

export function isRetryableError(error: any): boolean {
    if (RETRYABLE_ERRORS.has(error.code)) return true;
    if (error.message?.includes('Connection lost')) return true;
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'test',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
    queueLimit: QUEUE_LIMIT,
    connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || '10000', 10)
});

pool.pool.on('enqueue', () => {
    log("warning", `All connections busy, request queued (limit: ${QUEUE_LIMIT}).`, "pool");
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
                log("warning", `Failed to set connection to READ ONLY: ${err.message}`, "pool");
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

    const rows = await queryWithRetry({
        sql: astOptimizedSql,
        timeout: parseInt(process.env.MYSQL_QUERY_TIMEOUT || '15000', 10)
    });

    return rows as any[];
}

async function queryWithRetry(opts: { sql: string; timeout?: number }): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            const [rows] = await pool.query(opts);
            return rows;
        } catch (error: any) {
            lastError = error;

            if (!isRetryableError(error)) {
                throw error;
            }

            if (attempt < MAX_RETRY_ATTEMPTS) {
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                log("warning", `Connection error (${error.code}), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})...`, "pool");
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

export async function pingDb(): Promise<boolean> {
    try {
        await queryWithRetry({ sql: 'SELECT 1' });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Gracefully shuts down the MySQL connection pool.
 */
export async function closePool(): Promise<void> {
    try {
        await pool.end();
        log("info", "Database connection pool closed gracefully.", "pool");
    } catch (error: any) {
        log("error", `Error closing database connection pool: ${error.message}`, "pool");
    }
}
