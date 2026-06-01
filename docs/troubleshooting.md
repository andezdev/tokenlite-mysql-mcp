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
docker-compose -f docker/docker-compose.yml up -d
```

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
**Solution:** Rewrite the query using an index. If you really need to bypass it, increase `MCP_SAFE_QUERY_MAX_ROWS` in your environment variables.
