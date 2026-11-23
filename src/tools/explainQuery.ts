import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { explainQuery, explainQueryDefinition } from "../engine/tools.js";
import { defaultContext } from "../db/defaultContext.js";
import { checkRateLimit } from "../utils/rateLimiter.js";

export { EXPLAIN_QUERY_CONTENT_ANNOTATIONS, explainOutputSchema } from "../engine/tools.js";

export async function handleExplainQuery({ sql }: { sql: string }) {
    return explainQuery(defaultContext(), { sql }, { beforeRun: checkRateLimit });
}

export function registerExplainQueryTool(server: McpServer, prefix: string = "") {
    server.registerTool(`${prefix}explain_query`, explainQueryDefinition(), handleExplainQuery);
}
