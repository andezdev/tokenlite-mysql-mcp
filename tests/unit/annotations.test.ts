import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Tool Annotations - dynamic behavior', () => {
    let server: McpServer;
    let registerToolSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "1.0.0" });
        registerToolSpy = vi.spyOn(server, 'registerTool');
    });

    it('execute_safe_query should have readOnlyHint: true when all writes disabled', async () => {
        vi.resetModules();
        const readOnlyServer = new McpServer({ name: "read-only", version: "1.0.0" });
        const readOnlySpy = vi.spyOn(readOnlyServer, 'registerTool');

        const { registerExecuteQueryTool } = await import('../../src/tools/executeQuery');
        delete process.env.ALLOW_INSERT_OPERATION;
        delete process.env.ALLOW_UPDATE_OPERATION;
        delete process.env.ALLOW_DELETE_OPERATION;
        delete process.env.ALLOW_DDL_OPERATION;
        registerExecuteQueryTool(readOnlyServer, "t_");

        const config = readOnlySpy.mock.calls[0][1] as any;
        expect(config.annotations).toMatchObject({
            readOnlyHint: true,
            destructiveHint: false,
        });
    });

    it('execute_safe_query should have destructiveHint: true when DELETE enabled', async () => {
        vi.resetModules();
        const server2 = new McpServer({ name: "test2", version: "1.0.0" });
        const spy2 = vi.spyOn(server2, 'registerTool');

        const { registerExecuteQueryTool } = await import('../../src/tools/executeQuery');
        delete process.env.ALLOW_INSERT_OPERATION;
        delete process.env.ALLOW_UPDATE_OPERATION;
        delete process.env.ALLOW_DDL_OPERATION;
        process.env.ALLOW_DELETE_OPERATION = 'true';
        registerExecuteQueryTool(server2, "t_");

        const config = spy2.mock.calls[0][1] as any;
        expect(config.annotations).toMatchObject({
            readOnlyHint: false,
            destructiveHint: true,
        });

        delete process.env.ALLOW_DELETE_OPERATION;
    });

    it('execute_safe_query should have destructiveHint: true when DDL enabled', async () => {
        vi.resetModules();
        const server3 = new McpServer({ name: "test3", version: "1.0.0" });
        const spy3 = vi.spyOn(server3, 'registerTool');

        const { registerExecuteQueryTool } = await import('../../src/tools/executeQuery');
        delete process.env.ALLOW_INSERT_OPERATION;
        delete process.env.ALLOW_UPDATE_OPERATION;
        delete process.env.ALLOW_DELETE_OPERATION;
        process.env.ALLOW_DDL_OPERATION = 'true';
        registerExecuteQueryTool(server3, "t_");

        const config = spy3.mock.calls[0][1] as any;
        expect(config.annotations).toMatchObject({
            readOnlyHint: false,
            destructiveHint: true,
        });

        delete process.env.ALLOW_DDL_OPERATION;
    });
});
