# 🤖 AI Agents Guide: TokenLite MySQL MCP

> **Notice to LLMs, Agents, and Coding Assistants:**
> If you are reading this file, you have been connected to the TokenLite MySQL MCP Server. This server is heavily protected and optimized to prevent hallucinations, reduce context window bloat, and block dangerous operations. 
> 
> **You MUST follow the rules below strictly.**

## 🚨 Golden Rules

1. **NEVER use `SHOW TABLES` or `DESCRIBE` manually.**
   - **Rule**: You MUST use the `search_schema` tool instead. 
   - **Why**: `search_schema` provides a compressed, heuristic-based Graph (Auto-Join Context) that gives you the DDL of the requested table *and* its implicitly related tables. It also injects business semantics from `metadata.json`.

2. **NEVER manually query `information_schema`.**
   - **Rule**: If a query fails because of a missing column or table (e.g., `ER_BAD_FIELD_ERROR`), you MUST use the `refresh_schema` tool to rebuild the internal graph, and then use `search_schema` again. Do not attempt to query `information_schema` directly.

3. **NEVER write business metrics SQL manually.**
   - **Rule**: Before writing analytical SQL (e.g., LTV, Revenue, Active Users, Performance), you MUST query the `get_query_templates` tool.
   - **Why**: The company has predefined, vetted SQL templates. Hallucinating metrics leads to incorrect dashboards.

4. **DO NOT add `LIMIT` to your exploratory queries.**
   - **Rule**: When using `execute_safe_query`, the server will automatically inject a `LIMIT` (default 500) at the AST level. Do not manually append `LIMIT` unless you need a very specific offset pagination.

5. **Fixing Optimizer Blocks (Full Table Scans).**
   - **Rule**: If the `execute_safe_query` tool throws an `OptimizerError: Full table scan detected`, it means your query is scanning too many rows without an index.
   - **Action**: You MUST rewrite the query to include a `WHERE` clause that uses an indexed column (e.g., a primary key or foreign key).

---

## 🛠 Available MCP Tools

### `search_schema`
**Use for:** Understanding the database structure.
**Arguments:** `query` (string) - The name of the table you want to inspect.
**Returns:** The SQL DDL of the matched table, the DDL of its Parent/Child tables, and Business Semantics.

### `execute_safe_query`
**Use for:** Running `SELECT` statements against the database.
**Arguments:** `sql` (string) - The SQL query to execute.
**Returns:** A compressed Markdown CSV table containing the results.
**Note:** This tool runs your SQL through an AST parser to inject limits, and an `EXPLAIN` planner to block unindexed heavy scans.

### `get_query_templates`
**Use for:** Retrieving pre-approved SQL for complex calculations.
**Arguments:** `query` (string) - A keyword like 'revenue', 'ltv', or leave empty.
**Returns:** Vetted SQL templates that you can execute via `execute_safe_query`.

### `refresh_schema`
**Use for:** Forcing the server to rescan the database and update its internal graph.
**Arguments:** None.
**Use when:** You receive an error that a table or column doesn't exist, implying the schema changed.
