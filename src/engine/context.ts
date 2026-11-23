import type { Pool } from 'mysql2/promise';
import type { LogFn } from './log.js';
import type { MetadataSource } from './metadata.js';
import type { QueryPlanOptions } from './optimizer.js';
import type { SqlPolicyOptions } from './policy.js';
import type { TableNode } from './types.js';

/** Result of executeSafeQuery. */
export interface SafeQueryResult {
    data: any;
    appliedLimit?: number;
    truncated?: boolean;
}

/** Values the engine reads while serving a call. The engine never reads environment variables itself. */
export interface EngineSettings {
    /** Schema the engine works on (unqualified names resolve here). */
    readonly database: string;
    /** Max rows returned by a SELECT (AST-injected LIMIT). */
    readonly queryRowLimit: number;
    /** Client-side timeout for each statement, in ms. */
    readonly queryTimeoutMs: number;
    readonly retryAttempts: number;
    readonly retryBaseDelayMs: number;
    readonly writes: { readonly insert: boolean; readonly update: boolean; readonly delete: boolean; readonly ddl: boolean };
    readonly queryPlan: Omit<QueryPlanOptions, 'log'>;
    readonly policy: SqlPolicyOptions;
    /** Index views alongside base tables. */
    readonly includeViews: boolean;
    readonly ddlCacheTtlMs: number;
}

export interface DdlCacheEntry {
    ddl: string | null;
    expiresAt: number;
}

/** Mutable schema state of one engine: the relationship graph and the DDL cache. */
export interface SchemaState {
    graph: Map<string, TableNode>;
    readonly ddlCache: Map<string, DdlCacheEntry>;
}

/**
 * Overrides for the operations the tool handlers call. Only the stdio server sets them, to keep routing
 * through its module-level functions (as before the engine existed); engines from createEngine() don't.
 */
export interface EngineOperations {
    executeSafeQuery(sql: string): Promise<SafeQueryResult>;
    executeExplainQuery(sql: string): Promise<any[]>;
    getTableDDL(tableName: string): Promise<string | null>;
    buildSchemaGraph(): Promise<void>;
}

/** Everything the engine functions need. One context per engine (per database user / profile). */
export interface EngineContext {
    readonly settings: EngineSettings;
    readonly pool: Pool;
    readonly schema: SchemaState;
    readonly metadata: MetadataSource;
    readonly log: LogFn;
    readonly ops?: EngineOperations;
}
