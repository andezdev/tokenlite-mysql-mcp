import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { schemaGraph, getTableDDL } from "../db/schema.js";
import { getTableSemantics } from "../db/metadata.js";

export function registerTableResources(server: McpServer) {
    // List all available tables
    server.resource(
        "schema",
        "mysql://schema",
        { description: "Lists all available tables in the database schema" },
        async (uri) => {
            const tables = Array.from(schemaGraph.keys());
            if (tables.length === 0) {
                return {
                    contents: [{
                        uri: uri.href,
                        text: "Schema Graph is empty. Make sure the database is connected."
                    }]
                };
            }
            return {
                contents: [{
                    uri: uri.href,
                    text: `Available tables in the database:\n\n${tables.map(t => `- ${t}`).join('\n')}`
                }]
            };
        }
    );

    // DDL for a specific table
    server.resource(
        "table",
        new ResourceTemplate("mysql://tables/{name}", { list: undefined }),
        { description: "Exposes the SQL DDL and semantic dictionary of a specific table" },
        async (uri, { name }) => {
            const tableName = typeof name === 'string' ? name : String(name);
            const ddl = await getTableDDL(tableName);
            
            if (!ddl) {
                return {
                    contents: [{
                        uri: uri.href,
                        text: `Table '${tableName}' not found or could not fetch DDL.`
                    }]
                };
            }

            let output = `-- === TABLE: ${tableName} ===\n${ddl};\n`;
            
            // Append Semantics if available
            const semantics = getTableSemantics(tableName);
            if (Object.keys(semantics).length > 0) {
                output += `\n/* SEMANTIC DICTIONARY:\n`;
                output += JSON.stringify(semantics, null, 2);
                output += `\n*/\n`;
            }

            return {
                contents: [{
                    uri: uri.href,
                    text: output
                }]
            };
        }
    );
}
