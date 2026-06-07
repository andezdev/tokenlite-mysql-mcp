import { getEncoding } from "js-tiktoken";
import { jsonToCsv } from "../src/utils/csvFormatter.js";
import { pool } from "../src/db/index.js";
import { buildSchemaGraph, schemaGraph } from "../src/db/schema.js";
import { handleSearchSchema } from "../src/tools/searchSchema.js";
import dotenv from "dotenv";

(dotenv.config as any)({ quiet: true });

const encoder = getEncoding("o200k_base");

function countTokens(text: string): number {
    return encoder.encode(text).length;
}

function generateMockQueryData(rowCount: number): any[] {
    const data: any[] = [];
    const descriptions = [
        "Premium enterprise subscription — annual billing cycle",
        "Refund processed",
        "",
        "One-time purchase, promotional discount applied (SUMMER2026)",
        "B2B invoice, net-30 terms",
        "Chargeback dispute pending review by finance team",
        "Trial conversion",
        "Gift card redemption, remaining balance: $12.50",
    ];
    for (let i = 1; i <= rowCount; i++) {
        data.push({
            id: i,
            customer_id: i % 10 === 0 ? null : 100 + i,
            transaction_uuid: `tx_9a8b7c6d_${i}_2026`,
            amount: i % 15 === 0 ? null : +(Math.random() * 500 + 10).toFixed(2),
            currency: "USD",
            payment_status: i % 7 === 0 ? "failed" : i % 3 === 0 ? "refunded" : "completed",
            gateway: i % 2 === 0 ? "stripe" : "paypal",
            ip_address: `192.168.${Math.floor(i / 256)}.${i % 256}`,
            description: i % 5 === 0 ? null : descriptions[i % descriptions.length],
            created_at: "2026-05-31 12:42:00"
        });
    }
    return data;
}

function generateStandardMcpSchema(): string {
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

    const columnTemplates = [
        { COLUMN_NAME: "id", DATA_TYPE: "bigint", IS_NULLABLE: "NO", COLUMN_KEY: "PRI", EXTRA: "auto_increment" },
        { COLUMN_NAME: "org_id", DATA_TYPE: "int", IS_NULLABLE: "NO", COLUMN_KEY: "MUL", EXTRA: "" },
        { COLUMN_NAME: "name", DATA_TYPE: "varchar", IS_NULLABLE: "NO", COLUMN_KEY: "", EXTRA: "" },
        { COLUMN_NAME: "status", DATA_TYPE: "varchar", IS_NULLABLE: "YES", COLUMN_KEY: "", EXTRA: "" },
        { COLUMN_NAME: "created_at", DATA_TYPE: "timestamp", IS_NULLABLE: "NO", COLUMN_KEY: "", EXTRA: "" },
        { COLUMN_NAME: "updated_at", DATA_TYPE: "timestamp", IS_NULLABLE: "YES", COLUMN_KEY: "", EXTRA: "" },
    ];

    const allTablesJson: any[] = [];
    for (const table of tableNames) {
        for (const col of columnTemplates) {
            allTablesJson.push({ TABLE_NAME: table, ...col });
        }
    }

    return JSON.stringify(allTablesJson, null, 2);
}

