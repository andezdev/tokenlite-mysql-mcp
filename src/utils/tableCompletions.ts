import { schemaGraph } from '../db/schema.js';

export function completeTableNames(value: string): string[] {
    const needle = value.trim().toLowerCase();
    const tables = Array.from(schemaGraph.keys());

    if (!needle) {
        return tables.slice(0, 20);
    }

    return tables
        .filter((table) => table.toLowerCase().includes(needle))
        .slice(0, 20);
}
