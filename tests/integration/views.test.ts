import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { buildSchemaGraph, getTableDDL, invalidateDdlCache, schemaGraph } from '../../src/db/schema';
import { analyzeQueryPlan } from '../../src/db/optimizer';

/**
 * View support. Uses:
 *  - mcp_test_db.customers_public: a masked view in the default schema (mcp_test account)
 *  - mcp_views.customers_v + account mcp_views_only: a view-only deployment (SELECT on the views
 *    schema only; no SHOW VIEW, no access to the base tables)
 */
describe('Views', () => {
    beforeAll(async () => {
        delete process.env.MCP_INCLUDE_VIEWS;
        await buildSchemaGraph();
    });

    it('includes views in the schema graph, marked as views', () => {
        const node = schemaGraph.get('customers_public');
        expect(node).toBeDefined();
        expect(node?.kind).toBe('view');
        expect(schemaGraph.get('customers')?.kind).toBe('table');
    });

    it('serves a column-only DDL for views that does not expose the view definition', async () => {
        invalidateDdlCache();
        const ddl = await getTableDDL('customers_public');
        expect(ddl).toContain('CREATE VIEW `customers_public`');
        expect(ddl).toContain('`email_masked`');
        expect(ddl).toContain('`tier` enum(');
        // Nothing about how the view is built
        expect(ddl).not.toMatch(/mcp_test_db|concat|left\(|select|from/i);
    });

    it('still serves SHOW CREATE TABLE output for base tables', async () => {
        invalidateDdlCache();
        const ddl = await getTableDDL('customers');
        expect(ddl).toContain('CREATE TABLE `customers`');
    });

    it('MCP_INCLUDE_VIEWS=false keeps views out of the graph', async () => {
        process.env.MCP_INCLUDE_VIEWS = 'false';
        try {
            await buildSchemaGraph();
            expect(schemaGraph.has('customers_public')).toBe(false);
            expect(schemaGraph.has('customers')).toBe(true);
        } finally {
            delete process.env.MCP_INCLUDE_VIEWS;
            await buildSchemaGraph();
        }
    });
});

describe('Views - view-only account (no SHOW VIEW, no base-table access)', () => {
    let viewsPool: mysql.Pool;

    beforeAll(() => {
        viewsPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: 'mcp_views_only',
            password: 'mcp_views_password',
            database: 'mcp_views',
            connectionLimit: 2,
        });
    });

    afterAll(async () => {
        await viewsPool.end();
    });

    it('can read the view', async () => {
        const [rows] = await viewsPool.query<any[]>('SELECT COUNT(*) AS n FROM customers_v');
        expect(rows[0].n).toBeGreaterThan(0);
    });

    it('cannot read the base tables', async () => {
        await expect(viewsPool.query('SELECT 1 FROM mcp_test_db.customers LIMIT 1')).rejects.toThrow(/denied/i);
    });

    it('cannot SHOW CREATE the view (which is why the server builds view DDL from columns)', async () => {
        await expect(viewsPool.query('SHOW CREATE TABLE customers_v')).rejects.toThrow(/SHOW VIEW command denied/i);
    });

    it('can list the view columns through information_schema', async () => {
        const [rows] = await viewsPool.query<any[]>(
            "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = 'mcp_views' AND TABLE_NAME = 'customers_v' ORDER BY ORDINAL_POSITION"
        );
        expect(rows.map((r) => r.COLUMN_NAME)).toEqual(['id', 'email_masked', 'tier']);
    });

    it('full-scan gate: fails closed with an explanatory error by default (ER_VIEW_NO_EXPLAIN)', async () => {
        delete process.env.MCP_EXPLAIN_ON_VIEW_ERROR;
        await expect(analyzeQueryPlan('SELECT * FROM customers_v LIMIT 10', viewsPool as any)).rejects.toThrow(
            /ER_VIEW_NO_EXPLAIN.*MCP_EXPLAIN_ON_VIEW_ERROR=allow/
        );
    });

    it('full-scan gate: MCP_EXPLAIN_ON_VIEW_ERROR=allow skips the gate for views', async () => {
        process.env.MCP_EXPLAIN_ON_VIEW_ERROR = 'allow';
        try {
            await expect(analyzeQueryPlan('SELECT * FROM customers_v LIMIT 10', viewsPool as any)).resolves.toBeUndefined();
        } finally {
            delete process.env.MCP_EXPLAIN_ON_VIEW_ERROR;
        }
    });
});
