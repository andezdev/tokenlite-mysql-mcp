import { schemaGraph } from '../../src/db/schema.js';

export const EXTENDED_SCHEMA_TABLES = ['categories', 'tags', 'product_tags'] as const;

export const EXTENDED_SCHEMA_DOCKER_HINT =
    'Run: docker compose -f docker/docker-compose.yml down -v && docker compose -f docker/docker-compose.yml up -d';

export function getMissingExtendedSchemaTables(): string[] {
    return EXTENDED_SCHEMA_TABLES.filter((table) => !schemaGraph.has(table));
}
