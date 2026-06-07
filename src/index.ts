#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerExecuteQueryTool } from "./tools/executeQuery.js";
import { registerSearchSchemaTool } from "./tools/searchSchema.js";
import { registerRefreshSchemaTool } from "./tools/refreshSchema.js";
import { registerPingTool } from "./tools/ping.js";
import { registerExplainQueryTool } from "./tools/explainQuery.js";
import { registerTemplatesPrompt } from "./prompts/templates.js";
import { registerTableResources } from "./resources/tables.js";
import { buildSchemaGraph } from "./db/schema.js";
import { initMetadata } from "./db/metadata.js";
import { closePool } from "./db/index.js";
import { initLogger, log } from "./utils/logger.js";
import { getPackageVersion } from "./utils/version.js";
import { deriveToolPrefix } from "./utils/toolPrefix.js";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

async function main() {
    const server = new McpServer({
        name: "tokenlite-mysql-mcp",
        version: getPackageVersion(),
    }, {
        capabilities: {
            logging: {},
            completions: {},
            resources: {
                subscribe: true,
                listChanged: true,
            },
        },
    });

    initLogger(server);

    try {
        await buildSchemaGraph();
    } catch (e) {
        log("warning", `Failed to build schema graph on startup: ${e instanceof Error ? e.message : String(e)}. The server will start in degraded mode.`);
    }
    
    initMetadata();

    const prefix = deriveToolPrefix();

    registerSearchSchemaTool(server, prefix);
    registerExecuteQueryTool(server, prefix);
    registerRefreshSchemaTool(server, prefix);
    registerPingTool(server, prefix);
    registerExplainQueryTool(server, prefix);
    registerTemplatesPrompt(server, prefix);
    registerTableResources(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    const cleanup = async () => {
        console.error('\n[tokenlite-mysql-mcp] Shutting down server...');
        await server.close();
        await closePool();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

main().catch(console.error);
