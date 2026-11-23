// Two engines in one process, each with its own database user and schema, must not share anything:
// configuration, SQL policy, schema graph, DDL cache or metadata. Environment variables (which drive the
// stdio server) must have no effect on them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngine, type Engine } from '../../src/engine/index.js';
import { schemaGraph as stdioSchemaGraph } from '../../src/db/schema.js';

const HOST = process.env.DB_HOST || '127.0.0.1';
const PORT = parseInt(process.env.DB_PORT || '3307', 10);
const text = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join('\n');

const CONFLICTING_ENV: Record<string, string> = {
    DB_NAME: 'mysql',
    MCP_ALLOWED_SCHEMAS: 'information_schema,mysql,mcp_views,mcp_test_db',
    MCP_ALLOW_SHOW: 'true',
    MCP_QUERY_ROW_LIMIT: '1',
    MCP_DENY_FUNCTIONS: 'CONCAT',
    MCP_INCLUDE_VIEWS: 'false',
    MCP_SAFE_QUERY_ENABLE_BLOCKING: 'false',
    ALLOW_UPDATE_OPERATION: 'true',
};

describe('engine isolation (two engines, one process)', () => {
    let shop: Engine;
    let views: Engine;
    const saved: Record<string, string | undefined> = {};
    const stdioGraphSizeBefore = stdioSchemaGraph.size;

    beforeAll(async () => {
        for (const [k, v] of Object.entries(CONFLICTING_ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
        shop = createEngine({
            connection: { host: HOST, port: PORT, user: 'mcp_test', password: 'mcp_password', database: 'mcp_test_db' },
            queryRowLimit: 2,
            metadata: { 'customers.tier': 'Commercial plan of the customer.' },
            templates: [{ name: 'Tier count', description: 'Customers per tier', sql: 'SELECT tier, COUNT(*) FROM customers GROUP BY tier' }],
            log: () => {},
        });
        views = createEngine({
            connection: { host: HOST, port: PORT, user: 'mcp_views_only', password: 'mcp_views_password', database: 'mcp_views' },
            queryRowLimit: 3,
            fullScanGate: { onViewExplainError: 'allow' },
            log: () => {},
        });
        await Promise.all([shop.init(), views.init()]);
    });

    afterAll(async () => {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        await Promise.all([shop?.close(), views?.close()]);
    });

    it('each engine has its own schema graph (views included by default, env ignored)', () => {
        expect(shop.tableNames()).toEqual(expect.arrayContaining(['customers', 'orders', 'customers_public']));
        expect(views.tableNames()).toEqual(['customers_v']);
    });

    it('the stdio server graph is not touched', () => {
        expect(stdioSchemaGraph.size).toBe(stdioGraphSizeBefore);
    });

    it('row limits are per engine', async () => {
        expect(text(await shop.executeQuery({ sql: 'SELECT id FROM customers ORDER BY id' }))).toBe('id\n1\n2\n-- rows: 2 (truncated at LIMIT 2)');
        expect(text(await views.executeQuery({ sql: 'SELECT id FROM customers_v ORDER BY id' }))).toBe('id\n1\n2\n3\n-- rows: 3 (truncated at LIMIT 3)');
    });

    it('schema allowlist is per engine: each one only reaches its own database', async () => {
        expect(text(await shop.executeQuery({ sql: 'SELECT id FROM mcp_views.customers_v' }))).toMatch(/Security Error: Access to schema 'mcp_views' is not allowed/);
        expect(text(await views.executeQuery({ sql: 'SELECT id FROM mcp_test_db.customers' }))).toMatch(/Security Error: Access to schema 'mcp_test_db' is not allowed/);
        expect(text(await views.executeQuery({ sql: 'SELECT user FROM mysql.user' }))).toMatch(/Security Error: Access to schema 'mysql'/);
    });

    it('SHOW, extra denied functions and writes follow the engine config, not the environment', async () => {
        expect(text(await shop.executeQuery({ sql: 'SHOW TABLES' }))).toMatch(/SHOW statements are disabled/);
        expect(text(await shop.executeQuery({ sql: "SELECT CONCAT(name, '!') AS n FROM customers WHERE id = 1" }))).toBe('n\nJohn Doe!');
        expect(text(await shop.executeQuery({ sql: "UPDATE test_permissions SET nombre = 'x' WHERE id = -1" }))).toMatch(/Operation 'update' is disabled/);
        expect(shop.definitions.execute_safe_query.annotations.readOnlyHint).toBe(true);
    });

    it('the full-scan gate is per engine', async () => {
        expect(text(await shop.executeQuery({ sql: "SELECT id FROM customers WHERE notes LIKE '%review%'" }))).toMatch(/Full table scan detected/);
        // view-only account: EXPLAIN is impossible (1345); this engine allows the query through
        expect(text(await views.executeQuery({ sql: "SELECT id FROM customers_v WHERE tier = 'pro' ORDER BY id LIMIT 1" }))).toMatch(/^id\n\d+/);
    });

    it('metadata and templates are per engine', async () => {
        expect(text(await shop.searchSchema({ query: 'customers' }))).toContain('Commercial plan of the customer.');
        expect(text(await shop.searchSchema({ query: 'customers' }))).toContain('CRITICAL REMINDER');
        expect(text(await views.searchSchema({ query: 'customers_v' }))).not.toContain('SEMANTIC DICTIONARY');
        expect(shop.templates.search('tier').map((t) => t.name)).toEqual(['Tier count']);
        expect(views.templates.loaded()).toBe(false);
    });

    it('view DDL never exposes the view definition', async () => {
        const ddl = await views.getTableDDL('customers_v');
        expect(ddl).toContain('CREATE VIEW `customers_v`');
        expect(ddl).toContain('/* view: definition not exposed */');
        expect(ddl).not.toMatch(/mcp_test_db|CONCAT|SELECT/i);
    });

    it('ping reports each engine pool', async () => {
        const r = await views.ping();
        expect(r.isError).toBeUndefined();
        expect((r.structuredContent as any).status).toBe('ok');
    });
});

describe('createEngine config validation', () => {
    it('requires a database and a user', () => {
        expect(() => createEngine({ connection: { user: 'x', database: '' } })).toThrow(/connection.database/);
        expect(() => createEngine({ connection: { user: '', database: 'x' } })).toThrow(/connection.user/);
        expect(() => createEngine({ connection: { user: 'x', database: 'x' }, queryRowLimit: -1 })).toThrow(/queryRowLimit/);
    });
});
