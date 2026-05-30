import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExecuteQueryTool } from "./tools/executeQuery.js";
import { registerSearchSchemaTool } from "./tools/searchSchema.js";
import { registerRefreshSchemaTool } from "./tools/refreshSchema.js";

export const server = new McpServer({
    name: "tokenlite-mysql-server",
    version: "1.0.0",
});

registerExecuteQueryTool(server);
registerSearchSchemaTool(server);
registerRefreshSchemaTool(server);
