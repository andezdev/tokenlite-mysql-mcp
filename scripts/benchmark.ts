import { getEncoding } from "js-tiktoken";
import { jsonToCsv } from "../src/utils/csvFormatter.js";
import { pingDb, pool } from "../src/db/index.js";
import { buildSchemaGraph, schemaGraph } from "../src/db/schema.js";
import { handleSearchSchema } from "../src/tools/searchSchema.js";
import dotenv from "dotenv";

(dotenv.config as any)({ quiet: true });

const encoder = getEncoding("cl100k_base");

function countTokens(text: string): number {
    return encoder.encode(text).length;
}

function generateMockQueryData(rowCount: number): any[] {
    const data: any[] = [];
    for (let i = 1; i <= rowCount; i++) {
        data.push({
            id: i,
            customer_id: 100 + i,
            transaction_uuid: `tx_9a8b7c6d_${i}_2026`,
            amount: +(Math.random() * 500 + 10).toFixed(2),
            currency: "USD",
            payment_status: i % 7 === 0 ? "failed" : i % 3 === 0 ? "refunded" : "completed",
            gateway: i % 2 === 0 ? "stripe" : "paypal",
            ip_address: `192.168.1.${i}`,
            metadata: i % 4 === 0 ? "recurring_billing,tier_premium" : "one_time_purchase",
            created_at: "2026-05-31 12:42:00"
        });
    }
    return data;
}

// Generate 50 mock table names and basic structures
function generateMockSchema(): { allTablesDdl: string; targetTableContextDdl: string } {
    const tableNames = [
        "users", "user_profiles", "user_sessions", "user_permissions", "roles",
        "customers", "customer_addresses", "customer_billing", "organizations",
        "orders", "order_items", "order_meta", "invoices", "payments", "transactions",
        "products", "product_categories", "product_reviews", "product_inventory", "suppliers",
        "subscriptions", "plans", "coupons", "discounts", "usage_logs",
        "tickets", "ticket_replies", "ticket_attachments", "support_agents", "departments",
        "audit_logs", "activity_logs", "system_settings", "webhooks", "webhook_logs",
        "shipments", "shipment_tracking", "warehouses", "carriers", "delivery_methods",
        "marketing_campaigns", "leads", "contacts", "email_templates", "sent_emails",
        "reports", "analytics_daily", "analytics_monthly", "api_keys", "oauth_clients"
    ];

    // Generate average DDL (approx 600 characters per table)
    let totalDdlSize = 0;
    const ddls: Record<string, string> = {};

    for (const name of tableNames) {
        const ddl = `CREATE TABLE \`${name}\` (
  \`id\` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  \`org_id\` int(10) unsigned NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`status\` varchar(50) DEFAULT 'active',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_${name}_org\` (\`org_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n`;
        ddls[name] = ddl;
        totalDdlSize += ddl.length;
    }

    // Traditional MCP will dump all 50 tables
    const allTablesDdl = Object.values(ddls).join("\n");

    // TokenLite MCP will fetch a localized subgraph (Auto-Join Context)
    // Target Table: "orders"
    // Direct Parents (referred tables based on _id naming or FKs): "customers", "organizations"
    // Direct Children (tables referring to "orders"): "order_items", "order_meta", "payments", "invoices"
    const targetTable = "orders";
    const parents = ["customers", "organizations"];
    const children = ["order_items", "order_meta", "payments", "invoices"];

    let targetContext = `-- === MATCHED TABLE ===\n${ddls[targetTable]}\n`;
    for (const p of parents) {
        targetContext += `-- === RELATED TABLE (PARENT) ===\n${ddls[p]}\n`;
    }
    for (const c of children) {
        targetContext += `-- === RELATED TABLE (CHILD) ===\n${ddls[c]}\n`;
    }
    targetContext += `\n/* ⚠️ HEURISTIC GRAPH HINTS:\n` +
      `- \`orders\`.\`customer_id\` -> \`customers\`.\`id\`\n` +
      `- \`order_items\`.\`order_id\` -> \`orders\`.\`id\`\n*/\n`;

    return {
        allTablesDdl,
        targetTableContextDdl: targetContext
    };
}

