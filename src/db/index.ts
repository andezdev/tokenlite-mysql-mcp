import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { log } from '../utils/logger.js';
import {
    executeExplainQuery as executeExplainQueryCore,
    executeSafeQuery as executeSafeQueryCore,
    type SafeQueryResult,
} from '../engine/query.js';
import { defaultContext } from './defaultContext.js';

export { isRetryableError, type SafeQueryResult } from '../engine/query.js';

// Supress dotenv logs so they don't corrupt the MCP JSON-RPC stdout stream
(dotenv.config as any)({ quiet: true });

const QUEUE_LIMIT = parseInt(process.env.MYSQL_QUEUE_LIMIT || '50', 10);

function buildSslConfig(): mysql.SslOptions | undefined {
    if (process.env.DB_SSL !== 'true') {
        return undefined;
    }

    return {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
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
    connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || '10000', 10),
    multipleStatements: false,
    ssl: buildSslConfig(),
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
export function executeSafeQuery(sql: string): Promise<SafeQueryResult> {
    return executeSafeQueryCore(defaultContext(), sql);
}

/**
 * Runs EXPLAIN on a validated SELECT query with timeout protection.
 */
export function executeExplainQuery(sql: string): Promise<any[]> {
    return executeExplainQueryCore(defaultContext(), sql);
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
