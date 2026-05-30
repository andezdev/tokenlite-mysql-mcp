import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeSafeQuery } from "../db/index.js";
import { jsonToCsv } from "../utils/csvFormatter.js";

export function registerExecuteQueryTool(server: McpServer) {
    server.tool(
        "execute_safe_query",
        "Executes a safe SELECT query on the database. Large results are automatically truncated and returned compressed in CSV format to save tokens.",
        {
            sql: z.string().describe("SQL SELECT statement to execute."),
        },
        async ({ sql }) => {
            if (!sql.trim().toUpperCase().startsWith("SELECT") && !sql.trim().toUpperCase().startsWith("SHOW")) {
                return {
                    content: [{ type: "text", text: "Security Error: Only SELECT or SHOW statements are allowed." }],
                    isError: true
                };
            }

            try {
                const rows = await executeSafeQuery(sql);
                const csvData = jsonToCsv(rows);
                return {
                    content: [{ type: "text", text: csvData }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Database Error: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
