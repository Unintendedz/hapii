import { AgentStateSchema, MetadataSchema } from '@hapi/protocol/schemas'
import type { ModelMode, PermissionMode, ReasoningEffort, Session } from '@hapi/protocol/types'
import type { Store } from '../store'
import { clampAliveTime } from './aliveTime'
import { EventPublisher } from './eventPublisher'
import { extractTodoWriteTodosFromMessageContent, TodosSchema } from './todos'

function clampWorkStartTime(t: number, now: number): number | null {
    if (!Number.isFinite(t)) return null
    if (t > now) return now
    // Allow long-running turns; still reject absurdly old values to avoid poisoning UI.
    const maxAgeMs = 1000 * 60 * 60 * 24 * 7 // 7 days
    if (t < now - maxAgeMs) return null
    return t
}

function normalizeRuntimeConfigVersion(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return null
    }
    return value
}

export class SessionCache {
    private readonly sessions: Map<string, Session> = new Map()
    private readonly lastBroadcastAtBySessionId: Map<string, number> = new Map()
    private readonly todoBackfillAttemptedSessionIds: Set<string> = new Set()

    constructor(
        private readonly store: Store,
        private readonly publisher: EventPublisher
    ) {
    }

    getSessions(): Session[] {
        return Array.from(this.sessions.values())
    }

