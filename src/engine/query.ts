import type { EngineContext, SafeQueryResult } from './context.js';

export type { SafeQueryResult };
import { analyzeQueryPlan, assertWriteScope, injectLimitAst, validateExplainSelect } from './optimizer.js';

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

export async function queryWithRetry(ctx: EngineContext, opts: { sql: string; timeout?: number }): Promise<any> {
    let lastError: Error | undefined;
    const maxAttempts = ctx.settings.retryAttempts;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        try {
            const [rows] = await ctx.pool.query(opts);
            return rows;
        } catch (error: any) {
            lastError = error;

            if (!isRetryableError(error)) {
                throw error;
            }

            if (attempt < maxAttempts) {
                const delay = ctx.settings.retryBaseDelayMs * Math.pow(2, attempt);
                ctx.log("warning", `Connection error (${error.code}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})...`, "pool");
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

/**
 * Executes a safe query with a Timeout and Granular Permissions.
 */
export async function executeSafeQuery(ctx: EngineContext, sql: string): Promise<SafeQueryResult> {
    const settings = ctx.settings;
    const { sql: astOptimizedSql, astType, appliedLimit, hasWhere } = injectLimitAst(sql, settings.queryRowLimit, settings.policy);

    if (astType !== 'select' && astType !== 'show') {
        const blockedTypes = ['call', 'grant', 'revoke', 'set', 'use'];
        if (blockedTypes.includes(astType)) {
            throw new Error(`Security Error: Dangerous operation '${astType}' is strictly prohibited.`);
        }

        const { insert: allowInsert, update: allowUpdate, delete: allowDelete, ddl: allowDdl } = settings.writes;

        let isAllowed = false;
        if ((astType === 'insert' || astType === 'replace') && allowInsert) isAllowed = true;
        else if (astType === 'update' && allowUpdate) isAllowed = true;
        else if ((astType === 'delete' || astType === 'truncate') && allowDelete) isAllowed = true;
        else if (['create', 'alter', 'drop', 'rename'].includes(astType) && allowDdl) isAllowed = true;

        if (!isAllowed) {
            throw new Error(`Security Error: Operation '${astType}' is disabled in the server configuration.`);
        }

        assertWriteScope(astType, hasWhere);
    }

    if (astType === 'select') {
        await analyzeQueryPlan(astOptimizedSql, ctx.pool, { ...settings.queryPlan, log: ctx.log });
    }

    const rows = await queryWithRetry(ctx, {
        sql: astOptimizedSql,
        timeout: settings.queryTimeoutMs,
    });

    if (astType === 'select' && Array.isArray(rows)) {
        const limit = appliedLimit ?? settings.queryRowLimit;
        return {
            data: rows,
            appliedLimit: limit,
            truncated: rows.length >= limit,
        };
    }

    return { data: rows };
}

/**
 * Runs EXPLAIN on a validated SELECT query with timeout protection.
 */
export async function executeExplainQuery(ctx: EngineContext, sql: string): Promise<any[]> {
    const { sql: validatedSql } = validateExplainSelect(sql, ctx.settings.queryRowLimit, ctx.settings.policy);
    const rows = await queryWithRetry(ctx, {
        sql: `EXPLAIN ${validatedSql}`,
        timeout: ctx.settings.queryTimeoutMs,
    });
    return rows as any[];
}
