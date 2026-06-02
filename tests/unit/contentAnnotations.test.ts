import { describe, it, expect } from 'vitest';
import { PING_CONTENT_ANNOTATIONS } from '../../src/tools/ping.js';
import { SEARCH_SCHEMA_CONTENT_ANNOTATIONS } from '../../src/tools/searchSchema.js';
import { EXECUTE_QUERY_CONTENT_ANNOTATIONS } from '../../src/tools/executeQuery.js';
import { EXPLAIN_QUERY_CONTENT_ANNOTATIONS } from '../../src/tools/explainQuery.js';
import { REFRESH_SCHEMA_CONTENT_ANNOTATIONS } from '../../src/tools/refreshSchema.js';

describe('Content Annotations', () => {
    it('ping should target user only with low priority', () => {
        expect(PING_CONTENT_ANNOTATIONS.audience).toEqual(["user"]);
        expect(PING_CONTENT_ANNOTATIONS.priority).toBe(0.3);
    });

    it('search_schema should target assistant only with high priority', () => {
        expect(SEARCH_SCHEMA_CONTENT_ANNOTATIONS.audience).toEqual(["assistant"]);
        expect(SEARCH_SCHEMA_CONTENT_ANNOTATIONS.priority).toBe(0.9);
    });

    it('execute_query should target both user and assistant', () => {
        expect(EXECUTE_QUERY_CONTENT_ANNOTATIONS.audience).toEqual(["user", "assistant"]);
        expect(EXECUTE_QUERY_CONTENT_ANNOTATIONS.priority).toBe(0.7);
    });

    it('explain_query should target assistant only with medium priority', () => {
        expect(EXPLAIN_QUERY_CONTENT_ANNOTATIONS.audience).toEqual(["assistant"]);
        expect(EXPLAIN_QUERY_CONTENT_ANNOTATIONS.priority).toBe(0.5);
    });

    it('refresh_schema should target assistant only with low priority', () => {
        expect(REFRESH_SCHEMA_CONTENT_ANNOTATIONS.audience).toEqual(["assistant"]);
        expect(REFRESH_SCHEMA_CONTENT_ANNOTATIONS.priority).toBe(0.2);
    });

    it('all priorities should be between 0.0 and 1.0', () => {
        const all = [
            PING_CONTENT_ANNOTATIONS,
            SEARCH_SCHEMA_CONTENT_ANNOTATIONS,
            EXECUTE_QUERY_CONTENT_ANNOTATIONS,
            EXPLAIN_QUERY_CONTENT_ANNOTATIONS,
            REFRESH_SCHEMA_CONTENT_ANNOTATIONS,
        ];
        for (const a of all) {
            expect(a.priority).toBeGreaterThanOrEqual(0);
            expect(a.priority).toBeLessThanOrEqual(1);
        }
    });
});
