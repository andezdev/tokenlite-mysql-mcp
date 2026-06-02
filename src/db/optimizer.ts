import pkg from 'node-sql-parser';
const { Parser } = pkg;
import { Pool } from 'mysql2/promise';

export class OptimizerError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
        super(message);
        this.name = 'OptimizerError';
        this.code = code;
    }
}

const parser = new Parser();
function getMaxRows(): number {
    return process.env.MCP_SAFE_QUERY_MAX_ROWS ? parseInt(process.env.MCP_SAFE_QUERY_MAX_ROWS, 10) : 1000;
}

function isBlockingEnabled(): boolean {
    return process.env.MCP_SAFE_QUERY_ENABLE_BLOCKING !== 'false';
}

/**
 * Parses the SQL query to AST, injects a LIMIT if missing for SELECTs, and returns the modified SQL and AST type.
 */
export function injectLimitAst(sql: string, maxLimit: number = 500): { sql: string; astType: string } {
    if (sql.trim().toUpperCase().startsWith('SHOW')) {
        return { sql, astType: 'show' };
    }

    try {
        const astOpt = { database: 'MySQL' };
        let ast = parser.astify(sql, astOpt);

        // AST can be an array if multiple statements are provided.
        if (Array.isArray(ast)) {
            if (ast.length > 1) {
                throw new OptimizerError("Security Error: Multiple statements are not allowed.");
            }
            ast = ast[0];
        }
        
        // @ts-ignore
        const type = ast.type?.toLowerCase();

        // Only inject LIMIT and sqlify if it's a SELECT query.
        // For DML/DDL, we just return the original SQL to avoid parser mangling.
        if (type === 'select') {
            const selectAst = ast as any;
            if (!selectAst.limit) {
                selectAst.limit = {
                    seperator: "",
                    value: [
                        { type: 'number', value: maxLimit }
                    ]
                };
            } else {
                const limitValue = selectAst.limit.value[0]?.value;
                if (typeof limitValue === 'number' && limitValue > maxLimit) {
                    selectAst.limit.value[0].value = maxLimit;
                }
            }
            return { sql: parser.sqlify(selectAst, astOpt), astType: type };
        }

        return { sql, astType: type };
    } catch (e: any) {
        if (e instanceof OptimizerError) {
            throw e;
        }
        throw new OptimizerError(`SQL Syntax Error or Unsupported Feature: ${e.message}`);
    }
}

const SAFE_TABLE_NAME = /^[a-zA-Z0-9_]+$/;

export async function getIndexHint(tableName: string, pool: Pool): Promise<string> {
    if (!tableName || !SAFE_TABLE_NAME.test(tableName)) {
        return 'Please add an indexed filter (e.g., a specific ID) to your WHERE clause.';
    }
    try {
        const [rows] = await pool.query<any[]>(`SHOW INDEX FROM \`${tableName}\``);
        const indexes = new Map<string, string[]>();
        for (const row of rows) {
            if (row.Key_name === 'PRIMARY') continue;
            const cols = indexes.get(row.Key_name) || [];
            cols.push(row.Column_name);
            indexes.set(row.Key_name, cols);
        }
        if (indexes.size === 0) {
            return 'No secondary indexes found on this table. Add a WHERE clause on the PRIMARY KEY, or ask the DBA to create an index.';
        }
        const parts = Array.from(indexes.entries())
            .map(([name, cols]) => `${name} (${cols.join(', ')})`);
        return `Available indexes: ${parts.join('; ')}. Add a WHERE clause using one of these indexed columns.`;
    } catch {
        return 'Please add an indexed filter (e.g., a specific ID) to your WHERE clause.';
    }
}

/**
 * Analyzes the query using EXPLAIN. If a Full Table Scan (type: ALL) is detected
 * on a table with more rows than MAX_ROWS, it blocks the query.
 */
export async function analyzeQueryPlan(sql: string, pool: Pool): Promise<void> {
    if (!isBlockingEnabled()) return;
    if (sql.trim().toUpperCase().startsWith('SHOW')) return;

    try {
        const [planRows] = await pool.query<any[]>(`EXPLAIN ${sql}`);
        const maxRows = getMaxRows();
        
        for (const row of planRows) {
            if (row.type && row.type.toUpperCase() === 'ALL') {
                const estimatedRows = parseInt(row.rows, 10);
                if (!isNaN(estimatedRows) && estimatedRows > maxRows) {
                    const indexHint = await getIndexHint(row.table, pool);
                    throw new OptimizerError(
                        `Full table scan detected on table '${row.table}'. Estimated rows: ${estimatedRows}. ${indexHint}`
                    );
                }
            }
        }
    } catch (e: any) {
        if (e instanceof OptimizerError) {
            throw e;
        }
        throw new OptimizerError(`Query Analysis Error: ${e.message}`, e.code);
    }
}
