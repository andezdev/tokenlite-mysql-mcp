// Environment-driven wrappers around the engine's optimizer (stdio server). The logic lives in
// ../engine/optimizer.ts and never reads process.env.
import { Pool } from 'mysql2/promise';
import { log } from '../utils/logger.js';
import { getExplainMaxScanRows, getQueryRowLimit } from '../utils/queryLimits.js';
import { type SqlPolicyOptions, getSqlPolicyOptions } from './sqlPolicy.js';
import {
    type ParseSqlResult,
    type QueryPlanOptions,
    analyzeQueryPlan as analyzeQueryPlanCore,
    injectLimitAst as injectLimitAstCore,
    validateExplainSelect as validateExplainSelectCore,
} from '../engine/optimizer.js';

export * from '../engine/optimizer.js';

/** Query-plan options from MCP_SAFE_QUERY_ENABLE_BLOCKING, MCP_EXPLAIN_MAX_SCAN_ROWS and MCP_EXPLAIN_ON_VIEW_ERROR. */
export function getQueryPlanOptions(): QueryPlanOptions {
    return {
        blocking: process.env.MCP_SAFE_QUERY_ENABLE_BLOCKING !== 'false',
        maxScanRows: getExplainMaxScanRows(),
        explainOnViewError: process.env.MCP_EXPLAIN_ON_VIEW_ERROR === 'allow' ? 'allow' : 'deny',
        log,
    };
}

export function injectLimitAst(
    sql: string,
    maxLimit: number = getQueryRowLimit(),
    policy: SqlPolicyOptions = getSqlPolicyOptions(),
): ParseSqlResult {
    return injectLimitAstCore(sql, maxLimit, policy);
}

export function validateExplainSelect(sql: string, maxLimit: number = getQueryRowLimit()): ParseSqlResult {
    return validateExplainSelectCore(sql, maxLimit, getSqlPolicyOptions());
}

export async function analyzeQueryPlan(sql: string, pool: Pool): Promise<void> {
    return analyzeQueryPlanCore(sql, pool, getQueryPlanOptions());
}
