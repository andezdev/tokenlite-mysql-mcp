import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js";
import { pingDb } from "./db/index.js";

async function main() {
    const isDbAlive = await pingDb();
    if (!isDbAlive) {
        console.error("CRITICAL ERROR: Cannot connect to the database.");
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
