import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('sw-update applyUpdate', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('applies waiting service worker and then reloads', async () => {
        const module = await import('./sw-update')
        const reloadSpy = vi.fn()
        module.setReloadPageForTesting(reloadSpy)

        const postMessage = vi.fn()
        const update = vi.fn(async () => {})

        module.setRegistration({
            update,
            waiting: { postMessage } as unknown as ServiceWorker
        } as unknown as ServiceWorkerRegistration)
        module.setUpdateSW(async () => {})

        await module.applyUpdate()

        expect(update).toHaveBeenCalledTimes(1)
        expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
        expect(reloadSpy).toHaveBeenCalledTimes(1)
    })

    it('still reloads when service worker APIs are unavailable', async () => {
        const module = await import('./sw-update')
        const reloadSpy = vi.fn()
        module.setReloadPageForTesting(reloadSpy)

        await module.applyUpdate()

        expect(reloadSpy).toHaveBeenCalledTimes(1)
    })
})
