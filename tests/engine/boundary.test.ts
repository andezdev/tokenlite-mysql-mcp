// The engine (src/engine/**) must stay free of process.env, import-time side effects and MCP SDK
// dependencies, so that a multi-tenant host can create one engine per database user safely.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENGINE = path.join(ROOT, 'src/engine');
/** Modules outside src/engine that the engine may import: pure functions, no env, no state. */
const ALLOWED_LOCAL = new Set(['src/utils/csvFormatter.ts', 'src/utils/errorSanitizer.ts']);
const FORBIDDEN_PACKAGES = [/^@modelcontextprotocol\//, /^dotenv/];

function importsOf(file: string): string[] {
    const src = fs.readFileSync(file, 'utf8');
    return [...src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .map((m) => (m[1] ?? m[2])!);
}

/** All local files reachable from src/engine/index.ts. */
function engineGraph(): { local: Set<string>; packages: Set<string> } {
    const local = new Set<string>();
    const packages = new Set<string>();
    const todo = [path.join(ENGINE, 'index.ts')];
    while (todo.length) {
        const file = todo.pop()!;
        const rel = path.relative(ROOT, file);
        if (local.has(rel)) continue;
        local.add(rel);
        for (const spec of importsOf(file)) {
            if (spec.startsWith('.')) todo.push(path.resolve(path.dirname(file), spec.replace(/\.js$/, '.ts')));
            else packages.add(spec);
        }
    }
    return { local, packages };
}

describe('engine boundary', () => {
    it('no process.env anywhere under src/engine', () => {
        for (const f of fs.readdirSync(ENGINE)) {
            expect(fs.readFileSync(path.join(ENGINE, f), 'utf8'), f).not.toMatch(/process\.env/);
        }
    });

    it('only imports engine modules, pure utils and allowed packages', () => {
        const { local, packages } = engineGraph();
        for (const rel of local) {
            if (!rel.startsWith('src/engine/')) expect(ALLOWED_LOCAL.has(rel), rel).toBe(true);
        }
        for (const p of packages) {
            for (const re of FORBIDDEN_PACKAGES) expect(p, p).not.toMatch(re);
        }
        for (const rel of ALLOWED_LOCAL) expect(fs.readFileSync(path.join(ROOT, rel), 'utf8'), rel).not.toMatch(/process\.env|^import /m);
    });

    /** Imports `modulePath` in a fresh process (cwd with a .env file) and reports what it touched. */
    function probeImport(modulePath: string) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-import-'));
        fs.writeFileSync(path.join(dir, '.env'), 'ENGINE_IMPORT_CANARY=leaked\n');
        // Record every environment variable read while the module graph loads.
        const script = `
            const reads = new Set();
            const real = process.env;
            process.env = new Proxy(real, { get(t, k) { if (typeof k === 'string') reads.add(k); return Reflect.get(t, k); } });
            const mod = await import(${JSON.stringify(modulePath)});
            process.env = real;
            console.log(JSON.stringify({ canary: real.ENGINE_IMPORT_CANARY ?? null, reads: [...reads], exports: Object.keys(mod) }));
            process.exit(0);
        `;
        const scriptFile = path.join(dir, 'probe.mts');
        fs.writeFileSync(scriptFile, script);
        const out = execFileSync(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), scriptFile], {
            cwd: dir,
            env: { PATH: process.env.PATH ?? '' },
            encoding: 'utf8',
            timeout: 30_000,
        });
        fs.rmSync(dir, { recursive: true, force: true });
        const res = JSON.parse(out.trim().split('\n').pop()!);
        // Node/tsx internals (TZ, NODE_DEBUG...) are not ours; application variables are.
        return { ...res, appReads: (res.reads as string[]).filter((k) => /^(DB_|MYSQL_|MCP_|ALLOW_|TOOL_PREFIX|DOTENV)/.test(k)) };
    }

    it('importing the engine has no side effects (no .env loading, no application env reads)', () => {
        const res = probeImport(path.join(ENGINE, 'index.ts'));
        expect(res.canary).toBeNull();
        expect(res.appReads).toEqual([]);
        expect(res.exports).toContain('createEngine');
    }, 40_000);

    it('(control) the probe does detect the stdio modules reading the environment on import', () => {
        const res = probeImport(path.join(ROOT, 'src/db/index.ts'));
        expect(res.canary).toBe('leaked');
        expect(res.appReads).toEqual(expect.arrayContaining(['DB_HOST', 'DB_NAME']));
    }, 40_000);
});
