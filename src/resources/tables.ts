import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { schemaGraph, getTableDDL } from "../db/schema.js";
import { getTableSemantics } from "../db/metadata.js";
import { completeTableNames } from "../utils/tableCompletions.js";
import { log } from "../utils/logger.js";

const subscribedUris = new Set<string>();

export function getSubscribedUris(): ReadonlySet<string> {
    return subscribedUris;
}

export function registerTableResources(server: McpServer) {
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

    server.resource(
        "table",
        new ResourceTemplate("mysql://tables/{name}", {
            list: undefined,
            complete: {
                name: (value) => completeTableNames(value),
            },
        }),
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

            const semantics = getTableSemantics(tableName);
            if (Object.keys(semantics).length > 0) {
                output += `\n/* SEMANTIC DICTIONARY:\n`;
                output += JSON.stringify(semantics);
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

    server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
        const uri = request.params.uri;
        subscribedUris.add(uri);
        log("debug", `Client subscribed to resource: ${uri}`, "resources");
        return {};
    });

    server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
        const uri = request.params.uri;
        subscribedUris.delete(uri);
        log("debug", `Client unsubscribed from resource: ${uri}`, "resources");
        return {};
    });
}

export async function notifyResourceSubscribers(server: McpServer): Promise<void> {
    for (const uri of subscribedUris) {
        try {
            await server.server.sendResourceUpdated({ uri });
        } catch (e) {
            log("warning", `Failed to send resource update for ${uri}: ${e instanceof Error ? e.message : String(e)}`, "resources");
        }
    }
    if (subscribedUris.size > 0) {
        log("info", `Notified ${subscribedUris.size} resource subscriber(s) of schema change.`, "resources");
    }
}
