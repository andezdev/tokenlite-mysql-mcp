import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deriveToolPrefix } from '../../src/utils/toolPrefix.js';

describe('deriveToolPrefix', () => {
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
        expect(deriveToolPrefix()).toBe('custom_');
    });

    it('should derive prefix from DB_NAME when TOOL_PREFIX is not set', () => {
        process.env.DB_NAME = 'my_crm';
        expect(deriveToolPrefix()).toBe('my_crm_');
    });

    it('should sanitize DB_NAME: lowercase and replace non-alphanumeric with underscore', () => {
        process.env.DB_NAME = 'CRM-Production';
        expect(deriveToolPrefix()).toBe('crm_production_');
    });

    it('should sanitize DB_NAME with dots and spaces', () => {
        process.env.DB_NAME = 'my.db name';
        expect(deriveToolPrefix()).toBe('my_db_name_');
    });

    it('should prefer TOOL_PREFIX over DB_NAME', () => {
        process.env.TOOL_PREFIX = 'override_';
        process.env.DB_NAME = 'ignored_db';
        expect(deriveToolPrefix()).toBe('override_');
    });

    it('should generate random prefix when neither TOOL_PREFIX nor DB_NAME are set', () => {
        const prefix = deriveToolPrefix('abcd');
        expect(prefix).toBe('db_abcd_');
    });

    it('should generate different random prefixes when no suffix is provided', () => {
        const a = deriveToolPrefix();
        const b = deriveToolPrefix();
        expect(a === b).toBe(false);
    });
});
