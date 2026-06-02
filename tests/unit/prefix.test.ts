import { describe, it, expect, beforeEach, afterEach } from 'vitest';

function derivePrefix(): string {
    let prefix = process.env.TOOL_PREFIX;
    if (!prefix) {
        const dbName = process.env.DB_NAME;
        if (dbName) {
            prefix = `${dbName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_`;
        } else {
            const randomStr = Math.random().toString(36).substring(2, 6);
            prefix = `db_${randomStr}_`;
        }
    }
    return prefix;
}

describe('Tool prefix derivation', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.TOOL_PREFIX;
        delete process.env.DB_NAME;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('should use explicit TOOL_PREFIX when set', () => {
        process.env.TOOL_PREFIX = 'custom_';
        expect(derivePrefix()).toBe('custom_');
    });

    it('should derive prefix from DB_NAME when TOOL_PREFIX is not set', () => {
        process.env.DB_NAME = 'my_crm';
        expect(derivePrefix()).toBe('my_crm_');
    });

    it('should sanitize DB_NAME: lowercase and replace non-alphanumeric with underscore', () => {
        process.env.DB_NAME = 'CRM-Production';
        expect(derivePrefix()).toBe('crm_production_');
    });

    it('should sanitize DB_NAME with dots and spaces', () => {
        process.env.DB_NAME = 'my.db name';
        expect(derivePrefix()).toBe('my_db_name_');
    });

    it('should prefer TOOL_PREFIX over DB_NAME', () => {
        process.env.TOOL_PREFIX = 'override_';
        process.env.DB_NAME = 'ignored_db';
        expect(derivePrefix()).toBe('override_');
    });

    it('should generate random prefix when neither TOOL_PREFIX nor DB_NAME are set', () => {
        const prefix = derivePrefix();
        expect(prefix).toMatch(/^db_[a-z0-9]{4}_$/);
    });

    it('should generate different random prefixes on each call', () => {
        const a = derivePrefix();
        const b = derivePrefix();
        // Very unlikely to collide
        expect(a === b).toBe(false);
    });
});
