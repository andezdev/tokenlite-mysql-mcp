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

export function getDbName(): string {
    return process.env.DB_NAME || 'test';
}

/**
 * Executes a safe query with a Timeout.
 */
export async function executeSafeQuery(sql: string): Promise<any[]> {
    // AST Validation and Limit Injection
    const astOptimizedSql = injectLimitAst(sql);

    // Pre-flight Analysis
    await analyzeQueryPlan(astOptimizedSql, pool);

    const [rows] = await pool.query({
        sql: astOptimizedSql,
        timeout: 15000
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
