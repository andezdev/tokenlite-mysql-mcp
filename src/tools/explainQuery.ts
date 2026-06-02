import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pool } from "../db/index.js";
import { jsonToCsv } from "../utils/csvFormatter.js";
import { checkRateLimit } from "../utils/rateLimiter.js";

export const EXPLAIN_QUERY_CONTENT_ANNOTATIONS = { audience: ["assistant" as const], priority: 0.5 };

export async function handleExplainQuery({ sql }: { sql: string }) {
    try {
        checkRateLimit();
        const [rows] = await pool.query<any[]>(`EXPLAIN ${sql}`);
        const csv = jsonToCsv(rows as Record<string, any>[]);
        return {
            content: [{ type: "text" as const, text: csv, annotations: EXPLAIN_QUERY_CONTENT_ANNOTATIONS }],
            structuredContent: { rows } as unknown as Record<string, unknown>,
        };
    } catch (error: any) {
        return {
            content: [{ type: "text" as const, text: `EXPLAIN Error: ${error.message}` }],
            isError: true,
        };
    }
}

const explainRowSchema = z.object({
    id: z.number().nullable().describe("SELECT identifier"),
    select_type: z.string().nullable().describe("Type of SELECT (SIMPLE, PRIMARY, SUBQUERY, etc.)"),
    table: z.string().nullable().describe("Table name"),
    type: z.string().nullable().describe("Join type (ALL, index, range, ref, const, etc.)"),
    possible_keys: z.string().nullable().describe("Indexes that could be used"),
    key: z.string().nullable().describe("Index actually chosen"),
    key_len: z.string().nullable().describe("Length of the chosen key"),
    ref: z.string().nullable().describe("Columns compared to the index"),
    rows: z.number().nullable().describe("Estimated rows to examine"),
    Extra: z.string().nullable().describe("Additional information"),
});

export const explainOutputSchema = {
    rows: z.array(explainRowSchema).describe("EXPLAIN output rows"),
};

export function registerExplainQueryTool(server: McpServer, prefix: string = "") {
    server.registerTool(
        `${prefix}explain_query`,
        {
            description: "Returns the MySQL EXPLAIN output for a SELECT query. Use this to understand index usage, join types, and row estimates before rewriting a blocked or slow query.",
            inputSchema: {
                sql: z.string().max(10000).describe("The SELECT query to analyze."),
            },
            outputSchema: explainOutputSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
            },
        },
        handleExplainQuery
    );
}
