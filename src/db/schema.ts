import { pool, getDbName } from './index.js';
import { TableNode, ForeignKey } from './types.js';
import { getCustomRelationships } from './metadata.js';
import { log } from '../utils/logger.js';

export let schemaGraph = new Map<string, TableNode>();

const DDL_CACHE_TTL_MS = parseInt(process.env.MCP_DDL_CACHE_TTL || '60', 10) * 1000;

interface DdlCacheEntry {
    ddl: string | null;
    expiresAt: number;
}

const ddlCache = new Map<string, DdlCacheEntry>();

export function invalidateDdlCache(): void {
    ddlCache.clear();
}

const SAFE_TABLE_NAME = /^[a-zA-Z0-9_]+$/;

export async function getTableDDL(tableName: string): Promise<string | null> {
    if (!SAFE_TABLE_NAME.test(tableName)) {
        return null;
    }

    const cached = ddlCache.get(tableName);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.ddl;
    }

    try {
        const [rows] = await pool.query<any[]>(`SHOW CREATE TABLE \`${tableName}\``);
        const ddl = (rows && rows.length > 0)
            ? (rows[0]['Create Table'] || rows[0]['Create View'])
            : null;

        ddlCache.set(tableName, { ddl, expiresAt: Date.now() + DDL_CACHE_TTL_MS });
        return ddl;
    } catch (e) {
        return null;
    }
}

export function resolveTargetTable(baseName: string, sourceTable: string, tableNames: Set<string>): string | null {
    // Self-reference (e.g., parent_id on categories → categories)
    if (tableNames.has(sourceTable) && (baseName === 'parent' || baseName === sourceTable.replace(/s$/, ''))) {
        return sourceTable;
    }
    if (tableNames.has(baseName)) return baseName;
    if (tableNames.has(baseName + 's')) return baseName + 's';
    if (tableNames.has(baseName + 'es')) return baseName + 'es';
    if (baseName.endsWith('y') && tableNames.has(baseName.slice(0, -1) + 'ies')) {
        return baseName.slice(0, -1) + 'ies';
    }
    return null;
}

interface PkColumnInfo {
    columnName: string;
    dataType: string;
    columnKey: string;
}

const CONFIDENCE_THRESHOLD = 70;

export function computeConfidence(
    sourceDataType: string | null,
    sourceColumnKey: string | null,
    targetPk: PkColumnInfo | undefined,
): number {
    let score = 40; // name match (already resolved if we're here)
    if (targetPk) {
        if (sourceDataType && sourceDataType === targetPk.dataType) score += 30;
        if (targetPk.columnKey === 'PRI') score += 20;
        else if (targetPk.columnKey === 'UNI') score += 15;
    }
    if (sourceColumnKey === 'MUL') score += 10;
    return score;
}

export async function buildSchemaGraph(): Promise<void> {
    const dbName = getDbName();
    const newGraph = new Map<string, TableNode>();

    // Query 1: Fetch all tables
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

    // Query 2: Fetch Explicit Foreign Keys
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
            explicitFkSignatures.add(`${row.TABLE_NAME}.${row.COLUMN_NAME}`);
        }
    }

    // Apply custom mappings from metadata.json (before heuristics)
    const customRelationships = getCustomRelationships();
    for (const [source, target] of customRelationships) {
        if (explicitFkSignatures.has(source)) continue;

        const [srcTable, srcColumn] = source.split('.');
        const [tgtTable, tgtColumn] = target.split('.');
        if (!srcTable || !srcColumn || !tgtTable || !tgtColumn) continue;

        const tableNode = newGraph.get(srcTable);
        if (tableNode && tableNames.has(tgtTable)) {
            tableNode.foreignKeys.push({
                columnName: srcColumn,
                referencedTable: tgtTable,
                referencedColumn: tgtColumn,
                isHeuristic: false,
            });
            explicitFkSignatures.add(source);
        }
    }

    // Query 3: Fetch _id columns AND PK/UNI columns in a single query
    const [columnsForHeuristic] = await pool.query<any[]>(
        `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY
         FROM information_schema.columns
         WHERE TABLE_SCHEMA = ? AND (COLUMN_NAME LIKE '%\\_id' OR COLUMN_KEY IN ('PRI', 'UNI'))`,
        [dbName]
    );

    const idColumns: typeof columnsForHeuristic = [];
    const pkLookup = new Map<string, PkColumnInfo>();

    for (const row of columnsForHeuristic) {
        // Collect PK/UNI info
        if (row.COLUMN_KEY === 'PRI' || row.COLUMN_KEY === 'UNI') {
            const existing = pkLookup.get(row.TABLE_NAME);
            if (!existing || (existing.columnKey !== 'PRI' && row.COLUMN_KEY === 'PRI')) {
                pkLookup.set(row.TABLE_NAME, {
                    columnName: row.COLUMN_NAME,
                    dataType: row.DATA_TYPE,
                    columnKey: row.COLUMN_KEY,
                });
            }
        }
        // Collect _id columns
        if (row.COLUMN_NAME.endsWith('_id')) {
            idColumns.push(row);
        }
    }

    // Heuristic Engine with confidence scoring
    for (const row of idColumns) {
        const tableName = row.TABLE_NAME;
        const columnName = row.COLUMN_NAME;
        const signature = `${tableName}.${columnName}`;

        if (explicitFkSignatures.has(signature)) continue;

        const baseName = columnName.slice(0, -3);
        const targetTable = resolveTargetTable(baseName, tableName, tableNames);
        if (!targetTable) continue;

        const targetPk = pkLookup.get(targetTable);
        const referencedColumn = targetPk?.columnName ?? 'id';

        const confidence = computeConfidence(
            row.DATA_TYPE ?? null,
            row.COLUMN_KEY ?? null,
            targetPk,
        );

        if (confidence < CONFIDENCE_THRESHOLD) continue;

        const tableNode = newGraph.get(tableName);
        if (tableNode) {
            tableNode.foreignKeys.push({
                columnName,
                referencedTable: targetTable,
                referencedColumn,
                isHeuristic: true,
                confidence,
            });
        }
    }

    invalidateDdlCache();
    schemaGraph = newGraph;
    log("info", `Schema Graph built successfully. Indexed ${schemaGraph.size} tables.`, "schema");
}
