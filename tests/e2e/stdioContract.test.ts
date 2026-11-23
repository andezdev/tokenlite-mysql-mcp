// Contract test: the stdio server must keep behaving exactly as the recorded fixture. Any diff here is a
// user-visible change for stdio users and must be intentional (see stdioContract.ts to regenerate).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureStdioContract } from './stdioContract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(HERE, `__fixtures__/stdio-contract.${name}.json`);
const DOCKER = path.resolve(HERE, '../../docker');

const ENV = {
    DB_HOST: process.env.DB_HOST || '127.0.0.1',
    DB_PORT: process.env.DB_PORT || '3307',
    // Fixed fixture account (docker/init.sql), not DB_USER: CI runs the suite as root, and the contract
    // must be recorded and checked with the same privileges everywhere.
    DB_USER: 'mcp_test',
    DB_PASSWORD: 'mcp_password',
    DB_NAME: 'mcp_test_db',
    TOOL_PREFIX: 'shop_',
    MCP_QUERY_ROW_LIMIT: '5',
    MCP_RATE_LIMIT_RPM: '0',
};

const SCENARIOS: Record<string, Record<string, string>> = {
    // Defaults: read-only, no metadata/templates
    default: ENV,
    // Metadata + templates loaded, writes enabled (on the table the test user may write), SHOW allowed
    configured: {
        ...ENV,
        TOOL_PREFIX: '',
        MCP_METADATA_PATH: path.join(DOCKER, 'metadata.json'),
        MCP_TEMPLATES_PATH: path.join(DOCKER, 'templates.json'),
        ALLOW_UPDATE_OPERATION: 'true',
        MCP_ALLOW_SHOW: 'true',
        MCP_SAFE_QUERY_ENABLE_BLOCKING: 'false',
    },
};

describe('stdio contract', () => {
    it.each(Object.keys(SCENARIOS))('%s: matches the recorded fixture', async (name) => {
        const FIXTURE = fixture(name);
        const actual = await captureStdioContract(SCENARIOS[name]!);
        if (process.env.UPDATE_STDIO_CONTRACT === '1') {
            fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
            fs.writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + '\n');
        }
        expect(fs.existsSync(FIXTURE), 'missing fixture: run with UPDATE_STDIO_CONTRACT=1 on a known-good commit').toBe(true);
        const expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
        expect(actual.map((e) => e.call)).toEqual(expected.map((e: { call: string }) => e.call));
        for (let i = 0; i < expected.length; i++) {
            expect(actual[i], `call: ${expected[i].call}`).toEqual(expected[i]);
        }
    }, 60_000);
});
