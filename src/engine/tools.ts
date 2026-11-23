// Tool logic and tool definitions, independent of any MCP SDK version.
//
// Handlers return CallToolResult-shaped objects; definitions expose zod shapes (zod 4 objects are also
// Standard Schemas), so both the stdio server (SDK v1) and an HTTP server on a newer SDK can register
// them without conversion. The stdio server registers them in ../tools/*.ts.
import Fuse from 'fuse.js';
import { z } from 'zod';
import { jsonToCsv } from '../utils/csvFormatter.js';
import { sanitizeDatabaseError } from '../utils/errorSanitizer.js';
import type { EngineContext } from './context.js';
import { OptimizerError } from './optimizer.js';
import * as query from './query.js';
import * as schema from './schema.js';

const runSafeQuery = (ctx: EngineContext, sql: string) => ctx.ops ? ctx.ops.executeSafeQuery(sql) : query.executeSafeQuery(ctx, sql);
const runExplain = (ctx: EngineContext, sql: string) => ctx.ops ? ctx.ops.executeExplainQuery(sql) : query.executeExplainQuery(ctx, sql);
const tableDDL = (ctx: EngineContext, name: string) => ctx.ops ? ctx.ops.getTableDDL(name) : schema.getTableDDL(ctx, name);
const rebuildGraph = (ctx: EngineContext) => ctx.ops ? ctx.ops.buildSchemaGraph() : schema.buildSchemaGraph(ctx);

