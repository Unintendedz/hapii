import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { EventPublisher } from './eventPublisher'
import { SessionCache } from './sessionCache'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'

function createSessionCacheForTest(): { store: Store; cache: SessionCache } {
    const store = new Store(':memory:')
    const publisher = new EventPublisher(
        new SSEManager(0, new VisibilityTracker()),
        () => 'default'
    )
    const cache = new SessionCache(store, publisher)
    return { store, cache }
}

describe('SessionCache active state persistence', () => {
    it('persists active state even when session is already active in memory', () => {
        const { store, cache } = createSessionCacheForTest()
        const session = cache.getOrCreateSession(
            'tag-active-persist',
            { path: '/tmp', host: 'test-host' },
            {},
            'default'
        )

        const inMemory = cache.getSession(session.id)
        expect(inMemory).toBeDefined()
        if (!inMemory) {
            return
        }

        // Simulate a pre-existing process where memory says active, but DB still says inactive.
        const aliveAt = Date.now() - 10_000
        inMemory.active = true
        inMemory.activeAt = aliveAt

        const beforeAlive = store.sessions.getSession(session.id)
        expect(beforeAlive?.active).toBe(false)

        cache.handleSessionAlive({
            sid: session.id,
            time: aliveAt + 1_000,
            thinking: false
        })

        const reloaded = store.sessions.getSession(session.id)
        expect(reloaded?.active).toBe(true)
        expect(reloaded?.activeAt).toBe(aliveAt + 1_000)
    })
})
