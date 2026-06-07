import { describe, it, expect, afterEach } from 'vitest';
import { getExplainMaxScanRows, getQueryRowLimit } from '../../src/utils/queryLimits.js';

describe('queryLimits env parsing', () => {
    afterEach(() => {
        delete process.env.MCP_EXPLAIN_MAX_SCAN_ROWS;
        delete process.env.MCP_SAFE_QUERY_MAX_ROWS;
        delete process.env.MCP_QUERY_ROW_LIMIT;
    });

    it('should default explain max scan rows to 1000', () => {
        expect(getExplainMaxScanRows()).toBe(1000);
    });

    it('should prefer MCP_EXPLAIN_MAX_SCAN_ROWS over deprecated alias', () => {
        process.env.MCP_EXPLAIN_MAX_SCAN_ROWS = '2500';
        process.env.MCP_SAFE_QUERY_MAX_ROWS = '9999';
        expect(getExplainMaxScanRows()).toBe(2500);
    });

    it('should fall back to MCP_SAFE_QUERY_MAX_ROWS when new name is unset', () => {
        process.env.MCP_SAFE_QUERY_MAX_ROWS = '3000';
        expect(getExplainMaxScanRows()).toBe(3000);
    });

    it('should default query row limit to 500', () => {
        expect(getQueryRowLimit()).toBe(500);
    });

    it('should read MCP_QUERY_ROW_LIMIT', () => {
        process.env.MCP_QUERY_ROW_LIMIT = '1200';
        expect(getQueryRowLimit()).toBe(1200);
    });
});
