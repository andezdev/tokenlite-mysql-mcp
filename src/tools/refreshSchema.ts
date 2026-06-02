import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildSchemaGraph } from "../db/schema.js";

export const REFRESH_SCHEMA_CONTENT_ANNOTATIONS = { audience: ["assistant" as const], priority: 0.2 };

export function registerRefreshSchemaTool(server: McpServer, prefix: string = "") {
    server.registerTool(
        `${prefix}refresh_schema`,
        {
            description: "Forces the MCP server to rebuild the internal Schema Graph. Use this if you suspect a DBA recently added a table, column, or foreign key and the search_schema or execute queries are failing.",
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            try {
                await buildSchemaGraph();
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
    );
}
