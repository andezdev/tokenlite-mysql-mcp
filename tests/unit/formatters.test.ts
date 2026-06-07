import { describe, it, expect } from 'vitest';
import { jsonToCsv } from '../../src/utils/csvFormatter.js';

describe('jsonToCsv Formatter', () => {
    it('should convert a simple array of objects to CSV', () => {
        const data = [
            { id: 1, name: 'Ana', role: 'admin' },
            { id: 2, name: 'Luis', role: 'user' }
        ];
        const csv = jsonToCsv(data);
        expect(csv).toBe("id,name,role\n1,Ana,admin\n2,Luis,user");
    });

    it('should escape commas in values', () => {
        const data = [
            { id: 1, location: 'Madrid, Spain' }
        ];
        const csv = jsonToCsv(data);
        expect(csv).toBe('id,location\n1,"Madrid, Spain"');
    });

    it('should return a message for empty arrays', () => {
        const data: any[] = [];
        const csv = jsonToCsv(data);
        expect(csv).toBe("No data returned.");
    });

    it('should represent NULL values as ∅', () => {
        const data = [
            { id: 1, name: null, email: 'a@b.com' },
            { id: 2, name: 'Bob', email: null },
        ];
        const csv = jsonToCsv(data);
        expect(csv).toBe('id,name,email\n1,∅,a@b.com\n2,Bob,∅');
    });

    it('should represent undefined values as ∅', () => {
        const data = [{ id: 1, name: undefined }];
        const csv = jsonToCsv(data);
        expect(csv).toBe('id,name\n1,∅');
    });

    it('should quote the literal string "∅" to distinguish from NULL marker', () => {
        const data = [{ id: 1, symbol: '∅' }];
        const csv = jsonToCsv(data);
        expect(csv).toBe('id,symbol\n1,"∅"');
    });

    it('should not confuse the string "NULL" with actual NULL', () => {
        const data = [
            { id: 1, status: null },
            { id: 2, status: 'NULL' },
        ];
        const csv = jsonToCsv(data);
        const lines = csv.split('\n');
        expect(lines[1]).toBe('1,∅');
        expect(lines[2]).toBe('2,NULL');
    });

    it('should append a truncation footer when results are truncated', () => {
        const data = Array.from({ length: 3 }, (_, i) => ({ id: i + 1 }));
        const csv = jsonToCsv(data, { truncated: true, limit: 3 });
        expect(csv).toContain('-- rows: 3 (truncated at LIMIT 3)');
    });
});
