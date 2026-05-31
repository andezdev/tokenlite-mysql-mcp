import { pool, getDbName } from './index.js';
import { TableNode, ForeignKey } from './types.js';

export let schemaGraph = new Map<string, TableNode>();

/**
 * Retrieves the raw DDL (CREATE TABLE) statement for a given table.
 */
export async function getTableDDL(tableName: string): Promise<string | null> {
    try {
        const [rows] = await pool.query<any[]>(`SHOW CREATE TABLE \`${tableName}\``);
        if (rows && rows.length > 0) {
            return rows[0]['Create Table'] || rows[0]['Create View'];
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Connects to the database and builds the relational graph in-memory.
 * Optimized for low RAM usage by only extracting node names and edges (no DDL/Columns cached).
 */
export async function buildSchemaGraph(): Promise<void> {
    const dbName = getDbName();
    const newGraph = new Map<string, TableNode>();

    // Fetch all tables
    const [tables] = await pool.query<any[]>(
        `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [dbName]
    );

    const tableNames = new Set<string>();
    for (const row of tables) {
        tableNames.add(row.TABLE_NAME);
        newGraph.set(row.TABLE_NAME, {
            name: row.TABLE_NAME,
            foreignKeys: []
        });
    }

    // Fetch Explicit Foreign Keys
    const [fks] = await pool.query<any[]>(
        `SELECT 
            TABLE_NAME, 
            COLUMN_NAME, 
            REFERENCED_TABLE_NAME, 
            REFERENCED_COLUMN_NAME 
         FROM information_schema.key_column_usage 
         WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [dbName]
    );

    const explicitFkSignatures = new Set<string>();

    for (const row of fks) {
        const tableNode = newGraph.get(row.TABLE_NAME);
        if (tableNode) {
            tableNode.foreignKeys.push({
                columnName: row.COLUMN_NAME,
                referencedTable: row.REFERENCED_TABLE_NAME,
                referencedColumn: row.REFERENCED_COLUMN_NAME,
                isHeuristic: false
            });
            // Keep a signature to avoid duplicating with heuristics
            explicitFkSignatures.add(`${row.TABLE_NAME}.${row.COLUMN_NAME}`);
        }
    }

    // The Heuristic Engine: Fetch columns that end with '_id'
    // This is extremely lightweight because we filter at the DB engine level.
    const [idColumns] = await pool.query<any[]>(
        `SELECT TABLE_NAME, COLUMN_NAME 
         FROM information_schema.columns 
         WHERE TABLE_SCHEMA = ? AND COLUMN_NAME LIKE '%\\_id'`,
        [dbName]
    );

    for (const row of idColumns) {
        const tableName = row.TABLE_NAME;
        const columnName = row.COLUMN_NAME;
        const signature = `${tableName}.${columnName}`;

        if (explicitFkSignatures.has(signature)) {
            continue; // Already an explicit FK, skip heuristic
        }

        // Try to guess the target table name. e.g. 'company_id' -> 'company' or 'companies'
        const baseName = columnName.slice(0, -3); // remove '_id'
        
        let targetTable = null;
        if (tableNames.has(baseName)) {
            targetTable = baseName;
        } else if (tableNames.has(baseName + 's')) {
            targetTable = baseName + 's';
        } else if (tableNames.has(baseName + 'es')) {
            targetTable = baseName + 'es';
        } else if (baseName.endsWith('y') && tableNames.has(baseName.slice(0, -1) + 'ies')) {
            // company -> companies
            targetTable = baseName.slice(0, -1) + 'ies';
        }

        if (targetTable) {
            const tableNode = newGraph.get(tableName);
            if (tableNode) {
                tableNode.foreignKeys.push({
                    columnName: columnName,
                    referencedTable: targetTable,
                    referencedColumn: 'id', // assumption
                    isHeuristic: true
                });
            }
        }
    }

    schemaGraph = newGraph;
    console.error(`[tokenlite-mysql-mcp] Schema Graph built successfully. Indexed ${schemaGraph.size} tables.`);
}
