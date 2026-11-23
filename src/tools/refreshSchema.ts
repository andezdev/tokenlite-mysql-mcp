import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshSchema, refreshSchemaDefinition } from "../engine/tools.js";
import { defaultContext } from "../db/defaultContext.js";
import { notifyResourceSubscribers } from "../resources/tables.js";

export { REFRESH_SCHEMA_CONTENT_ANNOTATIONS } from "../engine/tools.js";

export function registerRefreshSchemaTool(server: McpServer, prefix: string = "") {
    server.registerTool(
        `${prefix}refresh_schema`,
        refreshSchemaDefinition(),
        async () => refreshSchema(defaultContext(), () => notifyResourceSubscribers(server)),
    );
}
