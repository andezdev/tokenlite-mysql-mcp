// Captures the observable stdio contract of the server: what an MCP client sees (tool/prompt/resource
// listings and the exact output of representative calls). Used by stdioContract.test.ts to guarantee
// that internal refactors do not change behaviour for stdio users.
//
// Regenerate the fixture ONLY when a behaviour change is intended:
//   UPDATE_STDIO_CONTRACT=1 npx vitest run tests/e2e/stdioContract.test.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface ContractEntry { call: string; result: unknown }

/** Strip values that legitimately differ between runs (server version, pool counters). */
function normalize(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value), (key, v) => {
        if (key === 'server_version' && typeof v === 'string') return '<version>';
        if ((key === 'active' || key === 'idle' || key === 'queue') && typeof v === 'number') return '<n>';
        if (key === 'version' && typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v)) return '<version>';
        if (key === 'text' && typeof v === 'string') {
            return v
                .replace(/"server_version": "[^"]*"/g, '"server_version": "<version>"')
                .replace(/"(active|idle|queue)": \d+/g, '"$1": "<n>"')
                .replace(/ AUTO_INCREMENT=\d+/g, '');
        }
        return v;
    });
}

export async function captureStdioContract(env: Record<string, string>): Promise<ContractEntry[]> {
    const transport = new StdioClientTransport({
        command: process.execPath,
        // STDIO_CONTRACT_DIST=1 checks the compiled build (what `npx` runs) instead of the sources.
        args: process.env.STDIO_CONTRACT_DIST === '1'
            ? [path.join(ROOT, 'dist/index.js')]
            : [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'src/index.ts')],
        cwd: ROOT,
        env: { PATH: process.env.PATH ?? '', ...env },
        stderr: 'ignore',
    });
    const client = new Client({ name: 'stdio-contract', version: '1.0.0' });
    await client.connect(transport);
    const out: ContractEntry[] = [];
    const rec = async (call: string, fn: () => Promise<unknown>) => {
        try {
            out.push({ call, result: normalize(await fn()) });
        } catch (e) {
            out.push({ call, result: { thrown: e instanceof Error ? e.message : String(e) } });
        }
    };
    let p = '';
    const tool = (name: string, args: Record<string, unknown> = {}) => () => client.callTool({ name: `${p}${name}`, arguments: args });

    try {
        await rec('initialize', async () => ({
            serverInfo: client.getServerVersion(),
            capabilities: client.getServerCapabilities(),
        }));
        await rec('tools/list', () => client.listTools());
        // The prefix (TOOL_PREFIX, or derived from DB_NAME) is itself part of the contract: recorded above.
        p = (await client.listTools()).tools.find((t) => t.name.endsWith('search_schema'))!.name.replace(/search_schema$/, '');
        await rec('prompts/list', () => client.listPrompts());
        await rec('resources/list', () => client.listResources());
        await rec('resources/templates/list', () => client.listResourceTemplates());

        await rec('search_schema hit', tool('search_schema', { query: 'orders' }));
        await rec('search_schema fuzzy', tool('search_schema', { query: 'custmer' }));
        await rec('search_schema miss', tool('search_schema', { query: 'zzqqxx' }));
        await rec('search_schema view', tool('search_schema', { query: 'customers_public' }));
        await rec('select', tool('execute_safe_query', { sql: 'SELECT id, name, tier FROM customers ORDER BY id LIMIT 3' }));
        await rec('select truncated', tool('execute_safe_query', { sql: 'SELECT id FROM customers ORDER BY id' }));
        await rec('select join', tool('execute_safe_query', { sql: 'SELECT c.name, o.status FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.id = 1 ORDER BY o.id' }));
        await rec('select empty', tool('execute_safe_query', { sql: 'SELECT id FROM customers WHERE id = -1' }));
        await rec('select full scan blocked', tool('execute_safe_query', { sql: "SELECT id FROM customers WHERE notes LIKE '%review%'" }));
        await rec('policy: LOAD_FILE', tool('execute_safe_query', { sql: "SELECT LOAD_FILE('/etc/passwd')" }));
        await rec('policy: information_schema', tool('execute_safe_query', { sql: 'SELECT table_name FROM information_schema.tables' }));
        await rec('policy: SHOW', tool('execute_safe_query', { sql: 'SHOW TABLES' }));
        await rec('policy: INTO OUTFILE', tool('execute_safe_query', { sql: "SELECT id INTO OUTFILE '/tmp/x' FROM customers" }));
        await rec('policy: executable comment', tool('execute_safe_query', { sql: 'SELECT /*!50000 1 */' }));
        await rec('write disabled', tool('execute_safe_query', { sql: "UPDATE customers SET name = 'x' WHERE id = 1" }));
        await rec('unknown column', tool('execute_safe_query', { sql: 'SELECT nope FROM customers WHERE id = 1' }));
        await rec('syntax error', tool('execute_safe_query', { sql: 'SELEC 1' }));
        await rec('explain', tool('explain_query', { sql: 'SELECT id FROM customers WHERE id = 1' }));
        await rec('explain non-select', tool('explain_query', { sql: 'DELETE FROM customers' }));
        await rec('update no-op', tool('execute_safe_query', { sql: "UPDATE test_permissions SET id = id WHERE id = -1" }));
        await rec('update without WHERE', tool('execute_safe_query', { sql: "UPDATE test_permissions SET id = id" }));
        await rec('show tables', tool('execute_safe_query', { sql: 'SHOW TABLES' }));
        await rec('prompt query_templates all', () => client.getPrompt({ name: `${p}query_templates`, arguments: {} }));
        await rec('complete template', () => client.complete({ ref: { type: 'ref/prompt', name: `${p}query_templates` }, argument: { name: 'query', value: 're' } }));
        await rec('ping', tool('ping'));
        await rec('refresh_schema', tool('refresh_schema'));
        await rec('prompt query_templates', () => client.getPrompt({ name: `${p}query_templates`, arguments: { query: 'revenue' } }));
        await rec('resource schema', () => client.readResource({ uri: 'mysql://schema' }));
        await rec('resource table', () => client.readResource({ uri: 'mysql://tables/customers' }));
        await rec('resource table missing', () => client.readResource({ uri: 'mysql://tables/zzqqxx' }));
        await rec('complete table name', () => client.complete({ ref: { type: 'ref/resource', uri: 'mysql://tables/{name}' }, argument: { name: 'name', value: 'ord' } }));
    } finally {
        await client.close();
    }
    return out;
}
