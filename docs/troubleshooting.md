# Troubleshooting Guide

## First step: use the `ping` tool
If you suspect a connection issue, call the `ping` tool first. It returns the database connection status, MySQL server version, and pool stats (active/idle/queued connections). If `status` is `"error"`, the error message will tell you exactly what's wrong (credentials, network, MySQL down).

---

## I ran `npx @andezdev/tokenlite-mysql-mcp` but no URL appears
**Symptom:** You run the script directly and the terminal hangs silently without outputting a web address.
**Cause:** MCP servers communicate strictly via **STDIO** (Standard Input/Output) by exchanging JSON-RPC payloads. They do not start a web server natively.
**Solution:** To test the server visually, you must wrap it with the MCP Inspector tool:
```bash
npx @modelcontextprotocol/inspector npx -y @andezdev/tokenlite-mysql-mcp
```

## Tests fail with `ECONNREFUSED`
**Symptom:** Running `npm run test` fails in `db.test.ts` complaining about port 3306 or connection refused.
**Cause:** The integration tests require a real MySQL database to verify the MCP constraints.
**Solution:** Start the testing Docker container before running tests:
```bash
docker compose -f docker/docker-compose.yml up -d
```

## Integration tests skip or fail on extended schema tables
**Symptom:** `schema.test.ts` fails with `Missing tables: categories, tags, product_tags` or related FK tests never run.
**Cause:** The Docker volume still has an older test database (fewer tables) from a previous `docker compose up`.
**Solution:** Recreate the volume so `docker/init.sql` runs again:
```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d
```
CI uses a fresh volume on each run via `docker compose down -v` before starting MySQL.

## Connection lost / PROTOCOL_CONNECTION_LOST
**Symptom:** Queries fail intermittently with `PROTOCOL_CONNECTION_LOST` or `ECONNRESET` errors, especially after idle periods.
**Cause:** MySQL closed the connection (e.g. `wait_timeout` exceeded, server restart, network interruption).
**Solution:** TokenLite automatically retries transient connection errors with exponential backoff (default: 3 attempts, 1s/2s/4s delays). If errors persist:
- Verify MySQL is running and reachable.
- Increase `MYSQL_RETRY_ATTEMPTS` for unreliable networks.
- Increase `MYSQL_RETRY_DELAY_MS` if the database takes longer to recover.
- Check MySQL's `wait_timeout` and `interactive_timeout` settings.

## Queue limit reached
**Symptom:** Requests fail immediately with a `Too many connections` or queue error instead of waiting.
**Cause:** All pool connections are busy and the queue has reached its limit (`MYSQL_QUEUE_LIMIT`, default 50).
**Solution:** This is a safety mechanism to prevent unbounded memory growth when MySQL is unresponsive. Either:
- Increase `MYSQL_QUEUE_LIMIT` if you expect high concurrency.
- Increase `MYSQL_CONNECTION_LIMIT` to allow more parallel connections.
- Investigate why MySQL is slow (long-running queries, locks, resource exhaustion).

## Input validation error (string must be at most X characters)
**Symptom:** A tool call fails with a Zod validation error about string length.
**Cause:** The SQL query exceeds 10,000 characters or the search query exceeds 200 characters. These limits protect against excessive payloads from a buggy or adversarial LLM.
**Solution:** Simplify the query. If you genuinely need longer SQL, consider breaking it into smaller queries or using CTEs.

## OptimizerError: Full table scan detected
**Symptom:** `execute_safe_query` throws an error about Full Table Scans.
**Cause:** The query executed by the LLM tried to read too many rows without an index.
**Solution:** Rewrite the query using an index. If you really need to bypass it, increase `MCP_EXPLAIN_MAX_SCAN_ROWS` in your environment variables. (`MCP_SAFE_QUERY_MAX_ROWS` is a deprecated alias for the same setting.)

## Results truncated at LIMIT 500 but I raised MCP_EXPLAIN_MAX_SCAN_ROWS
**Symptom:** Query executes successfully but CSV ends with `-- rows: 500 (truncated at LIMIT 500)` even after increasing `MCP_EXPLAIN_MAX_SCAN_ROWS`.
**Cause:** Those are two different limits. `MCP_EXPLAIN_MAX_SCAN_ROWS` only controls when full table scans are blocked. The result cap is `MCP_QUERY_ROW_LIMIT` (default 500).
**Solution:** Increase `MCP_QUERY_ROW_LIMIT` if you need more rows returned per query.

## SQL Syntax Error or Unsupported Feature (node-sql-parser)
**Symptom:** A valid-looking MySQL query is rejected with `SQL Syntax Error or Unsupported Feature`.
**Cause:** TokenLite validates SQL through `node-sql-parser` before execution. Some valid MySQL syntax is not supported by the parser, including:
- Common Table Expressions (`WITH ... AS`)
- Window functions (`ROW_NUMBER()`, `RANK()`, etc.)
- Some JSON operators (`->>`, `->`)
- Vendor-specific extensions not recognized by the parser
**Solution:**
- Simplify the query to standard `SELECT ... FROM ... WHERE ... JOIN ...` syntax.
- Break complex analytics into smaller queries.
- If the query is blocked only at the LIMIT-injection step, try removing unsupported syntax while preserving the core filters.

## Security Error: UPDATE/DELETE without a WHERE clause
**Symptom:** Write operations fail even when `ALLOW_UPDATE_OPERATION` or `ALLOW_DELETE_OPERATION` is enabled.
**Cause:** TokenLite rejects `UPDATE` and `DELETE` statements that omit a `WHERE` clause to prevent accidental mass modifications.
**Solution:** Add a scoped `WHERE` clause targeting specific rows (e.g. `WHERE id = ?`).

## Security Error: ANALYZE is not allowed (explain_query)
**Symptom:** `explain_query` rejects a query containing `ANALYZE`.
**Cause:** In MySQL 8, `EXPLAIN ANALYZE` actually executes the query. TokenLite blocks this to prevent DoS bypass of the EXPLAIN guardrail.
**Solution:** Use a plain `SELECT` statement with `explain_query`; the server prepends `EXPLAIN` automatically.

## Truncated results footer
**Symptom:** CSV output ends with `-- rows: 500 (truncated at LIMIT 500)`.
**Cause:** The query returned as many rows as the server-injected `LIMIT`. More data may exist.
**Solution:** Add a more selective `WHERE` clause, use pagination with `LIMIT offset, count`, or ask the user if a sample is sufficient.
