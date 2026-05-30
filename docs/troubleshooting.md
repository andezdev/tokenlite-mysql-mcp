# Troubleshooting Guide

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

## OptimizerError: Full table scan detected
**Symptom:** `execute_safe_query` throws an error about Full Table Scans.
**Cause:** The query executed by the LLM tried to read too many rows without an index.
**Solution:** Rewrite the query using an index. If you really need to bypass it, increase `MCP_SAFE_QUERY_MAX_ROWS` in your environment variables.
