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
 * Parses the SQL query to AST, injects a LIMIT if missing, and returns the modified SQL.
 */
export function injectLimitAst(sql: string, maxLimit: number = 500): string {
    if (sql.trim().toUpperCase().startsWith('SHOW')) {
        return sql;
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

        if (ast.type !== 'select') {
            throw new OptimizerError("Security Error: Only SELECT or SHOW statements are allowed.");
        }

        if (!ast.limit) {
            ast.limit = {
                seperator: "",
                value: [
                    { type: 'number', value: maxLimit }
                ]
            };
        } else {
            // Check if existing limit exceeds maxLimit
            // @ts-ignore
            const limitValue = ast.limit.value[0]?.value;
            if (typeof limitValue === 'number' && limitValue > maxLimit) {
                // @ts-ignore
                ast.limit.value[0].value = maxLimit;
            }
        }

        return parser.sqlify(ast, astOpt);
    } catch (e: any) {
        if (e instanceof OptimizerError) {
            throw e;
        }
        throw new OptimizerError(`SQL Syntax Error or Unsupported Feature: ${e.message}`);
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
            // In standard EXPLAIN, row.type is the join type. 'ALL' means full table scan.
            if (row.type && row.type.toUpperCase() === 'ALL') {
                const estimatedRows = parseInt(row.rows, 10);
                if (!isNaN(estimatedRows) && estimatedRows > maxRows) {
                    throw new OptimizerError(`Full table scan detected on table '${row.table}'. Estimated rows: ${estimatedRows}. Please add an indexed filter (e.g., a specific ID) to your WHERE clause.`);
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
