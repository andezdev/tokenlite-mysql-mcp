#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerExecuteQueryTool } from "./tools/executeQuery.js";
import { registerSearchSchemaTool } from "./tools/searchSchema.js";
import { registerRefreshSchemaTool } from "./tools/refreshSchema.js";
import { registerGetTemplatesTool } from "./tools/getTemplates.js";
import { buildSchemaGraph } from "./db/schema.js";
import { initMetadata } from "./db/metadata.js";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

async function main() {
    const server = new McpServer({
        name: "tokenlite-mysql-mcp",
        version: "1.0.0",
    });

    // Build Semantic Graph on startup
    await buildSchemaGraph();
    
    // Load Metadata and Templates
    initMetadata();

    // Register MCP Tools
    registerSearchSchemaTool(server);
    registerExecuteQueryTool(server);
    registerRefreshSchemaTool(server);
    registerGetTemplatesTool(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
