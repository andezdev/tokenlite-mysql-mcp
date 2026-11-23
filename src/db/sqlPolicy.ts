// Environment-driven wrapper around the engine's SQL policy (stdio server). The policy itself lives in
// ../engine/policy.ts and never reads process.env.
import {
    type SqlPolicyOptions,
    buildSqlPolicyOptions,
    enforceSqlPolicy as enforceSqlPolicyCore,
} from '../engine/policy.js';

export * from '../engine/policy.js';

function parseList(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
}

/** Policy options from DB_NAME, MCP_ALLOWED_SCHEMAS, MCP_ALLOW_SHOW and MCP_DENY_FUNCTIONS. */
export function getSqlPolicyOptions(): SqlPolicyOptions {
    return buildSqlPolicyOptions({
        database: process.env.DB_NAME || 'test',
        allowedSchemas: parseList(process.env.MCP_ALLOWED_SCHEMAS),
        allowShow: process.env.MCP_ALLOW_SHOW === 'true',
        denyFunctions: parseList(process.env.MCP_DENY_FUNCTIONS),
    });
}

export function enforceSqlPolicy(sql: string, ast: unknown, opts: SqlPolicyOptions = getSqlPolicyOptions()): void {
    enforceSqlPolicyCore(sql, ast, opts);
}
