.PHONY: build test inspect docker-up docker-down inspect-graph

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
