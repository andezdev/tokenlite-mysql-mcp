// Public, transport-agnostic engine: `import { createEngine } from '@andezdev/tokenlite-mysql-mcp/engine'`.
//
// - No side effects on import (no dotenv, no pool, no environment variable reads under src/engine).
// - No dependency on an MCP SDK: handlers return CallToolResult-shaped objects and definitions expose
//   zod shapes, so any MCP server (stdio, Streamable HTTP, any SDK version) can register them.
// - Each engine owns its pool, schema graph, DDL cache and metadata: several engines (e.g. one per
//   database user) can live in the same process without sharing state.
import mysql from 'mysql2/promise';
import { z } from 'zod';
import type { EngineContext, EngineSettings, SchemaState } from './context.js';
import { type LogFn, stderrLog } from './log.js';
import { MetadataStore, type QueryTemplate } from './metadata.js';
import { buildSqlPolicyOptions } from './policy.js';
import * as schema from './schema.js';
import * as tools from './tools.js';
import type { ToolResult, WriteFlags } from './tools.js';

export interface EngineConfig {
    connection: {
        host?: string;
        port?: number;
        user: string;
        password?: string;
        /** The only schema the engine works on (unqualified names resolve here). */
        database: string;
        /** `true` verifies the server certificate; pass an object to relax it. */
        ssl?: boolean | { rejectUnauthorized?: boolean };
        connectionLimit?: number;
        queueLimit?: number;
        connectTimeoutMs?: number;
    };
    /** Max rows per SELECT (AST-injected LIMIT). Default 500. */
    queryRowLimit?: number;
    /** Client-side timeout per statement. Default 15000 ms. */
    queryTimeoutMs?: number;
    retry?: { attempts?: number; baseDelayMs?: number };
    /** Write operations; all disabled by default (connections are then set to READ ONLY). */
    writes?: Partial<WriteFlags>;
    fullScanGate?: {
        /** Default true. */
        enabled?: boolean;
        /** Default 1000. */
        maxScanRows?: number;
        /** Default 'deny'. Use 'allow' for view-only accounts (EXPLAIN on views fails with error 1345). */
        onViewExplainError?: 'allow' | 'deny';
    };
    policy?: {
        /** Extra schemas statements may reference (the database is always allowed). */
        allowedSchemas?: readonly string[];
        /** Default false. */
        allowShow?: boolean;
        denyFunctions?: readonly string[];
    };
    /** Default true. */
    includeViews?: boolean;
    /** Default 60000 ms. */
    ddlCacheTtlMs?: number;
    /** Parsed metadata.json (semantic dictionary and `_relationships`). */
    metadata?: Record<string, unknown>;
    /** Parsed templates.json. */
    templates?: QueryTemplate[];
    /** Default: one line per message on stderr. */
    log?: LogFn;
}

export interface Engine {
    readonly database: string;
    readonly settings: EngineSettings;
    /** Builds the schema graph. Throws if the database is not reachable. */
    init(): Promise<void>;
    searchSchema(args: { query: string }): Promise<ToolResult>;
    executeQuery(args: { sql: string }): Promise<ToolResult>;
    explainQuery(args: { sql: string }): Promise<ToolResult>;
    ping(): Promise<ToolResult>;
    refreshSchema(): Promise<ToolResult>;
    getTableDDL(tableName: string): Promise<string | null>;
    tableNames(): string[];
    templates: {
        loaded(): boolean;
        search(query: string): QueryTemplate[];
        completions(value: string): string[];
    };
    /**
     * Tool definitions without name prefix: description, annotations and input/output schemas as zod
     * objects (Standard Schema), ready for `server.registerTool(name, definition, handler)`.
     */
    definitions: {
        search_schema: ToolDefinition;
        execute_safe_query: ToolDefinition;
        explain_query: ToolDefinition;
        ping: ToolDefinition;
        refresh_schema: ToolDefinition;
    };
    close(): Promise<void>;
}

export interface ToolDefinition {
    description: string;
    inputSchema?: z.ZodObject<z.ZodRawShape>;
    outputSchema?: z.ZodObject<z.ZodRawShape>;
    annotations: Record<string, boolean>;
}

/** Wraps the raw zod shapes used by the stdio server into zod objects. */
function toDefinition(def: { description: string; inputSchema?: z.ZodRawShape; outputSchema?: z.ZodRawShape; annotations: Record<string, boolean> }): ToolDefinition {
    return {
        description: def.description,
        ...(def.inputSchema ? { inputSchema: z.object(def.inputSchema) } : {}),
        ...(def.outputSchema ? { outputSchema: z.object(def.outputSchema) } : {}),
        annotations: def.annotations,
    };
}

function positiveInt(name: string, value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 0) throw new Error(`createEngine: '${name}' must be a non-negative integer`);
    return value;
}

