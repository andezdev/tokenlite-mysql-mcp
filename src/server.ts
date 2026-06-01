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

let toolPrefix: string | undefined;

export async function initSharedState(): Promise<void> {
    await buildSchemaGraph();
    initMetadata();

    toolPrefix = process.env.TOOL_PREFIX;
    if (!toolPrefix) {
        const randomStr = Math.random().toString(36).substring(2, 6);
        toolPrefix = `db_${randomStr}_`;
    }
}

export function createServer(): McpServer {
    const server = new McpServer({
        name: "tokenlite-mysql-mcp",
        version: "1.0.0",
    }, {
        capabilities: {
            logging: {},
        },
    });

    initLogger(server);

    const prefix = toolPrefix || "db_";

    registerSearchSchemaTool(server, prefix);
    registerExecuteQueryTool(server, prefix);
    registerRefreshSchemaTool(server, prefix);
    registerPingTool(server, prefix);
    registerExplainQueryTool(server, prefix);
    registerTemplatesPrompt(server, prefix);
    registerTableResources(server);

    return server;
}
