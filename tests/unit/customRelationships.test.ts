import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({ log: vi.fn() }));

describe('getCustomRelationships', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    async function loadWithMetadata(metadata: Record<string, any>) {
        const FAKE_PATH = '/fake/metadata.json';
        const fs = await import('fs');
        // Only fake the metadata file: other reads (e.g. the module loader reading source files
        // during the dynamic import below, as Node 24 does) must hit the real file system.
        const realExistsSync = fs.default.existsSync;
        const realReadFileSync = fs.default.readFileSync;
        vi.spyOn(fs.default, 'existsSync').mockImplementation(((p: any) =>
            p === FAKE_PATH ? true : realExistsSync(p)) as typeof fs.default.existsSync);
        vi.spyOn(fs.default, 'readFileSync').mockImplementation(((p: any, ...rest: any[]) =>
            p === FAKE_PATH ? JSON.stringify(metadata) : (realReadFileSync as any)(p, ...rest)) as typeof fs.default.readFileSync);

        process.env.MCP_METADATA_PATH = FAKE_PATH;
        const mod = await import('../../src/db/metadata.js');
        mod.initMetadata();
        return mod.getCustomRelationships();
    }

    it('should parse valid flat key-value relationships', async () => {
        const rels = await loadWithMetadata({
            '_relationships': {
                'orders.created_by': 'users.id',
                'categories.parent_id': 'categories.id',
            }
        });
        expect(rels.size).toBe(2);
        expect(rels.get('orders.created_by')).toBe('users.id');
        expect(rels.get('categories.parent_id')).toBe('categories.id');
    });

    it('should return empty map when no _relationships key', async () => {
        const rels = await loadWithMetadata({ 'orders.status': { 'pending': '...' } });
        expect(rels.size).toBe(0);
    });

    it('should ignore entries without dots', async () => {
        const rels = await loadWithMetadata({
            '_relationships': {
                'invalid_no_dot': 'users.id',
                'orders.ok': 'also_no_dot',
                'orders.created_by': 'users.id',
            }
        });
        expect(rels.size).toBe(1);
        expect(rels.has('invalid_no_dot')).toBe(false);
        expect(rels.has('orders.ok')).toBe(false);
    });

    it('should ignore non-string values', async () => {
        const rels = await loadWithMetadata({
            '_relationships': {
                'orders.created_by': 123,
                'orders.updated_by': 'users.id',
            }
        });
        expect(rels.size).toBe(1);
        expect(rels.has('orders.created_by')).toBe(false);
    });

    it('should return empty map when _relationships is an array', async () => {
        const rels = await loadWithMetadata({
            '_relationships': [{ source: 'a.b', target: 'c.d' }]
        });
        expect(rels.size).toBe(0);
    });
});
