import { describe, it, expect } from 'vitest';
import { handlePing } from '../../src/tools/ping';

describe('Ping Health Check Tool', () => {
    it('should return status ok with server version and pool stats', async () => {
        const result = await handlePing();
        expect(result.isError).toBeUndefined();

        const response = JSON.parse(result.content[0].text);
        expect(response.status).toBe("ok");
        expect(response.server_version).toBeTruthy();
        expect(response.pool).toBeDefined();
        expect(typeof response.pool.active).toBe("number");
        expect(typeof response.pool.idle).toBe("number");
        expect(typeof response.pool.queue).toBe("number");
    });
});
