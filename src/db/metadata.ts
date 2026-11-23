import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { log } from '../utils/logger.js';
import { MetadataStore, type QueryTemplate } from '../engine/metadata.js';

(dotenv.config as any)({ quiet: true });

export type { QueryTemplate };

let metadataCache: Record<string, any> = {};
let templatesCache: QueryTemplate[] = [];
let templatesLoaded = false;
let store = new MetadataStore();

/** The metadata loaded by initMetadata() (MCP_METADATA_PATH / MCP_TEMPLATES_PATH). */
export function getMetadataStore(): MetadataStore {
    return store;
}

export function initMetadata() {
    const metadataPath = process.env.MCP_METADATA_PATH;
    if (metadataPath && fs.existsSync(metadataPath)) {
        try {
            const raw = fs.readFileSync(metadataPath, 'utf8');
            metadataCache = JSON.parse(raw);
            log("info", `Loaded metadata dictionary from ${metadataPath}`, "metadata");
        } catch (err) {
            log("error", `Error loading metadata.json: ${err}`, "metadata");
        }
    }

    const templatesPath = process.env.MCP_TEMPLATES_PATH;
    if (templatesPath && fs.existsSync(templatesPath)) {
        try {
            const raw = fs.readFileSync(templatesPath, 'utf8');
            templatesCache = JSON.parse(raw);
            // Build the searcher inside the try (as before): an invalid templates file is logged, not thrown.
            new MetadataStore({}, templatesCache, true);
            templatesLoaded = true;
            log("info", `Loaded ${templatesCache.length} SQL templates from ${templatesPath}`, "metadata");
        } catch (err) {
            log("error", `Error loading templates.json: ${err}`, "metadata");
        }
    }

    store = new MetadataStore(metadataCache, templatesCache, templatesLoaded);
}

export function getTableSemantics(tableName: string): Record<string, any> {
    return store.getTableSemantics(tableName);
}

export function getCustomRelationships(): Map<string, string> {
    return store.getCustomRelationships();
}

export function hasTemplatesLoaded(): boolean {
    return store.hasTemplatesLoaded();
}

export function getTemplateCompletionSuggestions(value: string): string[] {
    return store.getTemplateCompletionSuggestions(value);
}

export function searchTemplates(query: string): QueryTemplate[] {
    return store.searchTemplates(query);
}
