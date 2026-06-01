import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer as createHttpServer, Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { buildSchemaGraph } from '../../src/db/schema';
import { registerPingTool } from '../../src/tools/ping';
import { initLogger } from '../../src/utils/logger';

const PORT = 3996;
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface Session {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, Session>();

function createTestServer(): McpServer {
    const server = new McpServer(
        { name: 'test-multi', version: '1.0.0' },
        { capabilities: { logging: {} } },
    );
    initLogger(server);
    registerPingTool(server, 'test_');
    return server;
}

function isInitializeRequest(body: any): boolean {
    return body?.method === 'initialize';
}

async function initSession(): Promise<string> {
    const res = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: { name: 'test', version: '1.0.0' },
            },
        }),
    });
    expect(res.status).toBe(200);
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    return sessionId!;
}

async function callToolsList(sessionId: string): Promise<Response> {
    return fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'mcp-session-id': sessionId,
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
        }),
    });
}

describe('HTTP Multi-Session Support', () => {
    let httpServer: Server;

    beforeAll(async () => {
        await buildSchemaGraph();

        httpServer = createHttpServer(async (req, res) => {
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            if (url.pathname !== '/mcp') {
                res.writeHead(404);
                res.end();
                return;
            }

            let parsedBody: any = undefined;
            if (req.method === 'POST') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) chunks.push(chunk as Buffer);
                parsedBody = JSON.parse(Buffer.concat(chunks).toString());
            }

            const sessionId = req.headers['mcp-session-id'] as string | undefined;

            if (sessionId && sessions.has(sessionId)) {
                await sessions.get(sessionId)!.transport.handleRequest(req as any, res, parsedBody);
                return;
            }

            if (!sessionId && req.method === 'POST' && isInitializeRequest(parsedBody)) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (id) => { sessions.set(id, { server, transport }); },
                    onsessionclosed: (id) => { sessions.delete(id); },
                });
                transport.onclose = () => {
                    if (transport.sessionId) sessions.delete(transport.sessionId);
                };
                const server = createTestServer();
                await server.connect(transport);
                await transport.handleRequest(req as any, res, parsedBody);
                return;
            }

            if (sessionId) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Session not found' }));
                return;
            }

            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Bad request' }));
        });

        await new Promise<void>(resolve => httpServer.listen(PORT, '127.0.0.1', resolve));
    });

    afterAll(async () => {
        for (const session of sessions.values()) {
            await session.server.close();
        }
        sessions.clear();
        await new Promise<void>(resolve => httpServer.close(() => resolve()));
    });

    it('should create two independent sessions with different IDs', async () => {
        const sessionA = await initSession();
        const sessionB = await initSession();

        expect(sessionA).not.toBe(sessionB);
        expect(sessions.size).toBeGreaterThanOrEqual(2);
    });

    it('should respond to tools/list on both sessions independently', async () => {
        const sessionA = await initSession();
        const sessionB = await initSession();

        const resA = await callToolsList(sessionA);
        const resB = await callToolsList(sessionB);

        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);
    });

    it('should return 404 for a terminated session without affecting others', async () => {
        const sessionA = await initSession();
        const sessionB = await initSession();

        // Terminate session A via DELETE
        const deleteRes = await fetch(`${BASE_URL}/mcp`, {
            method: 'DELETE',
            headers: { 'mcp-session-id': sessionA },
        });
        expect(deleteRes.status).toBe(200);

        // Session A should be gone
        const resA = await callToolsList(sessionA);
        expect(resA.status).toBe(404);

        // Session B should still work
        const resB = await callToolsList(sessionB);
        expect(resB.status).toBe(200);
    });
});
