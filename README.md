# TokenLite MySQL MCP

[![npm version](https://badge.fury.io/js/@andezdev%2Ftokenlite-mysql-mcp.svg?icon=si%3Anpm)](https://badge.fury.io/js/@andezdev%2Ftokenlite-mysql-mcp)

A robust and secure MySQL database server implemented under Anthropic's **Model Context Protocol (MCP)**. 
Designed specifically to solve the shortcomings of current generic MCP servers through **Graceful Degradation, Active Performance Protection, and Aggressive Token Optimization**.

---

## 🌟 Core Pillars

1. **Safe-Query Optimizer (AST & EXPLAIN)**: Protects production databases by pre-analyzing queries. Blocks unindexed Full Table Scans that exceed configurable thresholds and injects strict `LIMIT` clauses automatically at the AST level.
2. **Granular AST-Based Write Permissions**: By default, TokenLite is 100% Read-Only. You can surgically enable specific write operations (INSERT, UPDATE, DELETE, DDL) via environment variables. The firewall uses strict AST parsing to prevent SQL injection and comment-bypass attacks, and strictly prohibits privilege escalation commands (like `GRANT` or `CALL`).
3. **Session-Level Defense in Depth**: If the server is configured in strict Read-Only mode (all write variables disabled), TokenLite injects `SET SESSION TRANSACTION READ ONLY` directly into the connection pool sockets. This guarantees that even if a theoretical bypass exists in the AST parser, the MySQL engine itself will physically reject any data modification.
4. **Business Intelligence Injection**: Bridges the gap between raw data and company logic. Automatically attaches semantic dictionaries (`metadata.json`) to database schema exploration, and exposes Semantic Templates via the official **MCP Prompts API** (`templates.json`) so the LLM uses pre-approved analytical queries instead of hallucinating them.
5. **Graph-Based Semantic Schema**: Avoids sending giant schemas to the LLM that saturate the context window. When a table is searched, the engine uses heuristics to deduce implicit relationships and packages the exact "Auto-Join Context".
6. **CSV Token Compression**: Database results are efficiently transformed into tabular CSV markdown, saving up to 60% of Output Tokens compared to verbose JSON.

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
| `MYSQL_QUERY_TIMEOUT` | Max execution time for a query (in ms). Aborts heavy queries to protect against DoS. | `15000` | No |
| `MYSQL_CONNECTION_LIMIT` | Max concurrent pool connections. | `10` | No |
| `MYSQL_CONNECT_TIMEOUT` | Max time to wait for a socket to establish (in ms). | `10000` | No |
| `MYSQL_RETRY_ATTEMPTS` | Max retries on transient connection errors (`ECONNREFUSED`, `PROTOCOL_CONNECTION_LOST`, etc.). | `3` | No |
| `MYSQL_RETRY_DELAY_MS` | Base delay (ms) for exponential backoff between retries (1s, 2s, 4s...). | `1000` | No |
| `MYSQL_QUEUE_LIMIT` | Max queued requests when all pool connections are busy. Prevents unbounded growth if MySQL is down. | `50` | No |
| `MCP_DDL_CACHE_TTL` | Time-to-live (in seconds) for cached DDL statements. Reduces latency on repeated `search_schema` calls. Invalidated by `refresh_schema`. | `60` | No |
| `MCP_LOG_LEVEL` | Minimum severity for MCP log notifications: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`. | `info` | No |
| `MCP_TRANSPORT` | Transport mode: `stdio` (default) or `http`. | `stdio` | No |
| `MCP_HTTP_PORT` | Port for HTTP transport. | `3000` | No |
| `MCP_HTTP_HOST` | Bind address for HTTP transport. | `127.0.0.1` | No |
| `MCP_HTTP_TOKEN` | Bearer token for HTTP authentication (disabled if not set). | (Disabled) | No |
| `MCP_HTTP_ALLOWED_ORIGINS` | Comma-separated list of allowed Origin hostnames for HTTP transport. | `localhost,127.0.0.1` | No |
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

TokenLite includes an automated benchmark suite using `o200k_base` tokenization (GPT-4o/GPT-5 standard) to measure efficiency improvements. Token counts are approximate — Claude 4.x uses a proprietary tokenizer; actual counts may vary slightly.

To run the benchmark in your own environment:
```bash
npm run benchmark
```

### Baseline: Standard MCP Pattern
The benchmark compares against the standard pattern used by generic MySQL MCP servers: full schema exposed as `information_schema.columns` in pretty-printed JSON, and query results returned as `JSON.stringify(rows, null, 2)` with execution time metadata.

### 1. Schema Discovery (Input Tokens)
Standard MCP servers dump the entire schema to the LLM. For large databases, this consumes thousands of input tokens on every turn. TokenLite's relational graph serves a localized **Auto-Join Context** (target table + direct parent tables + direct child tables).

| Scenario | Standard MCP Pattern | TokenLite | 📉 Savings |
| :--- | :--- | :--- | :--- |
| **Mock (50 tables, Enterprise CRM)** | 15,566 tokens | 883 tokens | **94.3%** |
| **Live (7 tables, Test DB)** | 1,892 tokens | 257 tokens | **86.4%** |

Savings scale with the number of tables: the more tables in the database, the higher the savings because the standard pattern dumps all of them while TokenLite only fetches the target + 1-hop relationships.

### 2. Query Result Payloads (Output Tokens)
TokenLite converts raw database rows to a dense, structured CSV layout. This avoids JSON syntax overhead (brackets, braces, repeated keys) and compresses the output payload returned to the LLM.

**Mock data** (varied: NULLs, long descriptions, mixed lengths):

| Rows Returned | Standard MCP Pattern (Tokens) | TokenLite CSV (Tokens) | 📉 Output Savings (%) |
| :--- | :--- | :--- | :--- |
| **10 rows** | 1,167 | 592 | **49.3%** |
| **50 rows** | 5,805 | 2,875 | **50.5%** |
| **100 rows** | 11,607 | 5,734 | **50.6%** |
| **500 rows** | 57,998 | 28,578 | **50.7%** |

**Live data** (real MySQL test database with NULLs, ENUMs, variable-length text):

| Rows Returned | Standard MCP Pattern (Tokens) | TokenLite CSV (Tokens) | 📉 Output Savings (%) |
| :--- | :--- | :--- | :--- |
| **10 rows** | 1,007 | 575 | **42.9%** |
| **50 rows** | 5,029 | 2,845 | **43.4%** |
| **100 rows** | 10,071 | 5,699 | **43.4%** |
| **500 rows** | 50,327 | 28,441 | **43.5%** |

---

## 📊 Logging & Observability

TokenLite uses MCP-native logging via `notifications/message` instead of raw stderr output. Clients that support MCP logging (e.g., MCP Inspector) will receive structured log messages with severity levels, logger names, and JSON data.

**Severity levels** (from least to most severe): `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.

The server emits logs at `info` level and above by default. Control the minimum level via `MCP_LOG_LEVEL` or dynamically at runtime through the MCP `logging/setLevel` request.

Before the MCP session is established (e.g., during pool initialization), logs fall back to stderr.

---

## 🌐 Transports & Remote Connections

TokenLite supports two MCP transports:

### 1. Stdio (Default)
The standard transport for local use. The MCP client launches the server as a subprocess and communicates via stdin/stdout. No configuration needed — this is the default.

### 2. Streamable HTTP
For remote deployments, TokenLite supports the official MCP Streamable HTTP transport. Set `MCP_TRANSPORT=http` to enable it:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 MCP_HTTP_TOKEN=your_secret \
  npx -y @andezdev/tokenlite-mysql-mcp
```

Then configure your MCP client to connect:
```json
{
  "mcpServers": {
    "tokenlite-mysql": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your_secret"
      }
    }
  }
}
```

**Security**: the HTTP transport binds to `127.0.0.1` by default, validates the `Origin` header (configurable via `MCP_HTTP_ALLOWED_ORIGINS`), and supports optional bearer token authentication via `MCP_HTTP_TOKEN`. For production deployments exposed to the internet, the MCP spec recommends OAuth — use a reverse proxy (nginx, Caddy) to handle TLS and OAuth in front of TokenLite.

**Limitations**: the current HTTP transport supports a single concurrent session. If multiple clients connect, only the last session is active. For team deployments where multiple developers need concurrent access, run one instance per developer or use a process manager (e.g., PM2) behind a load balancer to route each session to its own instance.

### 3. Connecting to Remote Databases (SSH Tunnels)
For connecting to remote MySQL servers, we recommend native OS tunnels:

```bash
ssh -N -L 3306:127.0.0.1:3306 user@your-remote-server.com
```
Then, point `tokenlite-mysql-mcp` to `localhost` and port `3306`.

## 🐛 Troubleshooting

**Error: `OptimizerError: Full table scan detected...`**
The LLM attempted to execute a query that requires scanning thousands of rows without using an index. 
*Solution*: Use `explain_query` to see the full EXPLAIN output and understand why the query was blocked. Rewrite the query with an indexed `WHERE` clause. If you truly need to scan the whole table, increase `MCP_SAFE_QUERY_MAX_ROWS` in your config.

**Error: `calling "initialize": invalid character...`**
This means the MCP JSON-RPC protocol crashed. Ensure you are passing the correct DB credentials and that the database is running and accessible from the machine where the MCP server runs.

---
*Built for the AI Engineering era.*

---