export interface TextContent {
    type: 'text';
    text: string;
    annotations?: { audience?: ('user' | 'assistant')[]; priority?: number };
}
/** MCP CallToolResult (structurally compatible with the SDKs' type). */
export interface ToolResult {
    [key: string]: unknown;
    content: TextContent[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}

/** Optional hooks around a tool call (e.g. the stdio server's per-process rate limiter). */
export interface ToolHooks {
    /** Runs at the start of the call, at the same point and with the same error handling as before. */
    beforeRun?: () => void;
}

export const SEARCH_SCHEMA_CONTENT_ANNOTATIONS = { audience: ["assistant" as const], priority: 0.9 };
export const EXECUTE_QUERY_CONTENT_ANNOTATIONS = { audience: ["user" as const, "assistant" as const], priority: 0.7 };
export const EXPLAIN_QUERY_CONTENT_ANNOTATIONS = { audience: ["assistant" as const], priority: 0.5 };
export const PING_CONTENT_ANNOTATIONS = { audience: ["user" as const], priority: 0.3 };
export const REFRESH_SCHEMA_CONTENT_ANNOTATIONS = { audience: ["assistant" as const], priority: 0.2 };

// ---------------------------------------------------------------------------------------------------
// search_schema

export async function searchSchema(ctx: EngineContext, { query }: { query: string }, hooks: ToolHooks = {}): Promise<ToolResult> {
    hooks.beforeRun?.();

    const schemaGraph = ctx.schema.graph;
    if (schemaGraph.size === 0) {
        return {
            content: [{ type: "text" as const, text: "Schema Graph is empty. Make sure the database is connected." }],
            isError: true
        };
    }

    // Search for the table
    const tableNodes = Array.from(schemaGraph.values());
    const fuse = new Fuse(tableNodes, {
        keys: ["name"],
        threshold: 0.4 // somewhat fuzzy
    });

    const results = fuse.search(query);
    if (results.length === 0) {
        return {
            content: [{ type: "text" as const, text: `No table found matching '${query}'. Use refresh_schema() if you believe it was recently added.` }],
            isError: true
        };
    }

    const targetTable = results[0].item;

    // Traversal: Find Parent tables (the tables targetTable points to)
    const parentTableNames = new Set<string>();
    const inferredHints: string[] = [];

    for (const fk of targetTable.foreignKeys) {
        parentTableNames.add(fk.referencedTable);
        if (fk.isHeuristic) {
            const conf = fk.confidence != null ? ` (confidence: ${fk.confidence})` : '';
            inferredHints.push(`/* INFERRED PARENT${conf}: \`${targetTable.name}\`.\`${fk.columnName}\` -> \`${fk.referencedTable}\`.\`${fk.referencedColumn}\` */`);
        }
    }

    // Traversal: Find Child tables (tables that point to targetTable)
    const childTableNames = new Set<string>();
    for (const node of tableNodes) {
        for (const fk of node.foreignKeys) {
            if (fk.referencedTable === targetTable.name) {
                childTableNames.add(node.name);
                if (fk.isHeuristic) {
                    const conf = fk.confidence != null ? ` (confidence: ${fk.confidence})` : '';
                    inferredHints.push(`/* INFERRED CHILD${conf}: \`${node.name}\`.\`${fk.columnName}\` -> \`${targetTable.name}\`.\`${fk.referencedColumn}\` */`);
                }
            }
        }
    }

    // Fetch DDLs dynamically
    const tablesToFetch = [targetTable.name, ...parentTableNames, ...childTableNames];
    const ddls: string[] = [];

    for (const tableName of tablesToFetch) {
        const ddl = await tableDDL(ctx, tableName);
        if (ddl) {
            let header = tableName === targetTable.name
                ? `-- === MATCHED TABLE ===\n`
                : `-- === RELATED TABLE ===\n`;

            let tableStr = header + ddl + ";\n";

            // Append Semantics
            const semantics = ctx.metadata.getTableSemantics(tableName);
            if (Object.keys(semantics).length > 0) {
                tableStr += `/* SEMANTIC DICTIONARY:\n`;
                tableStr += JSON.stringify(semantics);
                tableStr += `\n*/\n`;
            }

            ddls.push(tableStr);
        }
    }

    let output = ddls.join("\n");

    if (inferredHints.length > 0) {
        output += "\n-- === HEURISTIC GRAPH HINTS ===\n" + inferredHints.join("\n");
    }

    if (ctx.metadata.hasTemplatesLoaded()) {
        output += "\n\n/* ⚠️ CRITICAL REMINDER: If you are asked to calculate business metrics (LTV, revenue, etc.), DO NOT write the SQL manually. You MUST use the `query_templates` prompt first to fetch the official template. */";
    }

    return {
        content: [{ type: "text" as const, text: output, annotations: SEARCH_SCHEMA_CONTENT_ANNOTATIONS }]
    };
}

// ---------------------------------------------------------------------------------------------------
// execute_safe_query

export async function executeQuery(ctx: EngineContext, { sql }: { sql: string }, hooks: ToolHooks = {}): Promise<ToolResult> {
    try {
        hooks.beforeRun?.();
        const result = await runSafeQuery(ctx, sql);

        if (Array.isArray(result.data)) {
            const csvData = jsonToCsv(result.data, {
                truncated: result.truncated,
                limit: result.appliedLimit,
            });
            return {
                content: [{ type: "text" as const, text: csvData, annotations: EXECUTE_QUERY_CONTENT_ANNOTATIONS }]
            };
        }

        const header = result.data as any;
        const message = `Operation executed successfully.\nAffected rows: ${header.affectedRows || 0}` +
                        (header.insertId ? `\nInsert ID: ${header.insertId}` : '') +
                        (header.changedRows ? `\nChanged rows: ${header.changedRows}` : '');
        return {
            content: [{ type: "text" as const, text: message, annotations: EXECUTE_QUERY_CONTENT_ANNOTATIONS }]
        };
    } catch (error: any) {
        let errorMessage = sanitizeDatabaseError(error);

        if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('Unknown column')) {
            errorMessage += `\n\nHint: If you believe this column exists, the DBA might have just added it. Please call the 'refresh_schema' tool and try again.`;
        } else if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || error.message?.includes('timeout')) {
            errorMessage += `\n\nHint: The query took too long and was aborted to protect the database (DoS protection). Please optimize your query by using better filters, utilizing indexes, or ask the user to increase the MYSQL_QUERY_TIMEOUT.`;
        }

        return {
            content: [{ type: "text" as const, text: errorMessage }],
            isError: true
        };
    }
}

