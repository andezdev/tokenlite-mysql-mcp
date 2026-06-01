import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SetLevelRequestSchema, type LoggingLevel } from "@modelcontextprotocol/sdk/types.js";

const SEVERITY_ORDER: LoggingLevel[] = [
    "debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"
];

let mcpServer: McpServer | null = null;
let minLevel: LoggingLevel = (process.env.MCP_LOG_LEVEL as LoggingLevel) || "info";

function severityIndex(level: LoggingLevel): number {
    return SEVERITY_ORDER.indexOf(level);
}

export function initLogger(server: McpServer): void {
    mcpServer = server;

    server.server.setRequestHandler(
        SetLevelRequestSchema,
        async (request: any) => {
            const requested = request.params?.level as LoggingLevel;
            if (requested && SEVERITY_ORDER.includes(requested)) {
                minLevel = requested;
            }
            return {};
        }
    );
}

export function getMinLevel(): LoggingLevel {
    return minLevel;
}

export async function log(
    level: LoggingLevel,
    data: unknown,
    logger?: string
): Promise<void> {
    if (severityIndex(level) < severityIndex(minLevel)) {
        return;
    }

    if (mcpServer) {
        try {
            await mcpServer.sendLoggingMessage({ level, data, logger });
            return;
        } catch {
            // MCP session not ready yet, fall through to stderr
        }
    }

    const prefix = logger ? `[${logger}]` : "[tokenlite-mysql-mcp]";
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    console.error(`${prefix} [${level}] ${msg}`);
}
