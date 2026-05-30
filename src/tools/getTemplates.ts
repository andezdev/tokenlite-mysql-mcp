import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchTemplates } from "../db/metadata.js";

export function handleGetTemplates({ query }: { query?: string }) {
    const results = searchTemplates(query || "");

    if (results.length === 0) {
        return {
            content: [{ type: "text" as const, text: "No SQL templates found matching your query." }]
        };
    }

    let output = "--- PRE-APPROVED SQL TEMPLATES ---\n\n";
    for (const t of results) {
        output += `### ${t.name}\n`;
        output += `Description: ${t.description}\n`;
        output += `SQL:\n\`\`\`sql\n${t.sql}\n\`\`\`\n\n`;
    }

    return {
        content: [{ type: "text" as const, text: output }]
    };
}

export function registerGetTemplatesTool(server: McpServer) {
    server.tool(
        "get_query_templates",
        "NEVER write SQL for business metrics (like LTV, Revenue, Performance) manually. YOU MUST ALWAYS use this tool first to retrieve the official company SQL template. Pass a keyword to search, or leave empty to list all templates.",
        {
            query: z.string().optional().describe("Keyword to search for in templates (e.g., 'revenue', 'ltv')."),
        },
        handleGetTemplates
    );
}
