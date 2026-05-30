import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExecuteQueryTool } from "./tools/executeQuery.js";

export const server = new McpServer({
    name: "tokenlite-mysql-server",
    version: "1.0.0",
});

registerExecuteQueryTool(server);