// ---------------------------------------------------------------------------------------------------
// explain_query

export async function explainQuery(ctx: EngineContext, { sql }: { sql: string }, hooks: ToolHooks = {}): Promise<ToolResult> {
    try {
        hooks.beforeRun?.();
        const rows = await runExplain(ctx, sql);
        const csv = jsonToCsv(rows as Record<string, any>[]);
        return {
            content: [{ type: "text" as const, text: csv, annotations: EXPLAIN_QUERY_CONTENT_ANNOTATIONS }],
            structuredContent: { rows } as unknown as Record<string, unknown>,
        };
    } catch (error: any) {
        const message = error instanceof OptimizerError
            ? error.message
            : `EXPLAIN Error: ${sanitizeDatabaseError(error)}`;
        return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
        };
    }
}

// ---------------------------------------------------------------------------------------------------
// ping

interface PingResponse {
    status: "ok" | "error";
    server_version?: string;
    pool: {
        active: number;
        idle: number;
        queue: number;
    };
    error?: string;
}

export async function ping(ctx: EngineContext): Promise<ToolResult> {
    const rawPool = (ctx.pool as any).pool as any;
    const poolInfo = {
        active: rawPool._allConnections?.length ?? 0,
        idle: rawPool._freeConnections?.length ?? 0,
        queue: rawPool._connectionQueue?.length ?? 0,
    };

    try {
        const [rows] = await ctx.pool.query<any[]>("SELECT VERSION() AS version");
        const response: PingResponse = {
            status: "ok",
            server_version: rows[0]?.version,
            pool: poolInfo,
        };
        return {
            content: [{ type: "text" as const, text: JSON.stringify(response, null, 2), annotations: PING_CONTENT_ANNOTATIONS }],
            structuredContent: response as unknown as Record<string, unknown>,
        };
    } catch (error: any) {
        const response: PingResponse = {
            status: "error",
            pool: poolInfo,
            error: error.message,
        };
        return {
            content: [{ type: "text" as const, text: JSON.stringify(response, null, 2), annotations: PING_CONTENT_ANNOTATIONS }],
            structuredContent: response as unknown as Record<string, unknown>,
            isError: true,
        };
    }
}

// ---------------------------------------------------------------------------------------------------
// refresh_schema

/** Rebuilds the graph. `afterRebuild` runs only on success (the stdio server notifies resource subscribers). */
export async function refreshSchema(ctx: EngineContext, afterRebuild?: () => Promise<void>): Promise<ToolResult> {
    try {
        await rebuildGraph(ctx);
        await afterRebuild?.();
        return {
            content: [{ type: "text" as const, text: "Schema Graph rebuilt successfully. You can now use search_schema to explore the updated relationships.", annotations: REFRESH_SCHEMA_CONTENT_ANNOTATIONS }]
        };
    } catch (error: any) {
        return {
            content: [{ type: "text" as const, text: `Failed to rebuild schema graph: ${error.message}`, annotations: REFRESH_SCHEMA_CONTENT_ANNOTATIONS }],
            isError: true
        };
    }
}

// ---------------------------------------------------------------------------------------------------
// Definitions (names without prefix; descriptions, schemas and annotations exactly as served over stdio)

export const searchSchemaInputSchema = {
    query: z.string().max(200).describe("The name of the table or entity to search for (e.g. 'users', 'invoices')."),
};

export const explainOutputSchema = {
    rows: z.array(z.object({
        id: z.number().nullable().describe("SELECT identifier"),
        select_type: z.string().nullable().describe("Type of SELECT (SIMPLE, PRIMARY, SUBQUERY, etc.)"),
        table: z.string().nullable().describe("Table name"),
        partitions: z.string().nullable().optional().describe("Partition pruning info (MySQL 8+)"),
        type: z.string().nullable().describe("Join type (ALL, index, range, ref, const, etc.)"),
        possible_keys: z.string().nullable().describe("Indexes that could be used"),
        key: z.string().nullable().describe("Index actually chosen"),
        key_len: z.string().nullable().describe("Length of the chosen key"),
        ref: z.string().nullable().describe("Columns compared to the index"),
        rows: z.number().nullable().describe("Estimated rows to examine"),
        filtered: z.number().nullable().optional().describe("Estimated filtered percentage (MySQL 8+)"),
        Extra: z.string().nullable().describe("Additional information"),
    }).passthrough()).describe("EXPLAIN output rows"),
};

