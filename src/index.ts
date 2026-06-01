#!/usr/bin/env node
import { createServer } from "./server.js";
import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";
import { closePool } from "./db/index.js";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

async function main() {
    const server = await createServer();

    const transport = process.env.MCP_TRANSPORT || "stdio";

    if (transport === "http") {
        await startHttp(server);
    } else {
        await startStdio(server);
    }

    const cleanup = async () => {
        console.error("\n[tokenlite-mysql-mcp] Shutting down server...");
        await server.close();
        await closePool();
        process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
}

main().catch(console.error);
