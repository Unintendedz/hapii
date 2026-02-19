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

describe('SessionCache runtime config versioning', () => {
    it('ignores stale keepalive runtime mode updates', () => {
        const { cache } = createSessionCacheForTest()
        const session = cache.getOrCreateSession(
            'tag-runtime-version',
            { path: '/tmp', host: 'test-host' },
            {},
            'default'
        )

        cache.applySessionConfig(session.id, {
            runtimeConfigVersion: 2,
            permissionMode: 'bypassPermissions',
            reasoningEffort: 'high'
        })

        cache.handleSessionAlive({
            sid: session.id,
            time: Date.now(),
            thinking: false,
            runtimeConfigVersion: 1,
            permissionMode: 'default',
            reasoningEffort: 'low'
        })

        const after = cache.getSession(session.id)
        expect(after?.runtimeConfigVersion).toBe(2)
        expect(after?.permissionMode).toBe('bypassPermissions')
        expect(after?.reasoningEffort).toBe('high')
    })

    it('returns next runtime config version from current session state', () => {
        const { cache } = createSessionCacheForTest()
        const session = cache.getOrCreateSession(
            'tag-next-version',
            { path: '/tmp', host: 'test-host' },
            {},
            'default'
        )

        cache.applySessionConfig(session.id, { runtimeConfigVersion: 5, permissionMode: 'acceptEdits' })

        const next = cache.nextRuntimeConfigVersion(session.id)
        expect(next).toBe(6)
    })
})
