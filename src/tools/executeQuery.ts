import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeSafeQuery } from "../db/index.js";
import { jsonToCsv } from "../utils/csvFormatter.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { sanitizeDatabaseError } from "../utils/errorSanitizer.js";


export const EXECUTE_QUERY_CONTENT_ANNOTATIONS = { audience: ["user" as const, "assistant" as const], priority: 0.7 };

export async function handleExecuteQuery({ sql }: { sql: string }) {
    try {
        checkRateLimit();
        const result = await executeSafeQuery(sql);

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

export function registerExecuteQueryTool(server: McpServer, prefix: string = "") {
    const allowInsert = process.env.ALLOW_INSERT_OPERATION === 'true';
    const allowUpdate = process.env.ALLOW_UPDATE_OPERATION === 'true';
    const allowDelete = process.env.ALLOW_DELETE_OPERATION === 'true';
    const allowDdl = process.env.ALLOW_DDL_OPERATION === 'true';

    const isReadOnly = !(allowInsert || allowUpdate || allowDelete || allowDdl);

    const writeHint = isReadOnly
        ? ""
        : " Write operations (INSERT/UPDATE/DELETE/DDL) are enabled; UPDATE and DELETE require a WHERE clause.";

    server.registerTool(
        `${prefix}execute_safe_query`,
        {
            description: `Executes SQL against the database with AST validation. SELECT results are capped by MCP_QUERY_ROW_LIMIT (default 500, AST-injected LIMIT) and include a '-- rows: N (truncated at LIMIT X)' footer when the cap is reached. Unindexed full table scans above MCP_EXPLAIN_MAX_SCAN_ROWS are blocked before execution.${writeHint} CRITICAL: NEVER use this tool (e.g., SHOW TABLES or querying information_schema) to explore schema — use 'search_schema' first.`,
            inputSchema: {
                sql: z.string().max(10000).describe(
                    isReadOnly
                        ? "SQL SELECT statement to execute."
                        : "SQL statement to execute. SELECT is always allowed; INSERT/UPDATE/DELETE/DDL only when enabled in server config. UPDATE and DELETE must include a WHERE clause."
                ),
            },
            annotations: {
                readOnlyHint: isReadOnly,
                destructiveHint: allowDelete || allowDdl,
            },
        },
        handleExecuteQuery
    );
}
