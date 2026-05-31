# Changelog

## [2.0.0](https://github.com/andezdev/tokenlite-mysql-mcp/compare/v1.0.0...v2.0.0) (2026-05-31)


### ⚠ BREAKING CHANGES

* The `get_query_templates` tool has been removed and replaced by the `query_templates` Prompt. Any automated client relying on the tool will need to use the Prompts API instead.

### Features

* add configurable database connection and query timeouts ([9b33835](https://github.com/andezdev/tokenlite-mysql-mcp/commit/9b33835e5499834827e25947cda9aca16b548920))
* add graceful shutdown for the MCP server and database pool ([55e648a](https://github.com/andezdev/tokenlite-mysql-mcp/commit/55e648a8f69b7b5e7541bf021c667625791d6878))
* add session-level defense in depth for strict read-only mode ([f551913](https://github.com/andezdev/tokenlite-mysql-mcp/commit/f5519136156e551c121d800eaf3bb5c0bbf4ce51))
* auto-generate random prefix for tools and prompts ([cdb3543](https://github.com/andezdev/tokenlite-mysql-mcp/commit/cdb3543b1506901a2c5a609cc76da78b234e081b))
* expose database tables as native MCP Resources ([5f3ee9c](https://github.com/andezdev/tokenlite-mysql-mcp/commit/5f3ee9c7b169623f3447b7ea98268f50a71ce103))
* migrate templates to official MCP Prompts and add tool annotations ([721265d](https://github.com/andezdev/tokenlite-mysql-mcp/commit/721265d9e12703d004f10189a5e75f9356021ecd))
* support DML and DDL operations in execute_safe_query ([7445ffb](https://github.com/andezdev/tokenlite-mysql-mcp/commit/7445ffb50385bcd02870a47e3759789db1a470bd))

## 1.0.0 (2026-05-31)


### Features

* **benchmark:** add benchmark and script to visualize database graph ([9e8a1f8](https://github.com/andezdev/tokenlite-mysql-mcp/commit/9e8a1f83b374b5d1c77cd5d758c1a47be1971538))
* **intelligence:** implement semantic dictionary and SQL templates for LLM steering ([a38787e](https://github.com/andezdev/tokenlite-mysql-mcp/commit/a38787e0a367516fbbb125dd099a5ed63f52b727))
* **release:** prepare project for NPM distribution and open source ([2129491](https://github.com/andezdev/tokenlite-mysql-mcp/commit/212949104af473159f095a6ce22cf2b21dc482cd))
* **schema:** implement dynamic schema graph and semantic search ([fd76b61](https://github.com/andezdev/tokenlite-mysql-mcp/commit/fd76b61f6d71aeeab5f6b000ab422c89b97e904d))
* **security:** implement AST parsing and EXPLAIN execution guardrails ([e14bc60](https://github.com/andezdev/tokenlite-mysql-mcp/commit/e14bc60f2024aa0c1a2f7264db1ec4fc936d1c3e))
