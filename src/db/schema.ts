// Environment-driven wrappers around the engine's schema graph (stdio server). The logic lives in
// ../engine/schema.ts; this module owns the stdio server's graph and DDL cache.
import type { DdlCacheEntry, SchemaState } from '../engine/context.js';
import {
    buildSchemaGraph as buildSchemaGraphCore,
    buildViewDDL as buildViewDDLCore,
    getTableDDL as getTableDDLCore,
} from '../engine/schema.js';
import { TableNode } from './types.js';
import { defaultContext } from './defaultContext.js';

export { computeConfidence, resolveTargetTable } from '../engine/schema.js';

export let schemaGraph = new Map<string, TableNode>();

const ddlCache = new Map<string, DdlCacheEntry>();

/** The stdio server's schema state: reads and replaces the exported `schemaGraph` binding. */
export const legacySchemaState: SchemaState = {
    get graph() { return schemaGraph; },
    set graph(g) { schemaGraph = g; },
    ddlCache,
};

export function invalidateDdlCache(): void {
    ddlCache.clear();
}

export function includeViews(): boolean {
    return process.env.MCP_INCLUDE_VIEWS !== 'false';
}

/**
 * Builds a column-only DDL for a view from information_schema.columns.
 *
 * `SHOW CREATE VIEW` is deliberately not used: it requires the SHOW VIEW privilege and exposes the
 * view definition (base schema, tables, columns and any masking expressions), which is exactly what
 * a restricted, view-based deployment wants to hide from the model.
 */
export function buildViewDDL(viewName: string): Promise<string | null> {
    return buildViewDDLCore(defaultContext(), viewName);
}

export function getTableDDL(tableName: string): Promise<string | null> {
    return getTableDDLCore(defaultContext(), tableName);
}

export function buildSchemaGraph(): Promise<void> {
    return buildSchemaGraphCore(defaultContext());
}
