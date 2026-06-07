import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Fuse from "fuse.js";
import { schemaGraph, getTableDDL } from "../db/schema.js";
import { getTableSemantics, hasTemplatesLoaded } from "../db/metadata.js";
import { checkRateLimit } from "../utils/rateLimiter.js";


export const SEARCH_SCHEMA_CONTENT_ANNOTATIONS = { audience: ["assistant" as const], priority: 0.9 };

export async function handleSearchSchema({ query }: { query: string }) {
    checkRateLimit();

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
            const conf = fk.confidence != null ? ` (confidence: ${fk.confidence})` : '';
            inferredHints.push(`/* INFERRED PARENT${conf}: \`${targetTable.name}\`.\`${fk.columnName}\` -> \`${fk.referencedTable}\`.\`${fk.referencedColumn}\` */`);
        }
    }

    // Traversal: Find Child tables (tables that point to targetTable)
    const childTableNames = new Set<string>();
    for (const node of tableNodes) {
        for (const fk of node.foreignKeys) {
            if (fk.referencedTable === targetTable.name) {
                childTableNames.add(node.name);
                if (fk.isHeuristic) {
                    const conf = fk.confidence != null ? ` (confidence: ${fk.confidence})` : '';
                    inferredHints.push(`/* INFERRED CHILD${conf}: \`${node.name}\`.\`${fk.columnName}\` -> \`${targetTable.name}\`.\`${fk.referencedColumn}\` */`);
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
            let header = tableName === targetTable.name 
                ? `-- === MATCHED TABLE ===\n` 
                : `-- === RELATED TABLE ===\n`;
            
            let tableStr = header + ddl + ";\n";
            
            // Append Semantics
            const semantics = getTableSemantics(tableName);
            if (Object.keys(semantics).length > 0) {
                tableStr += `/* SEMANTIC DICTIONARY:\n`;
                tableStr += JSON.stringify(semantics);
                tableStr += `\n*/\n`;
            }
            
            ddls.push(tableStr);
        }
    }

    let output = ddls.join("\n");
    
    if (inferredHints.length > 0) {
        output += "\n-- === HEURISTIC GRAPH HINTS ===\n" + inferredHints.join("\n");
    }

    if (hasTemplatesLoaded()) {
        output += "\n\n/* ⚠️ CRITICAL REMINDER: If you are asked to calculate business metrics (LTV, revenue, etc.), DO NOT write the SQL manually. You MUST use the `query_templates` prompt first to fetch the official template. */";
    }

    return {
        content: [{ type: "text" as const, text: output, annotations: SEARCH_SCHEMA_CONTENT_ANNOTATIONS }]
    };
}

export function registerSearchSchemaTool(server: McpServer, prefix: string = "") {
    server.registerTool(
        `${prefix}search_schema`,
        {
            description: "CRITICAL TOOL FOR SCHEMA EXPLORATION: Use this FIRST before writing queries. Fuzzy-searches a table name and returns its DDL plus direct parent/child table DDLs (Auto-Join Context), inferred FK hints, and semantic dictionary entries from metadata.json when configured. If templates.json is loaded, reminds you to use the 'query_templates' prompt for business metrics. Do NOT use execute_safe_query for schema exploration.",
            inputSchema: {
                query: z.string().max(200).describe("The name of the table or entity to search for (e.g. 'users', 'invoices')."),
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        handleSearchSchema
    );
}
