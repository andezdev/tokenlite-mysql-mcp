import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pool } from "../db/index.js";
import { jsonToCsv } from "../utils/csvFormatter.js";

export async function handleExplainQuery({ sql }: { sql: string }) {
    try {
        const [rows] = await pool.query<any[]>(`EXPLAIN ${sql}`);
        const csv = jsonToCsv(rows as Record<string, any>[]);
        return {
            content: [{ type: "text" as const, text: csv }],
        };
    } catch (error: any) {
        return {
            content: [{ type: "text" as const, text: `EXPLAIN Error: ${error.message}` }],
            isError: true,
        };
    }
}

export function registerExplainQueryTool(server: McpServer, prefix: string = "") {
    server.tool(
        `${prefix}explain_query`,
        "Returns the MySQL EXPLAIN output for a SELECT query. Use this to understand index usage, join types, and row estimates before rewriting a blocked or slow query.",
        {
            sql: z.string().max(10000).describe("The SELECT query to analyze."),
        },
        {
            readOnlyHint: true,
            idempotentHint: true,
        },
        handleExplainQuery
    );
}
