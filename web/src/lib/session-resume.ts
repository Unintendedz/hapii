import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

const DEFAULT_STARTING_SESSION_WINDOW_MS = 120_000
const DEFAULT_STARTING_NEVER_ALIVE_THRESHOLD_MS = 1_000
const DEFAULT_INACTIVE_GRACE_TIMEOUT_MS = 2_000
const DEFAULT_WARMUP_TIMEOUT_MS = 90_000
const DEFAULT_WARMUP_POLL_MS = 250

function getResumeToken(session: Session | null | undefined): string | null {
    const metadata = session?.metadata
    if (!metadata) {
        return null
    }

    const flavor = metadata.flavor === 'codex' || metadata.flavor === 'gemini' || metadata.flavor === 'opencode'
        ? metadata.flavor
        : 'claude'

    const token = flavor === 'codex'
        ? metadata.codexSessionId
        : flavor === 'gemini'
            ? metadata.geminiSessionId
            : flavor === 'opencode'
                ? metadata.opencodeSessionId
                : metadata.claudeSessionId

    return token && token.trim().length > 0 ? token : null
}

export function isStartingInactiveSession(
    session: Session | null | undefined,
    options?: {
        nowMs?: number
        startingSessionWindowMs?: number
        neverAliveThresholdMs?: number
    }
): boolean {
    if (!session || session.active) {
        return false
    }

    // If we archived this session intentionally, treat it as resumable, not "starting".
    if (session.metadata?.lifecycleState === 'archived') {
        return false
    }

    const nowMs = options?.nowMs ?? Date.now()
    const startingSessionWindowMs = options?.startingSessionWindowMs ?? DEFAULT_STARTING_SESSION_WINDOW_MS
    const neverAliveThresholdMs = options?.neverAliveThresholdMs ?? DEFAULT_STARTING_NEVER_ALIVE_THRESHOLD_MS

    const createdDelta = nowMs - session.createdAt
    if (createdDelta > startingSessionWindowMs) {
        return false
    }

    // We only consider a session "starting" if we have never observed it alive yet.
    // (If it was alive and then went inactive, we should resume instead of waiting.)
    return session.activeAt <= session.createdAt + neverAliveThresholdMs
}

async function waitForActive(options: {
    pollMs: number
    timeoutMs: number
    now: () => number
    sleep: (ms: number) => Promise<void>
    fetchLatestSession: () => Promise<Session>
    getLatestSession: () => Session | null
}): Promise<boolean> {
    const deadline = options.now() + options.timeoutMs
    while (options.now() < deadline) {
        await options.sleep(options.pollMs)

        try {
            await options.fetchLatestSession()
        } catch {
            continue
        }

        if (options.getLatestSession()?.active) {
            return true
        }
    }

    return Boolean(options.getLatestSession()?.active)
}

export async function resolveSessionIdForSend(options: {
    api: ApiClient
    sessionId: string
    session: Session | null
    syncSessionCache?: (session: Session) => void
    now?: () => number
    sleep?: (ms: number) => Promise<void>
    startingSessionWindowMs?: number
    startingNeverAliveThresholdMs?: number
    inactiveGraceTimeoutMs?: number
    warmupTimeoutMs?: number
    warmupPollMs?: number
}): Promise<string> {
    const now = options.now ?? (() => Date.now())
    const sleep = options.sleep ?? (async (ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, ms))
    })

    const startingSessionWindowMs = options.startingSessionWindowMs ?? DEFAULT_STARTING_SESSION_WINDOW_MS
    const startingNeverAliveThresholdMs = options.startingNeverAliveThresholdMs ?? DEFAULT_STARTING_NEVER_ALIVE_THRESHOLD_MS
    const inactiveGraceTimeoutMs = options.inactiveGraceTimeoutMs ?? DEFAULT_INACTIVE_GRACE_TIMEOUT_MS
    const warmupTimeoutMs = options.warmupTimeoutMs ?? DEFAULT_WARMUP_TIMEOUT_MS
    const warmupPollMs = options.warmupPollMs ?? DEFAULT_WARMUP_POLL_MS

    let latestSession = options.session

    const fetchLatestSession = async (): Promise<Session> => {
        const response = await options.api.getSession(options.sessionId)
        const fetched = response.session
        latestSession = fetched
        options.syncSessionCache?.(fetched)
        return fetched
    }

    if (!latestSession) {
        await fetchLatestSession()
    } else if (!latestSession.active) {
        try {
            await fetchLatestSession()
        } catch {
        }
    }

    if (latestSession?.active) {
        return options.sessionId
    }

    // Transient disconnects happen. Wait a moment before attempting to resume.
    const becameActiveDuringGrace = await waitForActive({
        pollMs: warmupPollMs,
        timeoutMs: inactiveGraceTimeoutMs,
        now,
        sleep,
        fetchLatestSession,
        getLatestSession: () => latestSession
    })
    if (becameActiveDuringGrace) {
        return options.sessionId
    }

    if (isStartingInactiveSession(latestSession, {
        nowMs: now(),
        startingSessionWindowMs,
        neverAliveThresholdMs: startingNeverAliveThresholdMs
    })) {
        const becameActive = await waitForActive({
            pollMs: warmupPollMs,
            timeoutMs: warmupTimeoutMs,
            now,
            sleep,
            fetchLatestSession,
            getLatestSession: () => latestSession
        })

        if (becameActive) {
            return options.sessionId
        }

        throw new Error('Session is still starting. Please wait a moment and retry.')
    }

    const resumeToken = getResumeToken(latestSession)
    if (!resumeToken) {
        throw new Error('Resume session ID unavailable')
    }

    return await options.api.resumeSession(options.sessionId)
}
