import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer as createHttpServer, Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { buildSchemaGraph } from '../../src/db/schema';
import { initLogger } from '../../src/utils/logger';

const TEST_PORT = 3999;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TOKEN = 'test-secret-token';

let httpServer: Server;
let mcpServer: McpServer;
let transport: StreamableHTTPServerTransport;

async function postMcp(body: any, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

function initRequest(sessionId?: string) {
    const headers: Record<string, string> = {};
    if (sessionId) headers['mcp-session-id'] = sessionId;
    return postMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
        },
    }, headers);
}

describe('HTTP Transport', () => {
    beforeAll(async () => {
        mcpServer = new McpServer(
            { name: 'test-http', version: '1.0.0' },
            { capabilities: { logging: {} } },
        );
        initLogger(mcpServer);
        await buildSchemaGraph();

        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });

        await mcpServer.connect(transport);

        httpServer = createHttpServer(async (req, res) => {
            const url = new URL(req.url || '/', `http://${req.headers.host}`);

            if (url.pathname !== '/mcp') {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not Found' }));
                return;
            }

            let parsedBody: unknown = undefined;
            if (req.method === 'POST') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(chunk as Buffer);
                parsedBody = JSON.parse(Buffer.concat(chunks).toString());
            }

            await transport.handleRequest(req as any, res, parsedBody);
        });

        await new Promise<void>(resolve => httpServer.listen(TEST_PORT, '127.0.0.1', resolve));
    });

    afterAll(async () => {
        await mcpServer.close();
        await new Promise<void>(resolve => httpServer.close(() => resolve()));
    });

    it('should return 404 for non-/mcp paths', async () => {
        const res = await fetch(`${BASE_URL}/health`);
        expect(res.status).toBe(404);
    });

    it('should return session ID on initialize', async () => {
        const res = await initRequest();
        expect(res.status).toBe(200);
        const sessionId = res.headers.get('mcp-session-id');
        expect(sessionId).toBeTruthy();
    });

    it('should reject non-init requests without session ID', async () => {
        const res = await postMcp({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
        });
        expect(res.status).toBe(400);
    });

    it('should reject requests with invalid session ID', async () => {
        const res = await postMcp({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
        }, { 'mcp-session-id': 'invalid-session-id' });
        expect(res.status).toBe(404);
    });
});

describe('HTTP Transport - Origin Validation', () => {
    let server: Server;
    let mcpSrv: McpServer;
    let tp: StreamableHTTPServerTransport;
    const PORT = 3998;
    const URL = `http://127.0.0.1:${PORT}`;

    beforeAll(async () => {
        mcpSrv = new McpServer({ name: 'test-origin', version: '1.0.0' });
        tp = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
        await mcpSrv.connect(tp);

        server = createHttpServer(async (req, res) => {
            const origin = req.headers.origin as string | undefined;
            if (origin) {
                try {
                    const hostname = new URL(origin).hostname;
                    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
                        res.writeHead(403);
                        res.end(JSON.stringify({ error: 'Forbidden' }));
                        return;
                    }
                } catch {
                    res.writeHead(403);
                    res.end(JSON.stringify({ error: 'Forbidden' }));
                    return;
                }
            }

            let parsedBody: unknown = undefined;
            if (req.method === 'POST') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(chunk as Buffer);
                parsedBody = JSON.parse(Buffer.concat(chunks).toString());
            }
            await tp.handleRequest(req as any, res, parsedBody);
        });

        await new Promise<void>(resolve => server.listen(PORT, '127.0.0.1', resolve));
    });

    afterAll(async () => {
        await mcpSrv.close();
        await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('should reject requests with evil Origin', async () => {
        const res = await fetch(`${URL}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Origin': 'http://evil.com',
            },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
            }),
        });
        expect(res.status).toBe(403);
    });

    it('should allow requests without Origin header', async () => {
        const res = await fetch(`${URL}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
            }),
        });
        expect(res.status).toBe(200);
    });
});

describe('HTTP Transport - Bearer Token Auth', () => {
    let server: Server;
    let mcpSrv: McpServer;
    let tp: StreamableHTTPServerTransport;
    const PORT = 3997;
    const URL = `http://127.0.0.1:${PORT}`;

    beforeAll(async () => {
        mcpSrv = new McpServer({ name: 'test-auth', version: '1.0.0' });
        tp = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
        await mcpSrv.connect(tp);

        server = createHttpServer(async (req, res) => {
            const auth = req.headers.authorization;
            if (!auth || auth !== `Bearer ${TOKEN}`) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            let parsedBody: unknown = undefined;
            if (req.method === 'POST') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(chunk as Buffer);
                parsedBody = JSON.parse(Buffer.concat(chunks).toString());
            }
            await tp.handleRequest(req as any, res, parsedBody);
        });

        await new Promise<void>(resolve => server.listen(PORT, '127.0.0.1', resolve));
    });

    afterAll(async () => {
        await mcpSrv.close();
        await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('should reject requests without Authorization header', async () => {
        const res = await fetch(`${URL}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
            }),
        });
        expect(res.status).toBe(401);
    });

    it('should accept requests with valid Bearer token', async () => {
        const res = await fetch(`${URL}/mcp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Authorization': `Bearer ${TOKEN}`,
            },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
            }),
        });
        expect(res.status).toBe(200);
    });
});
