import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pool } from "../db/index.js";

interface PingResponse {
    status: "ok" | "error";
    server_version?: string;
    pool: {
        active: number;
        idle: number;
        queue: number;
    };
    error?: string;
}

export async function handlePing(): Promise<{
    content: { type: "text"; text: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}> {
    const rawPool = pool.pool as any;
    const poolInfo = {
        active: rawPool._allConnections?.length ?? 0,
        idle: rawPool._freeConnections?.length ?? 0,
        queue: rawPool._connectionQueue?.length ?? 0,
    };

    try {
        const [rows] = await pool.query<any[]>("SELECT VERSION() AS version");
        const response: PingResponse = {
            status: "ok",
            server_version: rows[0]?.version,
            pool: poolInfo,
        };
        return {
            content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
            structuredContent: response as unknown as Record<string, unknown>,
        };
    } catch (error: any) {
        const response: PingResponse = {
            status: "error",
            pool: poolInfo,
            error: error.message,
        };
        return {
            content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
            structuredContent: response as unknown as Record<string, unknown>,
            isError: true,
        };
    }
}

export const pingOutputSchema = {
    status: z.enum(["ok", "error"]).describe("Whether the database connection is healthy"),
    server_version: z.string().optional().describe("MySQL server version"),
    pool: z.object({
        active: z.number().describe("Active connections in the pool"),
        idle: z.number().describe("Idle connections in the pool"),
        queue: z.number().describe("Queued requests waiting for a connection"),
    }),
    error: z.string().optional().describe("Error message if status is 'error'"),
};

export function registerPingTool(server: McpServer, prefix: string = "") {
    server.registerTool(
        `${prefix}ping`,
        {
            description: "Health check: verifies the database connection is alive and returns pool stats and server version.",
            outputSchema: pingOutputSchema,
            annotations: {
                readOnlyHint: true,
                openWorldHint: false,
            },
        },
        handlePing
    );
}
