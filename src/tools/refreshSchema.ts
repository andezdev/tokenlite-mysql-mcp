import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildSchemaGraph } from "../db/schema.js";

export function registerRefreshSchemaTool(server: McpServer, prefix: string = "") {
    server.tool(
        `${prefix}refresh_schema`,
        "Forces the MCP server to rebuild the internal Schema Graph. Use this if you suspect a DBA recently added a table, column, or foreign key and the search_schema or execute queries are failing.",
        {},
        { readOnlyHint: true, idempotentHint: true },
        async () => {
            try {
                await buildSchemaGraph();
                return {
                    content: [{ type: "text" as const, text: "Schema Graph rebuilt successfully. You can now use search_schema to explore the updated relationships." }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text" as const, text: `Failed to rebuild schema graph: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
