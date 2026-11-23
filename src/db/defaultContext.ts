// The engine context used by the stdio server: every setting is read from process.env on each access
// (exactly as the pre-engine code did), the pool is the module-level pool from ./index.ts and the schema
// state is the module-level `schemaGraph` binding exported by ./schema.ts.
import type { EngineContext, EngineSettings } from '../engine/context.js';
import type { MetadataSource } from '../engine/metadata.js';
import { log } from '../utils/logger.js';
import { getQueryRowLimit } from '../utils/queryLimits.js';
import { getQueryPlanOptions } from './optimizer.js';
import * as db from './index.js';
import * as md from './metadata.js';
import * as sch from './schema.js';
import { getSqlPolicyOptions } from './sqlPolicy.js';

export const envSettings: EngineSettings = {
    get database() { return process.env.DB_NAME || 'test'; },
    get queryRowLimit() { return getQueryRowLimit(); },
    get queryTimeoutMs() { return parseInt(process.env.MYSQL_QUERY_TIMEOUT || '15000', 10); },
    get retryAttempts() { return parseInt(process.env.MYSQL_RETRY_ATTEMPTS || '3', 10); },
    get retryBaseDelayMs() { return parseInt(process.env.MYSQL_RETRY_DELAY_MS || '1000', 10); },
    get writes() {
        return {
            insert: process.env.ALLOW_INSERT_OPERATION === 'true',
            update: process.env.ALLOW_UPDATE_OPERATION === 'true',
            delete: process.env.ALLOW_DELETE_OPERATION === 'true',
            ddl: process.env.ALLOW_DDL_OPERATION === 'true',
        };
    },
    get queryPlan() {
        const { log: _log, ...plan } = getQueryPlanOptions();
        return plan;
    },
    get policy() { return getSqlPolicyOptions(); },
    get includeViews() { return process.env.MCP_INCLUDE_VIEWS !== 'false'; },
    get ddlCacheTtlMs() { return parseInt(process.env.MCP_DDL_CACHE_TTL || '60', 10) * 1000; },
};

/** Delegates to the module functions of ./metadata.ts (whatever initMetadata() loaded last). */
const envMetadata: MetadataSource = {
    getTableSemantics: (t) => md.getTableSemantics(t),
    getCustomRelationships: () => md.getCustomRelationships(),
    hasTemplatesLoaded: () => md.hasTemplatesLoaded(),
    getTemplateCompletionSuggestions: (v) => md.getTemplateCompletionSuggestions(v),
    searchTemplates: (q) => md.searchTemplates(q),
};

let ctx: EngineContext | undefined;

export function defaultContext(): EngineContext {
    ctx ??= {
        settings: envSettings,
        get pool() { return db.pool; },
        get schema() { return sch.legacySchemaState; },
        metadata: envMetadata,
        log,
        // Tool handlers keep calling the module-level functions, as they did before the engine existed.
        ops: {
            executeSafeQuery: (sql) => db.executeSafeQuery(sql),
            executeExplainQuery: (sql) => db.executeExplainQuery(sql),
            getTableDDL: (name) => sch.getTableDDL(name),
            buildSchemaGraph: () => sch.buildSchemaGraph(),
        },
    };
    return ctx;
}
