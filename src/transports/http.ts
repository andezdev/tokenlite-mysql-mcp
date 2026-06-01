import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { log } from "../utils/logger.js";

function parseAllowedOrigins(): Set<string> {
    const raw = process.env.MCP_HTTP_ALLOWED_ORIGINS || "localhost,127.0.0.1";
    return new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
}

function isOriginAllowed(origin: string | undefined, allowed: Set<string>): boolean {
    if (!origin) return true;

    try {
        const url = new URL(origin);
        const hostname = url.hostname;
        if (allowed.has(hostname)) return true;
        if (allowed.has(origin)) return true;
    } catch {
        // malformed origin
    }
    return false;
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}

export async function startHttp(server: McpServer): Promise<void> {
    const host = process.env.MCP_HTTP_HOST || "127.0.0.1";
    const port = parseInt(process.env.MCP_HTTP_PORT || "3000", 10);
    const token = process.env.MCP_HTTP_TOKEN;
    const allowedOrigins = parseAllowedOrigins();

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
            log("info", `HTTP session initialized: ${sessionId}`, "http");
        },
        onsessionclosed: (sessionId) => {
            log("info", `HTTP session closed: ${sessionId}`, "http");
        },
    });

    await server.connect(transport);

    const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);

        if (url.pathname !== "/mcp") {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not Found" }));
            return;
        }

        const origin = req.headers.origin as string | undefined;
        if (!isOriginAllowed(origin, allowedOrigins)) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Forbidden: Origin not allowed" }));
            return;
        }

        if (token) {
            const auth = req.headers.authorization;
            if (!auth || auth !== `Bearer ${token}`) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Unauthorized" }));
                return;
            }
        }

        let parsedBody: unknown = undefined;
        if (req.method === "POST") {
            try {
                const raw = await readBody(req);
                parsedBody = JSON.parse(raw);
            } catch {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
                return;
            }
        }

        await transport.handleRequest(req as any, res, parsedBody);
    });

    httpServer.listen(port, host, () => {
        console.error(`[tokenlite-mysql-mcp] HTTP transport listening on http://${host}:${port}/mcp`);
    });
}
