import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Logger - severity filtering', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('should respect MCP_LOG_LEVEL and suppress lower severity logs', async () => {
        process.env.MCP_LOG_LEVEL = 'error';
        const { log } = await import('../../src/utils/logger');

        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await log('info', 'should be suppressed');
        expect(stderrSpy).not.toHaveBeenCalled();

        await log('error', 'should appear');
        expect(stderrSpy).toHaveBeenCalledTimes(1);
        expect(stderrSpy.mock.calls[0][0]).toContain('should appear');

        await log('emergency', 'also should appear');
        expect(stderrSpy).toHaveBeenCalledTimes(2);

        stderrSpy.mockRestore();
        delete process.env.MCP_LOG_LEVEL;
    });

    it('should default to info level when MCP_LOG_LEVEL is not set', async () => {
        delete process.env.MCP_LOG_LEVEL;
        const { log, getMinLevel } = await import('../../src/utils/logger');

        expect(getMinLevel()).toBe('info');

        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await log('debug', 'should be suppressed');
        expect(stderrSpy).not.toHaveBeenCalled();

        await log('info', 'should appear');
        expect(stderrSpy).toHaveBeenCalledTimes(1);

        stderrSpy.mockRestore();
    });

    it('should include logger name in stderr fallback output', async () => {
        delete process.env.MCP_LOG_LEVEL;
        const { log } = await import('../../src/utils/logger');

        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await log('info', 'test message', 'mylogger');
        expect(stderrSpy.mock.calls[0][0]).toContain('[mylogger]');
        expect(stderrSpy.mock.calls[0][0]).toContain('[info]');

        stderrSpy.mockRestore();
    });
});
