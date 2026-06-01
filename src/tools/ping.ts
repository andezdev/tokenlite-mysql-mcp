import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export async function handlePing(): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
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
        };
    } catch (error: any) {
        const response: PingResponse = {
            status: "error",
            pool: poolInfo,
            error: error.message,
        };
        return {
            content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
            isError: true,
        };
    }
}

export function registerPingTool(server: McpServer, prefix: string = "") {
    server.tool(
        `${prefix}ping`,
        "Health check: verifies the database connection is alive and returns pool stats and server version.",
        {},
        {
            readOnlyHint: true,
            openWorldHint: false,
        },
        handlePing
    );
}