function generateTokenLiteMockSchema(): string {
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

    const ddls: Record<string, string> = {};
    for (const name of tableNames) {
        ddls[name] = `CREATE TABLE \`${name}\` (
  \`id\` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  \`org_id\` int(10) unsigned NOT NULL,
  \`name\` varchar(255) NOT NULL,
  \`status\` varchar(50) DEFAULT 'active',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_${name}_org\` (\`org_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
    }

    const target = "orders";
    const parents = ["customers", "organizations"];
    const children = ["order_items", "order_meta", "payments", "invoices"];

    let context = `-- === MATCHED TABLE ===\n${ddls[target]}\n`;
    for (const p of parents) {
        context += `\n-- === RELATED TABLE (PARENT) ===\n${ddls[p]}\n`;
    }
    for (const c of children) {
        context += `\n-- === RELATED TABLE (CHILD) ===\n${ddls[c]}\n`;
    }
    context += `\n/* HEURISTIC GRAPH HINTS:\n` +
        `- \`orders\`.\`customer_id\` -> \`customers\`.\`id\`\n` +
        `- \`order_items\`.\`order_id\` -> \`orders\`.\`id\`\n*/\n`;

    return context;
}

async function runBenchmark() {
    console.log("==================================================");
    console.log("   TOKENLITE MYSQL MCP EMPIRICAL BENCHMARK");
    console.log("   Tokenizer: o200k_base (GPT-4o/GPT-5)");
    console.log("==================================================\n");
    console.log("Note: Token counts are approximate. Claude 4.x uses a");
    console.log("proprietary tokenizer; actual counts may vary slightly.\n");

    let dbConnected = false;
    try {
        await pool.query('SELECT 1');
        dbConnected = true;
    } catch {
        dbConnected = false;
    }
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

    // ---- SCHEMA DISCOVERY BENCHMARK ----
    console.log("--- 1. SCHEMA DISCOVERY FOOTPRINT (Input Tokens) ---");
    console.log("Baseline: Standard MCP Pattern (information_schema columns as pretty-printed JSON for all tables)");
    console.log("TokenLite: Graph-based Auto-Join Context (target table + 1-hop parents/children as DDL)\n");

    let baselineSchemaText = "";
    let tokenLiteSchemaText = "";

    if (isLiveMode) {
        const [tables] = await pool.query<any[]>(
            `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
            [process.env.DB_NAME]
        );

        const [allColumns] = await pool.query<any[]>(
            `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
             FROM information_schema.columns WHERE TABLE_SCHEMA = ?`,
            [process.env.DB_NAME]
        );
        baselineSchemaText = JSON.stringify(allColumns, null, 2);

        const sampleTable = tables[0]?.TABLE_NAME || "users";
        const result = await handleSearchSchema({ query: sampleTable });
        tokenLiteSchemaText = result.content[0].text;
        console.log(`Live Target Table Analyzed: "${sampleTable}"`);
    } else {
        baselineSchemaText = generateStandardMcpSchema();
        tokenLiteSchemaText = generateTokenLiteMockSchema();
        console.log(`Mock Target Table Analyzed: "orders" (linked to customers, organizations, order_items, order_meta, payments, invoices)`);
    }

    const baselineSchemaTokens = countTokens(baselineSchemaText);
    const tokenLiteSchemaTokens = countTokens(tokenLiteSchemaText);
    const schemaSavings = ((baselineSchemaTokens - tokenLiteSchemaTokens) / baselineSchemaTokens * 100).toFixed(2);

    console.log(`Standard MCP Pattern:        ${baselineSchemaText.length.toLocaleString()} chars | ${baselineSchemaTokens.toLocaleString()} tokens`);
    console.log(`TokenLite Auto-Join Context:  ${tokenLiteSchemaText.length.toLocaleString()} chars | ${tokenLiteSchemaTokens.toLocaleString()} tokens`);
    console.log(`📉 SCHEMA INPUT SAVINGS:      ${schemaSavings}%\n`);

    // ---- QUERY RESULTS BENCHMARK ----
    console.log("--- 2. QUERY RESULTS FOOTPRINT (Output Tokens) ---");
    console.log("Baseline: Standard MCP Pattern (JSON.stringify with indent 2 + execution time metadata)");
    console.log("TokenLite: CSV markdown compression\n");

    const rowCounts = [10, 50, 100, 500];

    console.log("| Rows | Standard MCP (tokens) | TokenLite CSV (tokens) | Savings (%) |");
    console.log("| :--- | :-------------------- | :--------------------- | :---------- |");

    for (const count of rowCounts) {
        let rawData: any[];
        let baselineJsonStr: string;
        let tokenLiteCsvStr: string;

        if (isLiveMode) {
            const [tables] = await pool.query<any[]>(
                `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                 ORDER BY TABLE_ROWS DESC LIMIT 1`,
                [process.env.DB_NAME]
            );
            const tableName = tables[0]?.TABLE_NAME;
            if (tableName) {
                const [rows] = await pool.query<any[]>(`SELECT * FROM \`${tableName}\` LIMIT ${count}`);
                rawData = rows as any[];
            } else {
                rawData = generateMockQueryData(count);
            }
        } else {
            rawData = generateMockQueryData(count);
        }

        baselineJsonStr = JSON.stringify(rawData, null, 2) + "\n\nQuery execution time: 1.23 ms";
        tokenLiteCsvStr = jsonToCsv(rawData);

        const baselineTokens = countTokens(baselineJsonStr);
        const csvTokens = countTokens(tokenLiteCsvStr);
        const savings = ((baselineTokens - csvTokens) / baselineTokens * 100).toFixed(2);

        console.log(`| ${String(count).padEnd(4)} | ${String(baselineTokens.toLocaleString()).padEnd(21)} | ${String(csvTokens.toLocaleString()).padEnd(22)} | ${savings}% |`);
    }

    console.log("\n==================================================");
    console.log("   BENCHMARK COMPLETED SUCCESSFULLY");
    console.log("==================================================");

    if (isLiveMode) {
        await pool.end();
    }
}

runBenchmark().catch(console.error);
