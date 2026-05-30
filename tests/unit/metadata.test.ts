import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { initMetadata, getTableSemantics, searchTemplates } from '../../src/db/metadata.js';

describe('Metadata & Templates Engine', () => {
    const testMetadataPath = path.resolve(__dirname, 'test_metadata.json');
    const testTemplatesPath = path.resolve(__dirname, 'test_templates.json');

    beforeAll(() => {
        // Create dummy files
        fs.writeFileSync(testMetadataPath, JSON.stringify({
            "users.status": "1=Active, 2=Suspended",
            "users.password": "Hashed password",
            "orders.total": "Includes taxes"
        }));

        fs.writeFileSync(testTemplatesPath, JSON.stringify([
            {
                name: "Calculate MRR",
                description: "Calculates Monthly Recurring Revenue",
                sql: "SELECT SUM(amount) FROM subscriptions"
            },
            {
                name: "Active Users",
                description: "Count of users logged in last 30 days",
                sql: "SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL 30 DAY"
            }
        ]));

        process.env.MCP_METADATA_PATH = testMetadataPath;
        process.env.MCP_TEMPLATES_PATH = testTemplatesPath;

        initMetadata();
    });

    afterAll(() => {
        if (fs.existsSync(testMetadataPath)) fs.unlinkSync(testMetadataPath);
        if (fs.existsSync(testTemplatesPath)) fs.unlinkSync(testTemplatesPath);
    });

    it('should extract semantics specifically for a given table', () => {
        const usersSemantics = getTableSemantics('users');
        expect(usersSemantics).toHaveProperty('users.status');
        expect(usersSemantics).toHaveProperty('users.password');
        expect(usersSemantics).not.toHaveProperty('orders.total');

        const ordersSemantics = getTableSemantics('orders');
        expect(ordersSemantics).toHaveProperty('orders.total');
        expect(ordersSemantics).not.toHaveProperty('users.status');
    });

    it('should fuzzy search templates by keyword', () => {
        const mrrResults = searchTemplates('revenue');
        expect(mrrResults.length).toBeGreaterThan(0);
        expect(mrrResults[0].name).toBe('Calculate MRR');

        const usersResults = searchTemplates('count of users logged');
        expect(usersResults.length).toBeGreaterThan(0);
        expect(usersResults[0].name).toBe('Active Users');
    });

    it('should return all templates if query is empty', () => {
        const all = searchTemplates('');
        expect(all.length).toBe(2);
    });
});
