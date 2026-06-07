# 🤖 AI Agents Guide: TokenLite MySQL MCP

> **Notice to LLMs, Agents, and Coding Assistants:**
> If you are reading this file, you have been connected to the TokenLite MySQL MCP Server. This server is heavily protected and optimized to prevent hallucinations, reduce context window bloat, and block dangerous operations.
>
> Tool names are prefixed with the database name (e.g., `mydb_search_schema`, `mydb_execute_safe_query`). If a custom `TOOL_PREFIX` is set, that prefix is used instead.
> 
> **You MUST follow the rules below strictly.**

## 🚨 Golden Rules

1. **NEVER use `SHOW TABLES` or `DESCRIBE` manually.**
   - **Rule**: You MUST use the `search_schema` tool instead. 
   - **Why**: `search_schema` provides a compressed, heuristic-based Graph (Auto-Join Context) that gives you the DDL of the requested table *and* its implicitly related tables. It also injects business semantics from `metadata.json`.

2. **NEVER manually query `information_schema`.**
   - **Rule**: If a query fails because of a missing column or table (e.g., `ER_BAD_FIELD_ERROR`), you MUST use the `refresh_schema` tool to rebuild the internal graph, and then use `search_schema` again. Do not attempt to query `information_schema` directly.

3. **NEVER write business metrics SQL manually (when templates are configured).**
   - **Rule**: If `templates.json` is loaded, `search_schema` will include a reminder to use the `query_templates` prompt before writing analytical SQL (e.g., LTV, Revenue, Active Users).
   - **Why**: The company has predefined, vetted SQL templates. Hallucinating metrics leads to incorrect dashboards.

4. **DO NOT add `LIMIT` to your exploratory queries.**
   - **Rule**: When using `execute_safe_query`, the server will automatically inject a `LIMIT` at the AST level (default: `MCP_QUERY_ROW_LIMIT=500`). Do not manually append `LIMIT` unless you need a very specific offset pagination.
   - **Truncation**: If results reach the applied `LIMIT`, the CSV output includes a `-- rows: N (truncated at LIMIT X)` footer. Do not assume you have the full dataset.

5. **Fixing Optimizer Blocks (Full Table Scans).**
   - **Rule**: If the `execute_safe_query` tool throws an `OptimizerError: Full table scan detected`, it means your query is scanning more rows than `MCP_EXPLAIN_MAX_SCAN_ROWS` (default 1000) without an index. This is separate from the result row limit (`MCP_QUERY_ROW_LIMIT`).
   - **Action**: Use `explain_query` to see the full EXPLAIN output, then rewrite the query to include a `WHERE` clause that uses an indexed column (e.g., a primary key or foreign key). Note: `explain_query` only accepts `SELECT` statements; `ANALYZE` is blocked.

---

## 🛠 Available MCP Tools

### `search_schema`
**Use for:** Understanding the database structure.
**Arguments:** `query` (string) - The name of the table you want to inspect.
**Returns:** The SQL DDL of the matched table, the DDL of its Parent/Child tables, and Business Semantics (compact JSON). If `templates.json` is configured, includes a reminder to use `query_templates` for business metrics.

### `execute_safe_query`
**Use for:** Running `SELECT` statements against the database.
**Arguments:** `sql` (string) - The SQL query to execute.
**Returns:** A compressed CSV table containing the results. Truncated results include a footer marker.
**Note:** This tool runs your SQL through an AST parser to inject limits, and an `EXPLAIN` planner to block unindexed heavy scans. `UPDATE`/`DELETE` (when enabled) require a `WHERE` clause.

### `query_templates` (Prompt)
**Use for:** Retrieving pre-approved SQL for complex calculations.
**Arguments:** `query` (string, optional) - A keyword like 'revenue', 'ltv'. Supports MCP autocompletion when templates are loaded.
**Returns:** Vetted SQL templates that you can execute via `execute_safe_query`.

### `refresh_schema`
**Use for:** Forcing the server to rescan the database and update its internal graph.
**Arguments:** None.
**Use when:** You receive an error that a table or column doesn't exist, implying the schema changed.

### `explain_query`
**Use for:** Analyzing the execution plan of a SELECT query before running it.
**Arguments:** `sql` (string) - The SELECT query to analyze. Only `SELECT` is allowed; `ANALYZE` is blocked.
**Returns:** The MySQL EXPLAIN output as CSV showing join types, index usage, and estimated row counts.
**Use when:** Your query was blocked by the optimizer (`OptimizerError`) or you want to verify it uses indexes before executing.

### `ping`
**Use for:** Checking if the database connection is alive and healthy.
**Arguments:** None.
**Returns:** JSON with `status` (`"ok"` or `"error"`), `server_version`, and `pool` stats (`active`, `idle`, `queue` connection counts).
**Use when:** You suspect a connection issue or want to verify the server is operational before running queries.
