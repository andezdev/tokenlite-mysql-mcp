import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeSafeQuery } from "../db/index.js";
import { jsonToCsv } from "../utils/csvFormatter.js";


export async function handleExecuteQuery({ sql }: { sql: string }) {
    try {
        const result = await executeSafeQuery(sql);
        
        // If it's a SELECT, result are rows
        if (Array.isArray(result)) {
            const csvData = jsonToCsv(result);
            return {
                content: [{ type: "text" as const, text: csvData }]
            };
        } 
        // If it's a DML/DDL operation, result is a ResultSetHeader object
        else {
            const header = result as any;
            const message = `Operation executed successfully.\nAffected rows: ${header.affectedRows || 0}` + 
                            (header.insertId ? `\nInsert ID: ${header.insertId}` : '') +
                            (header.changedRows ? `\nChanged rows: ${header.changedRows}` : '');
            return {
                content: [{ type: "text" as const, text: message }]
            };
        }
    } catch (error: any) {
        let errorMessage = error.name === 'OptimizerError' ? error.message : `Database Error: ${error.message}`;
        if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('Unknown column')) {
            errorMessage += `\n\nHint: If you believe this column exists, the DBA might have just added it. Please call the 'refresh_schema' tool and try again.`;
        }

        return {
            content: [{ type: "text" as const, text: errorMessage }],
            isError: true
        };
    }
}

export function registerExecuteQueryTool(server: McpServer, prefix: string = "") {
    const allowInsert = process.env.ALLOW_INSERT_OPERATION === 'true';
    const allowUpdate = process.env.ALLOW_UPDATE_OPERATION === 'true';
    const allowDelete = process.env.ALLOW_DELETE_OPERATION === 'true';
    const allowDdl = process.env.ALLOW_DDL_OPERATION === 'true';
    
    // If any write operation is enabled, this tool is no longer read-only
    const isReadOnly = !(allowInsert || allowUpdate || allowDelete || allowDdl); 
    
    server.tool(
        `${prefix}execute_safe_query`,
        "Executes a safe SELECT query on the database. Large results are automatically truncated. CRITICAL: NEVER use this tool (e.g., SHOW TABLES or querying information_schema) to understand the database structure. You MUST ALWAYS use the 'search_schema' tool first to understand the relationships and tables before writing any JOIN queries.",
        {
            sql: z.string().describe("SQL SELECT statement to execute."),
        },
        { readOnlyHint: isReadOnly },
        handleExecuteQuery
    );
}