    getSessionsByNamespace(namespace: string): Session[] {
        return this.getSessions().filter((session) => session.namespace === namespace)
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId)
    }

    getSessionByNamespace(sessionId: string, namespace: string): Session | undefined {
        const session = this.sessions.get(sessionId)
        if (!session || session.namespace !== namespace) {
            return undefined
        }
        return session
    }

    resolveSessionAccess(
        sessionId: string,
        namespace: string
    ): { ok: true; sessionId: string; session: Session } | { ok: false; reason: 'not-found' | 'access-denied' } {
        const session = this.sessions.get(sessionId) ?? this.refreshSession(sessionId)
        if (session) {
            if (session.namespace !== namespace) {
                return { ok: false, reason: 'access-denied' }
            }
            return { ok: true, sessionId, session }
        }

        return { ok: false, reason: 'not-found' }
    }

    getActiveSessions(): Session[] {
        return this.getSessions().filter((session) => session.active)
    }

    getOrCreateSession(tag: string, metadata: unknown, agentState: unknown, namespace: string): Session {
        const stored = this.store.sessions.getOrCreateSession(tag, metadata, agentState, namespace)
        return this.refreshSession(stored.id) ?? (() => { throw new Error('Failed to load session') })()
    }

    refreshSession(sessionId: string): Session | null {
        let stored = this.store.sessions.getSession(sessionId)
        if (!stored) {
            const existed = this.sessions.delete(sessionId)
            if (existed) {
                this.publisher.emit({ type: 'session-removed', sessionId })
            }
            return null
        }

        const existing = this.sessions.get(sessionId)

        if (stored.todos === null && !this.todoBackfillAttemptedSessionIds.has(sessionId)) {
            this.todoBackfillAttemptedSessionIds.add(sessionId)
            const messages = this.store.messages.getMessages(sessionId, 200)
            for (let i = messages.length - 1; i >= 0; i -= 1) {
                const message = messages[i]
                const todos = extractTodoWriteTodosFromMessageContent(message.content)
                if (todos) {
                    const updated = this.store.sessions.setSessionTodos(sessionId, todos, message.createdAt, stored.namespace)
                    if (updated) {
                        stored = this.store.sessions.getSession(sessionId) ?? stored
                    }
                    break
                }
            }
        }

        const metadata = (() => {
            const parsed = MetadataSchema.safeParse(stored.metadata)
            return parsed.success ? parsed.data : null
        })()

        const agentState = (() => {
            const parsed = AgentStateSchema.safeParse(stored.agentState)
            return parsed.success ? parsed.data : null
        })()

        const todos = (() => {
            if (stored.todos === null) return undefined
            const parsed = TodosSchema.safeParse(stored.todos)
            return parsed.success ? parsed.data : undefined
        })()

        const session: Session = {
            id: stored.id,
            namespace: stored.namespace,
            seq: stored.seq,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
            active: existing?.active ?? stored.active,
            activeAt: existing?.activeAt ?? (stored.activeAt ?? stored.createdAt),
            metadata,
            metadataVersion: stored.metadataVersion,
            agentState,
            agentStateVersion: stored.agentStateVersion,
            thinking: existing?.thinking ?? false,
            thinkingAt: existing?.thinkingAt ?? 0,
            work: existing?.work ?? { current: null, last: null },
            todos,
            runtimeConfigVersion: existing?.runtimeConfigVersion ?? 0,
            permissionMode: existing?.permissionMode,
            modelMode: existing?.modelMode,
            reasoningEffort: existing?.reasoningEffort
        }

        this.sessions.set(sessionId, session)
        this.publisher.emit({ type: existing ? 'session-updated' : 'session-added', sessionId, data: session })
        return session
    }

    reloadAll(): void {
        const sessions = this.store.sessions.getSessions()
        for (const session of sessions) {
            this.refreshSession(session.id)
        }
    }

    handleSessionAlive(payload: {
        sid: string
        time: number
        thinking?: boolean
        thinkingSince?: number | null
        mode?: 'local' | 'remote'
        runtimeConfigVersion?: number
        permissionMode?: PermissionMode
        modelMode?: ModelMode
        reasoningEffort?: ReasoningEffort
    }): void {
        const t = clampAliveTime(payload.time)
        if (!t) return

        const now = Date.now()

        const session = this.sessions.get(payload.sid) ?? this.refreshSession(payload.sid)
        if (!session) return

        session.work ??= { current: null, last: null }

        const wasActive = session.active
        const wasThinking = session.thinking
        const previousPermissionMode = session.permissionMode
        const previousModelMode = session.modelMode
        const previousReasoningEffort = session.reasoningEffort
        const previousRuntimeConfigVersion = session.runtimeConfigVersion ?? 0

        const nextThinking = Boolean(payload.thinking)
        if (nextThinking) {
            const startedAtFromClient = typeof payload.thinkingSince === 'number'
                ? clampWorkStartTime(payload.thinkingSince, now)
                : null

            if (!session.work.current) {
                session.work.current = { startedAt: startedAtFromClient ?? t }
            } else if (startedAtFromClient !== null && startedAtFromClient < session.work.current.startedAt) {
                session.work.current.startedAt = startedAtFromClient
            }
        }
        if (wasThinking && !nextThinking && session.work.current) {
            const startedAt = session.work.current.startedAt
            const endedAt = t
            session.work.last = {
                startedAt,
                endedAt,
                durationMs: Math.max(0, endedAt - startedAt)
            }
            session.work.current = null
        }

        session.active = true
        session.activeAt = Math.max(session.activeAt, t)
        session.thinking = nextThinking
        session.thinkingAt = t
        const payloadRuntimeConfigVersion = normalizeRuntimeConfigVersion(payload.runtimeConfigVersion)
        const canApplyRuntimeFromAlive = payloadRuntimeConfigVersion !== null
            ? payloadRuntimeConfigVersion >= previousRuntimeConfigVersion
            : previousRuntimeConfigVersion === 0

        if (canApplyRuntimeFromAlive) {
            if (payloadRuntimeConfigVersion !== null) {
                session.runtimeConfigVersion = payloadRuntimeConfigVersion
            }
            if (payload.permissionMode !== undefined) {
                session.permissionMode = payload.permissionMode
            }
            if (payload.modelMode !== undefined) {
                session.modelMode = payload.modelMode
            }
            if (payload.reasoningEffort !== undefined) {
                session.reasoningEffort = payload.reasoningEffort
            }
        }

        const lastBroadcastAt = this.lastBroadcastAtBySessionId.get(session.id) ?? 0
        const modeChanged = previousPermissionMode !== session.permissionMode
            || previousModelMode !== session.modelMode
            || previousReasoningEffort !== session.reasoningEffort
        const shouldBroadcast = (!wasActive && session.active)
            || (wasThinking !== session.thinking)
            || modeChanged
            || (now - lastBroadcastAt > 10_000)

        if (shouldBroadcast) {
            this.lastBroadcastAtBySessionId.set(session.id, now)
            this.publisher.emit({
                type: 'session-updated',
                sessionId: session.id,
                data: {
                    activeAt: session.activeAt,
                    thinking: session.thinking,
                    runtimeConfigVersion: session.runtimeConfigVersion,
                    permissionMode: session.permissionMode,
                    modelMode: session.modelMode,
                    reasoningEffort: session.reasoningEffort
                }
            })
        }
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        const t = clampAliveTime(payload.time) ?? Date.now()

        const session = this.sessions.get(payload.sid) ?? this.refreshSession(payload.sid)
        if (!session) return

        if (!session.active && !session.thinking) {
            return
        }

        session.work ??= { current: null, last: null }
        if (session.thinking && session.work.current) {
            const startedAt = session.work.current.startedAt
            const endedAt = t
            session.work.last = {
                startedAt,
                endedAt,
                durationMs: Math.max(0, endedAt - startedAt)
            }
            session.work.current = null
        }

        session.active = false
        session.thinking = false
        session.thinkingAt = t

        this.publisher.emit({ type: 'session-updated', sessionId: session.id, data: { active: false, thinking: false } })
    }

    expireInactive(now: number = Date.now()): void {
        const sessionTimeoutMs = 30_000

        for (const session of this.sessions.values()) {
            if (!session.active) continue
            if (now - session.activeAt <= sessionTimeoutMs) continue

            session.work ??= { current: null, last: null }
            if (session.thinking && session.work.current) {
                const startedAt = session.work.current.startedAt
                const endedAt = now
                session.work.last = {
                    startedAt,
                    endedAt,
                    durationMs: Math.max(0, endedAt - startedAt)
                }
                session.work.current = null
            }

            session.active = false
            session.thinking = false
            this.publisher.emit({ type: 'session-updated', sessionId: session.id, data: { active: false } })
        }
    }

    nextRuntimeConfigVersion(sessionId: string): number {
        const session = this.sessions.get(sessionId) ?? this.refreshSession(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }
        const current = session.runtimeConfigVersion ?? 0
        const next = current + 1
        // Reserve immediately to keep version monotonic under concurrent updates.
        session.runtimeConfigVersion = next
        return next
    }

    applySessionConfig(
        sessionId: string,
        config: { runtimeConfigVersion?: number; permissionMode?: PermissionMode; modelMode?: ModelMode; reasoningEffort?: ReasoningEffort }
    ): void {
        const session = this.sessions.get(sessionId) ?? this.refreshSession(sessionId)
        if (!session) {
            return
        }

        const incomingRuntimeConfigVersion = normalizeRuntimeConfigVersion(config.runtimeConfigVersion)
        const currentRuntimeConfigVersion = session.runtimeConfigVersion ?? 0
        const nextRuntimeConfigVersion = incomingRuntimeConfigVersion ?? (currentRuntimeConfigVersion + 1)
        if (nextRuntimeConfigVersion < currentRuntimeConfigVersion) {
            return
        }
        session.runtimeConfigVersion = nextRuntimeConfigVersion

        if (config.permissionMode !== undefined) {
            session.permissionMode = config.permissionMode
        }
        if (config.modelMode !== undefined) {
            session.modelMode = config.modelMode
        }
        if (config.reasoningEffort !== undefined) {
            session.reasoningEffort = config.reasoningEffort
        }

        this.publisher.emit({ type: 'session-updated', sessionId, data: session })
    }

    async renameSession(sessionId: string, name: string): Promise<void> {
        const session = this.sessions.get(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }

        const currentMetadata = session.metadata ?? { path: '', host: '' }
        const newMetadata = { ...currentMetadata, name }

        const result = this.store.sessions.updateSessionMetadata(
            sessionId,
            newMetadata,
            session.metadataVersion,
            session.namespace,
            { touchUpdatedAt: false }
        )

        if (result.result === 'error') {
            throw new Error('Failed to update session metadata')
        }

        if (result.result === 'version-mismatch') {
            throw new Error('Session was modified concurrently. Please try again.')
        }

        this.refreshSession(sessionId)
    }

    async deleteSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }

        if (session.active) {
            throw new Error('Cannot delete active session')
        }

        const deleted = this.store.sessions.deleteSession(sessionId, session.namespace)
        if (!deleted) {
            throw new Error('Failed to delete session')
        }

        this.sessions.delete(sessionId)
        this.lastBroadcastAtBySessionId.delete(sessionId)
        this.todoBackfillAttemptedSessionIds.delete(sessionId)

        this.publisher.emit({ type: 'session-removed', sessionId, namespace: session.namespace })
    }

    async mergeSessions(oldSessionId: string, newSessionId: string, namespace: string): Promise<void> {
        if (oldSessionId === newSessionId) {
            return
        }

        const oldStored = this.store.sessions.getSessionByNamespace(oldSessionId, namespace)
        const newStored = this.store.sessions.getSessionByNamespace(newSessionId, namespace)
        if (!oldStored || !newStored) {
            throw new Error('Session not found for merge')
        }

        this.store.messages.mergeSessionMessages(oldSessionId, newSessionId)

        const mergedMetadata = this.mergeSessionMetadata(oldStored.metadata, newStored.metadata)
        if (mergedMetadata !== null && mergedMetadata !== newStored.metadata) {
            for (let attempt = 0; attempt < 2; attempt += 1) {
                const latest = this.store.sessions.getSessionByNamespace(newSessionId, namespace)
                if (!latest) break
                const result = this.store.sessions.updateSessionMetadata(
                    newSessionId,
                    mergedMetadata,
                    latest.metadataVersion,
                    namespace,
                    { touchUpdatedAt: false }
                )
                if (result.result === 'success') {
                    break
                }
                if (result.result === 'error') {
                    break
                }
            }
        }

        if (oldStored.todos !== null && oldStored.todosUpdatedAt !== null) {
            this.store.sessions.setSessionTodos(
                newSessionId,
                oldStored.todos,
                oldStored.todosUpdatedAt,
                namespace
            )
        }

        const deleted = this.store.sessions.deleteSession(oldSessionId, namespace)
        if (!deleted) {
            throw new Error('Failed to delete old session during merge')
        }

        const existed = this.sessions.delete(oldSessionId)
        if (existed) {
            this.publisher.emit({ type: 'session-removed', sessionId: oldSessionId, namespace })
        }
        this.lastBroadcastAtBySessionId.delete(oldSessionId)
        this.todoBackfillAttemptedSessionIds.delete(oldSessionId)

        this.refreshSession(newSessionId)
    }

    private mergeSessionMetadata(oldMetadata: unknown | null, newMetadata: unknown | null): unknown | null {
        if (!oldMetadata || typeof oldMetadata !== 'object') {
            return newMetadata
        }
        if (!newMetadata || typeof newMetadata !== 'object') {
            return oldMetadata
        }

        const oldObj = oldMetadata as Record<string, unknown>
        const newObj = newMetadata as Record<string, unknown>
        const merged: Record<string, unknown> = { ...newObj }
        let changed = false

        if (typeof oldObj.name === 'string' && typeof newObj.name !== 'string') {
            merged.name = oldObj.name
            changed = true
        }

        const oldSummary = oldObj.summary as { text?: unknown; updatedAt?: unknown } | undefined
        const newSummary = newObj.summary as { text?: unknown; updatedAt?: unknown } | undefined
        const oldUpdatedAt = typeof oldSummary?.updatedAt === 'number' ? oldSummary.updatedAt : null
        const newUpdatedAt = typeof newSummary?.updatedAt === 'number' ? newSummary.updatedAt : null
        if (oldUpdatedAt !== null && (newUpdatedAt === null || oldUpdatedAt > newUpdatedAt)) {
            merged.summary = oldSummary
            changed = true
        }

        if (oldObj.worktree && !newObj.worktree) {
            merged.worktree = oldObj.worktree
            changed = true
        }

        if (typeof oldObj.path === 'string' && typeof newObj.path !== 'string') {
            merged.path = oldObj.path
            changed = true
        }
        if (typeof oldObj.host === 'string' && typeof newObj.host !== 'string') {
            merged.host = oldObj.host
            changed = true
        }

        return changed ? merged : newMetadata
    }
}
