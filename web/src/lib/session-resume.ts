import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

const DEFAULT_FRESH_SESSION_WINDOW_MS = 20_000
const DEFAULT_WARMUP_TIMEOUT_MS = 8_000
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

function isFreshInactiveSession(session: Session | null | undefined, nowMs: number, freshWindowMs: number): boolean {
    if (!session || session.active) {
        return false
    }

    const createdDelta = nowMs - session.createdAt
    const updatedDelta = nowMs - session.updatedAt
    return createdDelta <= freshWindowMs || updatedDelta <= freshWindowMs
}

export async function resolveSessionIdForSend(options: {
    api: ApiClient
    sessionId: string
    session: Session | null
    syncSessionCache?: (session: Session) => void
    now?: () => number
    sleep?: (ms: number) => Promise<void>
    freshSessionWindowMs?: number
    warmupTimeoutMs?: number
    warmupPollMs?: number
}): Promise<string> {
    const now = options.now ?? (() => Date.now())
    const sleep = options.sleep ?? (async (ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, ms))
    })
    const freshSessionWindowMs = options.freshSessionWindowMs ?? DEFAULT_FRESH_SESSION_WINDOW_MS
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

    if (!latestSession || !latestSession.active) {
        if (!latestSession) {
            await fetchLatestSession()
        } else {
            try {
                await fetchLatestSession()
            } catch {
            }
        }
    }

    if (latestSession?.active) {
        return options.sessionId
    }

    let resumeToken = getResumeToken(latestSession)

    if (!resumeToken && isFreshInactiveSession(latestSession, now(), freshSessionWindowMs)) {
        const deadline = now() + warmupTimeoutMs
        while (now() < deadline) {
            await sleep(warmupPollMs)
            try {
                await fetchLatestSession()
            } catch {
                continue
            }

            if (latestSession?.active) {
                return options.sessionId
            }

            resumeToken = getResumeToken(latestSession)
            if (resumeToken) {
                break
            }
        }
    }

    if (!resumeToken) {
        throw new Error('Session is still starting. Please retry in a few seconds.')
    }

    return await options.api.resumeSession(options.sessionId)
}
