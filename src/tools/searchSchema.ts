import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchSchema, searchSchemaDefinition } from "../engine/tools.js";
import { defaultContext } from "../db/defaultContext.js";
import { checkRateLimit } from "../utils/rateLimiter.js";

export { SEARCH_SCHEMA_CONTENT_ANNOTATIONS } from "../engine/tools.js";

export async function handleSearchSchema({ query }: { query: string }) {
    return searchSchema(defaultContext(), { query }, { beforeRun: checkRateLimit });
}

export function registerSearchSchemaTool(server: McpServer, prefix: string = "") {
    server.registerTool(`${prefix}search_schema`, searchSchemaDefinition(), handleSearchSchema);
}
