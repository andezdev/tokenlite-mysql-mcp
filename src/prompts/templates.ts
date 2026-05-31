import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchTemplates } from "../db/metadata.js";

export function registerTemplatesPrompt(server: McpServer, prefix: string = "") {
    server.prompt(
        `${prefix}query_templates`,
        "Official company SQL templates for business metrics. Use this as a starting point to avoid writing SQL from scratch.",
        {
            query: z.string().optional().describe("Keyword to search for in templates (e.g., 'revenue', 'ltv').")
        },
        ({ query }) => {
            const results = searchTemplates(query || "");

            if (results.length === 0) {
                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: "No SQL templates found matching your query."
                            }
                        }
                    ]
                };
            }

            let output = "--- PRE-APPROVED SQL TEMPLATES ---\n\n";
            for (const t of results) {
                output += `### ${t.name}\n`;
                output += `Description: ${t.description}\n`;
                output += `SQL:\n\`\`\`sql\n${t.sql}\n\`\`\`\n\n`;
            }

            return {
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: output
                        }
                    }
                ]
            };
        }
    );
}
