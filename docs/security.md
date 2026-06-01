# Security & Defense in Depth

## The "LLM Tool Bypass" Phenomenon

When interacting with intelligent agents (like Claude Desktop) that have access to multiple tools, you might observe a phenomenon called **Tool Bypass**. 

For example, if the LLM is asked to delete a user (`DELETE FROM customers`), it will read the `execute_safe_query` description, realize that only `SELECT` and `SHOW` are allowed, and might attempt to bypass the MCP entirely by using its terminal execution tool (e.g., trying to run `mysql -h 127.0.0.1 -u user -p -e "DELETE..."` directly).

## How TokenLite Protects You

TokenLite MCP is designed with a **Defense in Depth** strategy to guarantee absolute safety against rogue LLM actions:

1. **Layer 1: The AST Limiter**
   The `execute_safe_query` tool passes every LLM query through `node-sql-parser`. It forcefully injects a `LIMIT 500` (or whatever limit is configured) directly into the Abstract Syntax Tree, making it mathematically impossible for the LLM to request a massive payload that crashes the node process.

2. **Layer 2: The EXPLAIN Guardrail**
   Before executing the query, the server runs an `EXPLAIN` plan on MySQL. If the optimizer detects that the query requires a Full Table Scan on a table with more rows than `MCP_SAFE_QUERY_MAX_ROWS`, the query is hard-blocked and the LLM is instructed to use an index.

3. **Layer 3: Database User Permissions (Engine Level)**
   To protect against Tool Bypass, TokenLite strongly mandates connecting to the database using a restricted, read-only user. As seen in our `docker/init.sql` setup:
   ```sql
   GRANT SELECT, SHOW VIEW ON your_database.* TO 'mcp_user'@'%';
   ```
   If the LLM attempts to circumvent the MCP by executing raw terminal commands, the MySQL engine itself will immediately block the destructive action with an `ERROR 1142 (42000): DELETE command denied` message.

3. **Layer 3: Environment Isolation**
   In a production setup, the database credentials (`DB_PASSWORD`) should be loaded in the environment of the MCP process internally, without explicitly printing them in the prompt. If the LLM never sees the password, it cannot build the raw terminal command to attempt a bypass.

4. **Layer 4: Input Validation**
   All tool inputs are validated with strict bounds:
   - `execute_safe_query`: SQL limited to **10,000 characters** max.
   - `search_schema`: search query limited to **200 characters** max.
   - Table names are sanitized against `^[a-zA-Z0-9_]+$` before use in any dynamic SQL (`SHOW CREATE TABLE`). Names with spaces, backticks, semicolons, dots, dashes, or unicode are rejected.

5. **Layer 5: HTTP Transport Security**
   When using the Streamable HTTP transport (`MCP_TRANSPORT=http`):
   - **Origin validation**: the server validates the `Origin` header on all requests. Requests from non-allowed origins are rejected with `403 Forbidden`. Configure allowed origins via `MCP_HTTP_ALLOWED_ORIGINS`.
   - **Session management**: the MCP SDK generates a unique session ID per client. Requests without a valid `Mcp-Session-Id` after initialization are rejected with `400` or `404`.
   - **Bearer token auth**: optionally require an `Authorization: Bearer <token>` header on all requests via `MCP_HTTP_TOKEN`. Missing or invalid tokens are rejected with `401 Unauthorized`.
   - **Localhost binding**: the server binds to `127.0.0.1` by default, preventing external access unless explicitly configured.

### Recommendation
If you notice the LLM trying to bypass the MCP, you can add a system prompt instruction to your agent's configuration:
> *"You are strictly a read-only agent for this database. Do not attempt to bypass the MCP using terminal commands, as the database engine will block any write operations."*
