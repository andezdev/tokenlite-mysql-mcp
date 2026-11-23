import Fuse from 'fuse.js';

export interface QueryTemplate {
    name: string;
    description: string;
    sql: string;
}

/** Read-only view of the semantic dictionary (metadata.json) and the SQL templates (templates.json). */
export interface MetadataSource {
    getTableSemantics(tableName: string): Record<string, any>;
    getCustomRelationships(): Map<string, string>;
    hasTemplatesLoaded(): boolean;
    getTemplateCompletionSuggestions(value: string): string[];
    searchTemplates(query: string): QueryTemplate[];
}

/** In-memory metadata store built from already-parsed metadata.json / templates.json contents. */
export class MetadataStore implements MetadataSource {
    private readonly templateSearcher: Fuse<QueryTemplate> | null;

    constructor(
        private readonly metadata: Record<string, any> = {},
        private readonly templates: QueryTemplate[] = [],
        templatesLoaded: boolean = templates.length > 0,
    ) {
        this.templateSearcher = templatesLoaded
            ? new Fuse(templates, { keys: ['name', 'description'], threshold: 0.5, ignoreLocation: true })
            : null;
    }

    /**
     * Extracts all semantic definitions relevant to a specific table.
     * Example: if metadata has "orders.status", and tableName is "orders", it returns that chunk.
     */
    getTableSemantics(tableName: string): Record<string, any> {
        const semantics: Record<string, any> = {};
        const prefix = `${tableName}.`;
        for (const key of Object.keys(this.metadata)) {
            if (key.startsWith(prefix) || key === tableName) {
                semantics[key] = this.metadata[key];
            }
        }
        return semantics;
    }

    getCustomRelationships(): Map<string, string> {
        const relationships = new Map<string, string>();
        const raw = this.metadata['_relationships'];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return relationships;

        for (const [source, target] of Object.entries(raw)) {
            if (typeof target !== 'string') continue;
            if (!source.includes('.') || !target.includes('.')) continue;
            relationships.set(source, target);
        }
        return relationships;
    }

    hasTemplatesLoaded(): boolean {
        return this.templates.length > 0;
    }

    getTemplateCompletionSuggestions(value: string): string[] {
        if (!this.hasTemplatesLoaded()) {
            return [];
        }

        const needle = value.trim().toLowerCase();
        const suggestions = new Set<string>();

        for (const template of this.templates) {
            if (!needle || template.name.toLowerCase().includes(needle)) {
                suggestions.add(template.name);
            }
            if (!needle || template.description.toLowerCase().includes(needle)) {
                suggestions.add(template.description.split(' ')[0].toLowerCase());
            }
        }

        return Array.from(suggestions).slice(0, 20);
    }

    /** Fuzzy search on the loaded templates. Empty query returns the first 10. */
    searchTemplates(query: string): QueryTemplate[] {
        if (!this.templateSearcher) return [];
        if (!query.trim()) {
            return this.templates.slice(0, 10);
        }
        return this.templateSearcher.search(query).map((r) => r.item);
    }
}
