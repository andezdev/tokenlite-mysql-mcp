import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Tool Annotations', () => {
    let server: McpServer;
    let toolSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "1.0.0" });
        toolSpy = vi.spyOn(server, 'tool');
    });

    it('search_schema should have readOnlyHint and openWorldHint: false', async () => {
        const { registerSearchSchemaTool } = await import('../../src/tools/searchSchema');
        registerSearchSchemaTool(server, "t_");

        const annotationsArg = toolSpy.mock.calls[0][3];
        expect(annotationsArg).toMatchObject({
            readOnlyHint: true,
            openWorldHint: false,
        });
    });

    it('execute_safe_query should have readOnlyHint: true when all writes disabled', async () => {
        delete process.env.ALLOW_INSERT_OPERATION;
        delete process.env.ALLOW_UPDATE_OPERATION;
        delete process.env.ALLOW_DELETE_OPERATION;
        delete process.env.ALLOW_DDL_OPERATION;

        const { registerExecuteQueryTool } = await import('../../src/tools/executeQuery');
        registerExecuteQueryTool(server, "t_");

        const annotationsArg = toolSpy.mock.calls[0][3];
        expect(annotationsArg).toMatchObject({
            readOnlyHint: true,
            destructiveHint: false,
        });
    });

    it('execute_safe_query should have destructiveHint: true when DELETE enabled', async () => {
        process.env.ALLOW_DELETE_OPERATION = 'true';

        vi.resetModules();
        const server2 = new McpServer({ name: "test2", version: "1.0.0" });
        const toolSpy2 = vi.spyOn(server2, 'tool');

        const { registerExecuteQueryTool } = await import('../../src/tools/executeQuery');
        registerExecuteQueryTool(server2, "t_");

        const annotationsArg = toolSpy2.mock.calls[0][3];
        expect(annotationsArg).toMatchObject({
            readOnlyHint: false,
            destructiveHint: true,
        });

        delete process.env.ALLOW_DELETE_OPERATION;
    });

    it('execute_safe_query should have destructiveHint: true when DDL enabled', async () => {
        process.env.ALLOW_DDL_OPERATION = 'true';

        vi.resetModules();
        const server3 = new McpServer({ name: "test3", version: "1.0.0" });
        const toolSpy3 = vi.spyOn(server3, 'tool');

        const { registerExecuteQueryTool } = await import('../../src/tools/executeQuery');
        registerExecuteQueryTool(server3, "t_");

        const annotationsArg = toolSpy3.mock.calls[0][3];
        expect(annotationsArg).toMatchObject({
            readOnlyHint: false,
            destructiveHint: true,
        });

        delete process.env.ALLOW_DDL_OPERATION;
    });

    it('refresh_schema should have readOnlyHint and idempotentHint', async () => {
        const { registerRefreshSchemaTool } = await import('../../src/tools/refreshSchema');
        registerRefreshSchemaTool(server, "t_");

        const annotationsArg = toolSpy.mock.calls[0][3];
        expect(annotationsArg).toMatchObject({
            readOnlyHint: true,
            idempotentHint: true,
        });
    });

    it('ping should have readOnlyHint and openWorldHint: false', async () => {
        const { registerPingTool } = await import('../../src/tools/ping');
        registerPingTool(server, "t_");

        const annotationsArg = toolSpy.mock.calls[0][3];
        expect(annotationsArg).toMatchObject({
            readOnlyHint: true,
            openWorldHint: false,
        });
    });
});