async function runBenchmark() {
    console.log("==================================================");
    console.log("   TOKENLITE MYSQL MCP EMPIRICAL BENCHMARK       ");
    console.log("==================================================\n");

    const dbConnected = await pingDb();
    let isLiveMode = false;

    if (dbConnected) {
        console.log("📡 [Live Mode] Database connection detected.");
        try {
            await buildSchemaGraph();
            isLiveMode = schemaGraph.size > 0;
        } catch (e: any) {
            console.error("⚠️ Failed to build live schema graph. Falling back to Mock Mode.", e.message);
        }
    }

    if (!isLiveMode) {
        console.log("📦 [Mock Mode] Database not available. Using simulated Enterprise CRM schema (50 tables).\n");
    }

    // ----------------------------------------------------
    // SCHEMA DISCOVERY BENCHMARK
    // ----------------------------------------------------
    console.log("--- 1. SCHEMA DISCOVERY FOOTPRINT (Input Tokens) ---");
    let genericSchemaText = "";
    let tokenLiteSchemaText = "";

    if (isLiveMode) {
        // Collect all tables DDL
        const [tables] = await pool.query<any[]>(
            `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
            [process.env.DB_NAME]
        );
        const ddls: string[] = [];
        for (const row of tables) {
            const [createRows] = await pool.query<any[]>(`SHOW CREATE TABLE \`${row.TABLE_NAME}\``);
            if (createRows && createRows.length > 0) {
                ddls.push(createRows[0]['Create Table'] || createRows[0]['Create View']);
            }
        }
        genericSchemaText = ddls.join("\n");

        // Use TokenLite searchSchema tool on a major table (e.g. users or orders if they exist, or the first table found)
        const sampleTable = tables[0]?.TABLE_NAME || "users";
        const result = await handleSearchSchema({ query: sampleTable });
        tokenLiteSchemaText = result.content[0].text;
        console.log(`Live Target Table Analyzed: "${sampleTable}"`);
    } else {
        const mockSchema = generateMockSchema();
        genericSchemaText = mockSchema.allTablesDdl;
        tokenLiteSchemaText = mockSchema.targetTableContextDdl;
        console.log(`Mock Target Table Analyzed: "orders" (linked to customers, organizations, order_items, order_meta, payments, invoices)`);
    }

    const genericSchemaTokens = countTokens(genericSchemaText);
    const tokenLiteSchemaTokens = countTokens(tokenLiteSchemaText);
    const schemaSavings = ((genericSchemaTokens - tokenLiteSchemaTokens) / genericSchemaTokens * 100).toFixed(2);

    console.log(`Generic MCP Schema Dump Size:  ${genericSchemaText.length.toLocaleString()} chars | ${genericSchemaTokens.toLocaleString()} tokens`);
    console.log(`TokenLite Auto-Join Context:   ${tokenLiteSchemaText.length.toLocaleString()} chars | ${tokenLiteSchemaTokens.toLocaleString()} tokens`);
    console.log(`📉 SCHEMA INPUT SAVINGS:       ${schemaSavings}%\n`);

    // ----------------------------------------------------
    // QUERY RESULT DATA BENCHMARK
    // ----------------------------------------------------
    console.log("--- 2. QUERY RESULTS FOOTPRINT (Output Tokens) ---");
    const rowCounts = [10, 50, 100, 500];

    console.log("| Rows | JSON Chars | CSV Chars | JSON Tokens | CSV Tokens | Ahorro (%) |");
    console.log("| :--- | :--------- | :-------- | :---------- | :--------- | :--------- |");

    for (const count of rowCounts) {
        const rawData = generateMockQueryData(count);

        // Generic MCP output formatting (Pretty JSON)
        const jsonStr = JSON.stringify(rawData, null, 2);
        const jsonTokens = countTokens(jsonStr);

        // TokenLite CSV formatting
        const csvStr = jsonToCsv(rawData);
        const csvTokens = countTokens(csvStr);

        const savings = ((jsonTokens - csvTokens) / jsonTokens * 100).toFixed(2);

        console.log(`| ${String(count).padEnd(4)} | ${jsonStr.length.toLocaleString().padEnd(10)} | ${csvStr.length.toLocaleString().padEnd(8)} | ${jsonTokens.toLocaleString().padEnd(10)} | ${csvTokens.toLocaleString().padEnd(9)} | ${savings}% |`);
    }

    console.log("\n==================================================");
    console.log("   BENCHMARK COMPLETED SUCCESSFULLY              ");
    console.log("==================================================");
    
    if (isLiveMode) {
        await pool.end();
    }
}

runBenchmark().catch(console.error);
