import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { EventPublisher } from './eventPublisher'
import { SessionCache } from './sessionCache'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'

const AUTO_ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000

function createSessionCacheForTest(): { store: Store; cache: SessionCache } {
    const store = new Store(':memory:')
    const publisher = new EventPublisher(
        new SSEManager(0, new VisibilityTracker()),
        () => 'default'
    )
    const cache = new SessionCache(store, publisher)
    return { store, cache }
}

describe('SessionCache auto archive', () => {
    it('archives inactive sessions untouched for more than 24 hours', () => {
        const { cache } = createSessionCacheForTest()
        const session = cache.getOrCreateSession(
            'tag-auto-archive',
            { path: '/tmp', host: 'test-host' },
            {},
            'default'
        )

        const staleAt = Date.now() - AUTO_ARCHIVE_AFTER_MS - 1_000
        const inMemory = cache.getSession(session.id)
        expect(inMemory).toBeDefined()
        if (!inMemory) {
            return
        }

        inMemory.active = false
        inMemory.createdAt = staleAt
        inMemory.updatedAt = staleAt
        inMemory.activeAt = staleAt

        cache.expireInactive(Date.now())

        const archived = cache.getSession(session.id)
        expect(archived?.metadata?.lifecycleState).toBe('archived')
        expect(archived?.metadata?.archivedBy).toBe('hub')
        expect(archived?.metadata?.archiveReason).toBe('Auto-archived after 24 hours of inactivity')
    })

    it('keeps inactive sessions unarchived when updated recently', () => {
        const { cache } = createSessionCacheForTest()
        const session = cache.getOrCreateSession(
            'tag-still-recent',
            { path: '/tmp', host: 'test-host' },
            {},
            'default'
        )

        const now = Date.now()
        const staleActiveAt = now - AUTO_ARCHIVE_AFTER_MS - 1_000
        const recentUpdatedAt = now - 60_000
        const inMemory = cache.getSession(session.id)
        expect(inMemory).toBeDefined()
        if (!inMemory) {
            return
        }

        inMemory.active = false
        inMemory.createdAt = staleActiveAt
        inMemory.activeAt = staleActiveAt
        inMemory.updatedAt = recentUpdatedAt

        cache.expireInactive(now)

        const notArchived = cache.getSession(session.id)
        expect(notArchived?.metadata?.lifecycleState).toBeUndefined()
        expect(notArchived?.metadata?.archivedBy).toBeUndefined()
    })
})
