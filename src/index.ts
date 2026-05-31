#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerExecuteQueryTool } from "./tools/executeQuery.js";
import { registerSearchSchemaTool } from "./tools/searchSchema.js";
import { registerRefreshSchemaTool } from "./tools/refreshSchema.js";
import { registerTemplatesPrompt } from "./prompts/templates.js";
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

    // Generate or use provided tool prefix (dev_, prod_ ...)
    let prefix = process.env.TOOL_PREFIX; 
    if (!prefix) {
        const randomStr = Math.random().toString(36).substring(2, 6);
        prefix = `db_${randomStr}_`;
    }

    // Register MCP Tools
    registerSearchSchemaTool(server, prefix);
    registerExecuteQueryTool(server, prefix);
    registerRefreshSchemaTool(server, prefix);
    registerTemplatesPrompt(server, prefix);

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