export const pingOutputSchema = {
    status: z.enum(["ok", "error"]).describe("Whether the database connection is healthy"),
    server_version: z.string().optional().describe("MySQL server version"),
    pool: z.object({
        active: z.number().describe("Active connections in the pool"),
        idle: z.number().describe("Idle connections in the pool"),
        queue: z.number().describe("Queued requests waiting for a connection"),
    }),
    error: z.string().optional().describe("Error message if status is 'error'"),
};

export interface WriteFlags { insert: boolean; update: boolean; delete: boolean; ddl: boolean }

export function searchSchemaDefinition() {
    return {
        description: "CRITICAL TOOL FOR SCHEMA EXPLORATION: Use this FIRST before writing queries. Fuzzy-searches a table name and returns its DDL plus direct parent/child table DDLs (Auto-Join Context), inferred FK hints, and semantic dictionary entries from metadata.json when configured. If templates.json is loaded, reminds you to use the 'query_templates' prompt for business metrics. Do NOT use execute_safe_query for schema exploration.",
        inputSchema: searchSchemaInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
    };
}

export function executeQueryDefinition(writes: WriteFlags) {
    const isReadOnly = !(writes.insert || writes.update || writes.delete || writes.ddl);
    const writeHint = isReadOnly
        ? ""
        : " Write operations (INSERT/UPDATE/DELETE/DDL) are enabled; UPDATE and DELETE require a WHERE clause.";
    return {
        description: `Executes SQL against the database with AST validation. SELECT results are capped by MCP_QUERY_ROW_LIMIT (default 500, AST-injected LIMIT) and include a '-- rows: N (truncated at LIMIT X)' footer when the cap is reached. Unindexed full table scans above MCP_EXPLAIN_MAX_SCAN_ROWS are blocked before execution.${writeHint} Only the configured schema is reachable: SHOW statements, information_schema/mysql/performance_schema/sys, other schemas, server variables, SELECT ... INTO and functions such as LOAD_FILE or SLEEP are rejected by the server. To explore the schema use 'search_schema'.`,
        inputSchema: {
            sql: z.string().max(10000).describe(
                isReadOnly
                    ? "SQL SELECT statement to execute."
                    : "SQL statement to execute. SELECT is always allowed; INSERT/UPDATE/DELETE/DDL only when enabled in server config. UPDATE and DELETE must include a WHERE clause."
            ),
        },
        annotations: {
            readOnlyHint: isReadOnly,
            destructiveHint: writes.delete || writes.ddl,
        },
    };
}

export function explainQueryDefinition() {
    return {
        description: "Returns MySQL EXPLAIN output as CSV for a validated SELECT query. SQL is AST-validated and timeout-protected; ANALYZE and non-SELECT statements are blocked. Unlike execute_safe_query, this does NOT block full table scans — use it to diagnose why a query was blocked or to verify index usage before executing.",
        inputSchema: {
            sql: z.string().max(10000).describe("The SELECT query to analyze."),
        },
        outputSchema: explainOutputSchema,
        annotations: {
            readOnlyHint: true,
            idempotentHint: true,
        },
    };
}

export function pingDefinition() {
    return {
        description: "Health check: verifies the database connection is alive. Returns JSON with status, MySQL server version, and connection pool stats (active, idle, queued).",
        outputSchema: pingOutputSchema,
        annotations: {
            readOnlyHint: true,
            openWorldHint: false,
        },
    };
}

export function refreshSchemaDefinition() {
    return {
        description: "Rebuilds the internal Schema Graph from the live database and notifies subscribed MCP resources. Use when search_schema or execute_safe_query fail with missing table/column errors after a schema change.",
        annotations: { readOnlyHint: true, idempotentHint: true },
    };
}
