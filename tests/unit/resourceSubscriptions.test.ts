import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/db/schema.js', () => ({
    schemaGraph: new Map(),
    getTableDDL: vi.fn(),
}));

vi.mock('../../src/db/metadata.js', () => ({
    getTableSemantics: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/utils/logger.js', () => ({
    log: vi.fn(),
}));

describe('Resource Subscriptions', () => {
    let getSubscribedUris: () => ReadonlySet<string>;
    let notifyResourceSubscribers: (server: any) => Promise<void>;
    let registerTableResources: (server: any) => void;

    let mockServer: any;
    let subscribeHandler: any;
    let unsubscribeHandler: any;
    let sendResourceUpdated: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.resetModules();

        sendResourceUpdated = vi.fn().mockResolvedValue(undefined);

        let handlerCallIndex = 0;
        mockServer = {
            resource: vi.fn(),
            server: {
                setRequestHandler: vi.fn((_schema: any, handler: any) => {
                    // registerTableResources registers subscribe first, unsubscribe second
                    if (handlerCallIndex === 0) subscribeHandler = handler;
                    if (handlerCallIndex === 1) unsubscribeHandler = handler;
                    handlerCallIndex++;
                }),
                sendResourceUpdated,
            },
        };

        const mod = await import('../../src/resources/tables.js');
        getSubscribedUris = mod.getSubscribedUris;
        notifyResourceSubscribers = mod.notifyResourceSubscribers;
        registerTableResources = mod.registerTableResources;

        registerTableResources(mockServer);
    });

    it('should register subscribe and unsubscribe handlers', () => {
        expect(mockServer.server.setRequestHandler).toHaveBeenCalledTimes(2);
        expect(subscribeHandler).toBeDefined();
        expect(unsubscribeHandler).toBeDefined();
    });

    it('should track subscribed URIs', async () => {
        await subscribeHandler({ params: { uri: 'mysql://schema' } });
        expect(getSubscribedUris().has('mysql://schema')).toBe(true);
    });

    it('should remove URIs on unsubscribe', async () => {
        await subscribeHandler({ params: { uri: 'mysql://schema' } });
        await unsubscribeHandler({ params: { uri: 'mysql://schema' } });
        expect(getSubscribedUris().has('mysql://schema')).toBe(false);
    });

    it('should send notifications to all subscribed URIs', async () => {
        await subscribeHandler({ params: { uri: 'mysql://schema' } });
        await subscribeHandler({ params: { uri: 'mysql://tables/orders' } });

        await notifyResourceSubscribers(mockServer);

        expect(sendResourceUpdated).toHaveBeenCalledTimes(2);
        expect(sendResourceUpdated).toHaveBeenCalledWith({ uri: 'mysql://schema' });
        expect(sendResourceUpdated).toHaveBeenCalledWith({ uri: 'mysql://tables/orders' });
    });

    it('should not fail when no subscribers exist', async () => {
        await expect(notifyResourceSubscribers(mockServer)).resolves.not.toThrow();
        expect(sendResourceUpdated).not.toHaveBeenCalled();
    });

    it('should handle notification errors gracefully', async () => {
        await subscribeHandler({ params: { uri: 'mysql://schema' } });
        sendResourceUpdated.mockRejectedValueOnce(new Error('connection closed'));

        await expect(notifyResourceSubscribers(mockServer)).resolves.not.toThrow();
    });
});
