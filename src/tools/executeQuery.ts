import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeQuery, executeQueryDefinition } from "../engine/tools.js";
import { defaultContext } from "../db/defaultContext.js";
import { checkRateLimit } from "../utils/rateLimiter.js";

export { EXECUTE_QUERY_CONTENT_ANNOTATIONS } from "../engine/tools.js";

export async function handleExecuteQuery({ sql }: { sql: string }) {
    return executeQuery(defaultContext(), { sql }, { beforeRun: checkRateLimit });
}

export function registerExecuteQueryTool(server: McpServer, prefix: string = "") {
    server.registerTool(`${prefix}execute_safe_query`, executeQueryDefinition(defaultContext().settings.writes), handleExecuteQuery);
}