export function createEngine(config: EngineConfig): Engine {
    const c = config.connection;
    if (!c || typeof c.database !== 'string' || !c.database) throw new Error("createEngine: 'connection.database' is required");
    if (typeof c.user !== 'string' || !c.user) throw new Error("createEngine: 'connection.user' is required");

    const log = config.log ?? stderrLog;
    const writes: WriteFlags = {
        insert: config.writes?.insert === true,
        update: config.writes?.update === true,
        delete: config.writes?.delete === true,
        ddl: config.writes?.ddl === true,
    };
    const readOnly = !(writes.insert || writes.update || writes.delete || writes.ddl);

    const settings: EngineSettings = Object.freeze({
        database: c.database,
        queryRowLimit: positiveInt('queryRowLimit', config.queryRowLimit, 500),
        queryTimeoutMs: positiveInt('queryTimeoutMs', config.queryTimeoutMs, 15000),
        retryAttempts: positiveInt('retry.attempts', config.retry?.attempts, 3),
        retryBaseDelayMs: positiveInt('retry.baseDelayMs', config.retry?.baseDelayMs, 1000),
        writes: Object.freeze({ ...writes }),
        queryPlan: Object.freeze({
            blocking: config.fullScanGate?.enabled !== false,
            maxScanRows: positiveInt('fullScanGate.maxScanRows', config.fullScanGate?.maxScanRows, 1000),
            explainOnViewError: config.fullScanGate?.onViewExplainError === 'allow' ? 'allow' as const : 'deny' as const,
        }),
        policy: buildSqlPolicyOptions({
            database: c.database,
            allowedSchemas: config.policy?.allowedSchemas ?? [],
            allowShow: config.policy?.allowShow === true,
            denyFunctions: config.policy?.denyFunctions ?? [],
        }),
        includeViews: config.includeViews !== false,
        ddlCacheTtlMs: positiveInt('ddlCacheTtlMs', config.ddlCacheTtlMs, 60_000),
    });

    const queueLimit = positiveInt('connection.queueLimit', c.queueLimit, 50);
    const pool = mysql.createPool({
        host: c.host ?? 'localhost',
        port: c.port ?? 3306,
        user: c.user,
        password: c.password ?? '',
        database: c.database,
        waitForConnections: true,
        connectionLimit: positiveInt('connection.connectionLimit', c.connectionLimit, 10),
        queueLimit,
        connectTimeout: positiveInt('connection.connectTimeoutMs', c.connectTimeoutMs, 10000),
        multipleStatements: false,
        ssl: c.ssl === undefined || c.ssl === false
            ? undefined
            : { rejectUnauthorized: c.ssl === true ? true : c.ssl.rejectUnauthorized !== false },
    });
    pool.pool.on('enqueue', () => {
        log("warning", `All connections busy, request queued (limit: ${queueLimit}).`, "pool");
    });
    if (readOnly) {
        // Session-level defence in depth, as in the stdio server.
        pool.on('connection', (connection: any) => {
            connection.query('SET SESSION TRANSACTION READ ONLY', (err: any) => {
                if (err) log("warning", `Failed to set connection to READ ONLY: ${err.message}`, "pool");
            });
        });
    }

    const state: SchemaState = { graph: new Map(), ddlCache: new Map() };
    const metadata = new MetadataStore(
        (config.metadata ?? {}) as Record<string, any>,
        config.templates ?? [],
    );
    const ctx: EngineContext = { settings, pool, schema: state, metadata, log };

    return {
        database: c.database,
        settings,
        init: () => schema.buildSchemaGraph(ctx),
        searchSchema: (args) => tools.searchSchema(ctx, args),
        executeQuery: (args) => tools.executeQuery(ctx, args),
        explainQuery: (args) => tools.explainQuery(ctx, args),
        ping: () => tools.ping(ctx),
        refreshSchema: () => tools.refreshSchema(ctx),
        getTableDDL: (name) => schema.getTableDDL(ctx, name),
        tableNames: () => Array.from(state.graph.keys()),
        templates: {
            loaded: () => metadata.hasTemplatesLoaded(),
            search: (q) => metadata.searchTemplates(q),
            completions: (v) => metadata.getTemplateCompletionSuggestions(v),
        },
        definitions: {
            search_schema: toDefinition(tools.searchSchemaDefinition()),
            execute_safe_query: toDefinition(tools.executeQueryDefinition(writes)),
            explain_query: toDefinition(tools.explainQueryDefinition()),
            ping: toDefinition(tools.pingDefinition()),
            refresh_schema: toDefinition(tools.refreshSchemaDefinition()),
        },
        close: () => pool.end(),
    };
}

export type { EngineSettings } from './context.js';
export type { LogFn, LogLevel } from './log.js';
export type { QueryTemplate } from './metadata.js';
export type { ToolResult, TextContent, WriteFlags } from './tools.js';
export { OptimizerError } from './optimizer.js';
export { SqlPolicyError, DEFAULT_DENIED_FUNCTIONS, SYSTEM_SCHEMAS } from './policy.js';
export { explainOutputSchema, pingOutputSchema, searchSchemaInputSchema } from './tools.js';
