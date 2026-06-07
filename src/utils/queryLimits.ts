const DEFAULT_EXPLAIN_MAX_SCAN_ROWS = 1000;
const DEFAULT_QUERY_ROW_LIMIT = 500;

/**
 * Max estimated rows MySQL may scan (EXPLAIN type: ALL) before blocking the query.
 * Prefer MCP_EXPLAIN_MAX_SCAN_ROWS. MCP_SAFE_QUERY_MAX_ROWS is a deprecated alias.
 */
export function getExplainMaxScanRows(): number {
    const value = process.env.MCP_EXPLAIN_MAX_SCAN_ROWS ?? process.env.MCP_SAFE_QUERY_MAX_ROWS;
    if (!value) {
        return DEFAULT_EXPLAIN_MAX_SCAN_ROWS;
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? DEFAULT_EXPLAIN_MAX_SCAN_ROWS : parsed;
}

/**
 * Max rows returned for SELECT queries. Injected as LIMIT at the AST level
 * and used for the truncation footer in CSV output.
 */
export function getQueryRowLimit(): number {
    const value = process.env.MCP_QUERY_ROW_LIMIT;
    if (!value) {
        return DEFAULT_QUERY_ROW_LIMIT;
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? DEFAULT_QUERY_ROW_LIMIT : parsed;
}
