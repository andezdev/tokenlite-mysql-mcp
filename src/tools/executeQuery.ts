import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeSafeQuery } from "../db/index.js";
import { jsonToCsv } from "../utils/csvFormatter.js";


export async function handleExecuteQuery({ sql }: { sql: string }) {
    if (!sql.trim().toUpperCase().startsWith("SELECT") && !sql.trim().toUpperCase().startsWith("SHOW")) {
        return {
            content: [{ type: "text" as const, text: "Security Error: Only SELECT or SHOW statements are allowed." }],
            isError: true
        };
    }

    try {
        const rows = await executeSafeQuery(sql);
        const csvData = jsonToCsv(rows);
        return {
            content: [{ type: "text" as const, text: csvData }]
        };
    } catch (error: any) {
        let errorMessage = `Database Error: ${error.message}`;
        if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('Unknown column')) {
            errorMessage += `\n\nHint: If you believe this column exists, the DBA might have just added it. Please call the 'refresh_schema' tool and try again.`;
        }

        return {
            content: [{ type: "text" as const, text: errorMessage }],
            isError: true
        };
    }
}

export function registerExecuteQueryTool(server: McpServer) {
    server.tool(
        "execute_safe_query",
        "Executes a safe SELECT query on the database. Large results are automatically truncated. CRITICAL: NEVER use this tool (e.g., SHOW TABLES or querying information_schema) to understand the database structure. You MUST ALWAYS use the 'search_schema' tool first to understand the relationships and tables before writing any JOIN queries.",
        {
            sql: z.string().describe("SQL SELECT statement to execute."),
        },
        handleExecuteQuery
    );
}
