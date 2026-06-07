import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildSchemaGraph } from "../db/schema.js";
import { notifyResourceSubscribers } from "../resources/tables.js";

export const REFRESH_SCHEMA_CONTENT_ANNOTATIONS = { audience: ["assistant" as const], priority: 0.2 };

export function registerRefreshSchemaTool(server: McpServer, prefix: string = "") {
    server.registerTool(
        `${prefix}refresh_schema`,
        {
            description: "Rebuilds the internal Schema Graph from the live database and notifies subscribed MCP resources. Use when search_schema or execute_safe_query fail with missing table/column errors after a schema change.",
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            try {
                await buildSchemaGraph();
                await notifyResourceSubscribers(server);
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
