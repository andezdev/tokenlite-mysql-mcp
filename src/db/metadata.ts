import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';
import dotenv from 'dotenv';

(dotenv.config as any)({ quiet: true });

export interface QueryTemplate {
    name: string;
    description: string;
    sql: string;
}

let metadataCache: Record<string, any> = {};
let templatesCache: QueryTemplate[] = [];
let templateSearcher: Fuse<QueryTemplate> | null = null;

export function initMetadata() {
    const metadataPath = process.env.MCP_METADATA_PATH;
    if (metadataPath && fs.existsSync(metadataPath)) {
        try {
            const raw = fs.readFileSync(metadataPath, 'utf8');
            metadataCache = JSON.parse(raw);
            console.error(`[tokenlite-mysql-mcp] Loaded metadata dictionary from ${metadataPath}`);
        } catch (err) {
            console.error(`[tokenlite-mysql-mcp] Error loading metadata.json:`, err);
        }
    }

    const templatesPath = process.env.MCP_TEMPLATES_PATH;
    if (templatesPath && fs.existsSync(templatesPath)) {
        try {
            const raw = fs.readFileSync(templatesPath, 'utf8');
            templatesCache = JSON.parse(raw);
            templateSearcher = new Fuse(templatesCache, {
                keys: ['name', 'description'],
                threshold: 0.5,
                ignoreLocation: true
            });
            console.error(`[tokenlite-mysql-mcp] Loaded ${templatesCache.length} SQL templates from ${templatesPath}`);
        } catch (err) {
            console.error(`[tokenlite-mysql-mcp] Error loading templates.json:`, err);
        }
    }
}

/**
 * Extracts all semantic definitions relevant to a specific table.
 * Example: if metadata has "orders.status", and tableName is "orders", it returns that chunk.
 */
export function getTableSemantics(tableName: string): Record<string, any> {
    const semantics: Record<string, any> = {};
    const prefix = `${tableName}.`;
    
    for (const key of Object.keys(metadataCache)) {
        if (key.startsWith(prefix) || key === tableName) {
            semantics[key] = metadataCache[key];
        }
    }
    
    return semantics;
}

/**
 * Performs a fuzzy search on the loaded templates.
 */
export function searchTemplates(query: string): QueryTemplate[] {
    if (!templateSearcher) return [];
    
    // If query is empty, return all (capped to a safe limit, e.g., 10)
    if (!query.trim()) {
        return templatesCache.slice(0, 10);
    }
    
    const results = templateSearcher.search(query);
    return results.map(r => r.item);
}
