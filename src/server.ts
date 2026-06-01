import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExecuteQueryTool } from "./tools/executeQuery.js";
import { registerSearchSchemaTool } from "./tools/searchSchema.js";
import { registerRefreshSchemaTool } from "./tools/refreshSchema.js";
import { registerPingTool } from "./tools/ping.js";
import { registerExplainQueryTool } from "./tools/explainQuery.js";
import { registerTemplatesPrompt } from "./prompts/templates.js";
import { registerTableResources } from "./resources/tables.js";
import { buildSchemaGraph } from "./db/schema.js";
import { initMetadata } from "./db/metadata.js";
import { initLogger } from "./utils/logger.js";

export async function createServer(): Promise<McpServer> {
    const server = new McpServer({
        name: "tokenlite-mysql-mcp",
        version: "1.0.0",
    }, {
        capabilities: {
            logging: {},
        },
    });

    initLogger(server);

    await buildSchemaGraph();
    initMetadata();

    let prefix = process.env.TOOL_PREFIX;
    if (!prefix) {
        const randomStr = Math.random().toString(36).substring(2, 6);
        prefix = `db_${randomStr}_`;
    }

    registerSearchSchemaTool(server, prefix);
    registerExecuteQueryTool(server, prefix);
    registerRefreshSchemaTool(server, prefix);
    registerPingTool(server, prefix);
    registerExplainQueryTool(server, prefix);
    registerTemplatesPrompt(server, prefix);
    registerTableResources(server);

    return server;
}
