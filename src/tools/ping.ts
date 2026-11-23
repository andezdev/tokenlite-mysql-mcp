import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ping, pingDefinition } from "../engine/tools.js";
import { defaultContext } from "../db/defaultContext.js";

export { PING_CONTENT_ANNOTATIONS, pingOutputSchema } from "../engine/tools.js";

export async function handlePing() {
    return ping(defaultContext());
}

export function registerPingTool(server: McpServer, prefix: string = "") {
    server.registerTool(`${prefix}ping`, pingDefinition(), handlePing);
}
