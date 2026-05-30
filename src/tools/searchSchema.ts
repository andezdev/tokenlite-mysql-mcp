import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Fuse from "fuse.js";
import { pool } from "../db/index.js";
import { schemaGraph } from "../db/schema.js";

async function getTableDDL(tableName: string): Promise<string | null> {
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


export async function handleSearchSchema({ query }: { query: string }) {
    if (schemaGraph.size === 0) {
        return {
            content: [{ type: "text" as const, text: "Schema Graph is empty. Make sure the database is connected." }],
            isError: true
        };
    }

    // Search for the table
    const tableNodes = Array.from(schemaGraph.values());
    const fuse = new Fuse(tableNodes, {
        keys: ["name"],
        threshold: 0.4 // somewhat fuzzy
    });

    const results = fuse.search(query);
    if (results.length === 0) {
        return {
            content: [{ type: "text" as const, text: `No table found matching '${query}'. Use refresh_schema() if you believe it was recently added.` }],
            isError: true
        };
    }

    const targetTable = results[0].item;
    
    // Traversal: Find Parent tables (the tables targetTable points to)
    const parentTableNames = new Set<string>();
    const inferredHints: string[] = [];

    for (const fk of targetTable.foreignKeys) {
        parentTableNames.add(fk.referencedTable);
        if (fk.isHeuristic) {
            inferredHints.push(`/* INFERRED PARENT: \`${targetTable.name}\`.\`${fk.columnName}\` -> \`${fk.referencedTable}\`.\`${fk.referencedColumn}\` */`);
        }
    }

    // Traversal: Find Child tables (tables that point to targetTable)
    const childTableNames = new Set<string>();
    for (const node of tableNodes) {
        for (const fk of node.foreignKeys) {
            if (fk.referencedTable === targetTable.name) {
                childTableNames.add(node.name);
                if (fk.isHeuristic) {
                    inferredHints.push(`/* INFERRED CHILD: \`${node.name}\`.\`${fk.columnName}\` -> \`${targetTable.name}\`.\`${fk.referencedColumn}\` */`);
                }
            }
        }
    }

    // Fetch DDLs dynamically
    const tablesToFetch = [targetTable.name, ...parentTableNames, ...childTableNames];
    const ddls: string[] = [];

    for (const tableName of tablesToFetch) {
        const ddl = await getTableDDL(tableName);
        if (ddl) {
            // Only add the table name header if it's not the primary target
            let header = tableName === targetTable.name 
                ? `-- === MATCHED TABLE ===\n` 
                : `-- === RELATED TABLE ===\n`;
            ddls.push(header + ddl + ";\n");
        }
    }

    let output = ddls.join("\n");
    
    if (inferredHints.length > 0) {
        output += "\n-- === HEURISTIC GRAPH HINTS ===\n" + inferredHints.join("\n");
    }

    return {
        content: [{ type: "text" as const, text: output }]
    };
}

export function registerSearchSchemaTool(server: McpServer) {
    server.tool(
        "search_schema",
        "CRITICAL TOOL FOR SCHEMA EXPLORATION: Use this tool FIRST to understand the database structure. Searches for a table and returns its exact SQL DDL, along with the DDL of its direct parent and child tables (Auto-Join Context). Do NOT use execute_safe_query for schema exploration.",
        {
            query: z.string().describe("The name of the table or entity to search for (e.g. 'users', 'invoices')."),
        },
        handleSearchSchema
    );
}
