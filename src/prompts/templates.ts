import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { getTemplateCompletionSuggestions, searchTemplates } from "../db/metadata.js";

export function registerTemplatesPrompt(server: McpServer, prefix: string = "") {
    server.prompt(
        `${prefix}query_templates`,
        "Returns pre-approved SQL templates for business metrics (requires templates.json via MCP_TEMPLATES_PATH). Use before writing analytical SQL from scratch. Execute the returned SQL via execute_safe_query.",
        {
            query: completable(
                z.string().optional().describe("Keyword to search for in templates (e.g., 'revenue', 'ltv')."),
                (value) => getTemplateCompletionSuggestions(String(value ?? ""))
            ),
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
