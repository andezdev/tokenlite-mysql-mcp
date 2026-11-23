.PHONY: build test inspect docker-up docker-down inspect-graph

# Test database from docker/docker-compose.yml (`make docker-up`). `?=` keeps any value already set in the
# environment, e.g. `DB_USER=root DB_PASSWORD=root make test`.
export DB_HOST ?= 127.0.0.1
export DB_PORT ?= 3307
export DB_USER ?= mcp_test
export DB_PASSWORD ?= mcp_password
export DB_NAME ?= mcp_test_db

# Compiles the TypeScript project
build:
	npm run build

# Runs Vitest test suite
test:
	npm run test

# Runs the official MCP inspector for visual testing
inspect: build
	npx @modelcontextprotocol/inspector node dist/index.js

# Visualizes and checks the in-memory relational graph
inspect-graph:
	npm run inspect-graph

# Spins up the testing MySQL database via Docker
docker-up:
	cd docker && docker-compose up -d

# Tears down the testing MySQL database
docker-down:
	cd docker && docker-compose down
