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
});
