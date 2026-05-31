# TokenLite MySQL MCP

[![npm version](https://badge.fury.io/js/@andezdev%2Ftokenlite-mysql-mcp.svg)](https://badge.fury.io/js/@andezdev%2Ftokenlite-mysql-mcp)

A robust and secure MySQL database server implemented under Anthropic's **Model Context Protocol (MCP)**. 
Designed specifically to solve the shortcomings of current generic MCP servers through **Graceful Degradation, Active Performance Protection, and Aggressive Token Optimization**.

---

## 🌟 Core Pillars

1. **Safe-Query Optimizer (AST & EXPLAIN)**: Protects production databases by pre-analyzing queries. Blocks unindexed Full Table Scans that exceed configurable thresholds and injects strict `LIMIT` clauses automatically at the AST level.
2. **Granular AST-Based Write Permissions**: By default, TokenLite is 100% Read-Only. You can surgically enable specific write operations (INSERT, UPDATE, DELETE, DDL) via environment variables. The firewall uses strict AST parsing to prevent SQL injection and comment-bypass attacks, and strictly prohibits privilege escalation commands (like `GRANT` or `CALL`).
3. **Business Intelligence Injection**: Bridges the gap between raw data and company logic. Automatically attaches semantic dictionaries (`metadata.json`) to database schema exploration, and exposes Semantic Templates via the official **MCP Prompts API** (`templates.json`) so the LLM uses pre-approved analytical queries instead of hallucinating them.
4. **Graph-Based Semantic Schema**: Avoids sending giant schemas to the LLM that saturate the context window. When a table is searched, the engine uses heuristics to deduce implicit relationships and packages the exact "Auto-Join Context".
5. **CSV Token Compression**: Database results are efficiently transformed into tabular CSV markdown, saving up to 60% of Output Tokens compared to verbose JSON.

---

## 📋 Requirements

- Node.js v20 or higher
- MySQL 5.7 or higher (MySQL 8.0+ recommended)
- A MySQL user with `SELECT` and `SHOW VIEW` privileges.

---

## 🚀 Installation & Usage

You can use this MCP server with any compatible client. Below are the configurations for the most popular ones.

### 1. Claude Desktop

Edit your `claude_desktop_config.json` (usually located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) and add the following:

**Using NPX (Recommended)**
```json
{
  "mcpServers": {
    "tokenlite-mysql": {
      "command": "npx",
      "args": [
        "-y",
        "@andezdev/tokenlite-mysql-mcp"
      ],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "your_db_user",
        "DB_PASSWORD": "your_password",
        "DB_NAME": "your_database",
        "MCP_SAFE_QUERY_MAX_ROWS": "1000",
        "MCP_SAFE_QUERY_ENABLE_BLOCKING": "true"
      }
    }
  }
}
```

### 2. Claude Code (CLI)

You can easily integrate this server globally into Claude Code:

```bash
claude mcp add tokenlite_mysql \
  -e DB_HOST="127.0.0.1" \
  -e DB_PORT="3306" \
  -e DB_USER="root" \
  -e DB_PASSWORD="your_password" \
  -e DB_NAME="your_database" \
  -- npx -y @andezdev/tokenlite-mysql-mcp
```

### 3. Cursor IDE

To use within Cursor IDE:
1. Open Cursor Settings > Features > MCP.
2. Click **+ Add New MCP Server**.
3. Set the Type to `command`.
4. Name it `tokenlite-mysql`.
5. Set the command to:
   ```bash
   npx -y @andezdev/tokenlite-mysql-mcp
   ```
*(Note: Cursor handles environment variables directly in the IDE UI, make sure to add your DB credentials there).*

---

## ⚙️ Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_HOST` | MySQL Host address | `localhost` | No |
| `DB_PORT` | MySQL Port | `3306` | No |
| `DB_USER` | MySQL Username | `root` | No |
| `DB_PASSWORD` | MySQL Password | `''` | No |
| `DB_NAME` | MySQL Database name | `test` | Yes |
| `MCP_SAFE_QUERY_MAX_ROWS` | Threshold for EXPLAIN to block unindexed Full Table Scans. | `1000` | No |
| `MCP_SAFE_QUERY_ENABLE_BLOCKING`| Enable or disable the EXPLAIN guardrail. | `true` | No |
| `MCP_METADATA_PATH` | Absolute path to your custom `metadata.json` dictionary. | (Disabled) | No |
| `MCP_TEMPLATES_PATH` | Absolute path to your custom `templates.json` queries. | (Disabled) | No |
| `TOOL_PREFIX` | Prefix for tool names (useful when running multiple instances). | Random (e.g., `db_a1b2_`) | No |
| `ALLOW_INSERT_OPERATION` | Enable `INSERT` and `REPLACE` queries. | `false` | No |
| `ALLOW_UPDATE_OPERATION` | Enable `UPDATE` queries. | `false` | No |
| `ALLOW_DELETE_OPERATION` | Enable `DELETE` and `TRUNCATE` queries. | `false` | No |
| `ALLOW_DDL_OPERATION` | Enable Data Definition Language (`CREATE`, `ALTER`, `DROP`, `RENAME`). | `false` | No |

---

## 🛡️ Business Intelligence Features (Opt-in)

TokenLite can teach the LLM about your company's business rules. To enable this, map the absolute paths of two JSON files via `.env` or your MCP client config:

### `metadata.json` (Semantic Dictionary)
Translate integer statuses or internal jargon so the LLM understands the data.
```json
{
  "orders.status": {
    "pending": "The order is waiting for payment validation",
    "shipped": "The order has left the warehouse"
  }
}
```

### `templates.json` (Pre-approved SQL)
Stop the LLM from hallucinating complex metrics by providing vetted templates.
```json
[
  {
    "name": "Customer Lifetime Value (LTV)",
    "description": "Calculates total revenue generated by delivered orders per customer.",
    "sql": "SELECT c.id, SUM(oi.price) FROM customers c JOIN orders o... WHERE o.status='delivered'"
  }
]
```

---

## 📈 Benchmarks & Token Savings

TokenLite includes an automated, precise benchmark suite using official `cl100k_base` tokenization (matching models like Claude 3.5 Sonnet and GPT-4) to measure efficiency improvements.

To run the benchmark in your own environment:
```bash
npm run benchmark
```

### 1. Schema Discovery (Input Tokens)
Traditional MCP servers dump the entire schema to the LLM. For large databases, this consumes thousands of input tokens on every turn. TokenLite's relational graph serves a localized **Auto-Join Context** (target table + direct parent tables + direct child tables).

*   **Generic MCP Schema Dump:** 611 tokens
*   **TokenLite Relational Graph:** 252 tokens
*   **📉 Schema Input Savings:** **58.7%** (up to **90%** on larger enterprise schemas)

### 2. Query Result Payloads (Output Tokens)
TokenLite converts raw database rows to a dense, structured CSV layout. This avoids JSON syntax overhead (brackets, braces, repeated keys) and compresses the output payload returned to the LLM.

| Rows Returned | Generic MCP JSON (Tokens) | TokenLite CSV (Tokens) | 📉 Output Savings (%) |
| :--- | :--- | :--- | :--- |
| **10 rows** | 1,153 | 590 | **48.8%** |
| **50 rows** | 5,764 | 2,861 | **50.3%** |
| **100 rows** | 11,527 | 5,699 | **50.5%** |
| **500 rows** | 57,635 | 28,407 | **50.7%** |

---

## 🐛 Troubleshooting

**Error: `OptimizerError: Full table scan detected...`**
The LLM attempted to execute a query that requires scanning thousands of rows without using an index. 
*Solution*: The LLM will automatically see this error and try to rewrite the query with an indexed `WHERE` clause. If you truly need to scan the whole table, increase `MCP_SAFE_QUERY_MAX_ROWS` in your config.

**Error: `calling "initialize": invalid character...`**
This means the MCP JSON-RPC protocol crashed. Ensure you are passing the correct DB credentials and that the database is running and accessible from the machine where the MCP server runs.

---
*Built for the AI Engineering era.*
