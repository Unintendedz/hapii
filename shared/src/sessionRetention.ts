type SessionRetentionWork = {
    current?: { startedAt: number } | null
} | undefined

type SessionRetentionSnapshot = {
    updatedAt: number
    thinking: boolean
    pendingRequestsCount?: number
    work?: SessionRetentionWork
}

export const STALE_SESSION_HIDE_MS = 12 * 60 * 60 * 1000
export const AUTO_ARCHIVE_IDLE_SESSION_MS = 24 * 60 * 60 * 1000
export const AUTO_ARCHIVE_IDLE_SESSION_REASON = 'Auto-archived after 24 hours of inactivity'

function normalizeTimestampMs(value: number | undefined | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0
    }
    return value < 1_000_000_000_000 ? value * 1000 : value
}

export function isSessionBusy(snapshot: SessionRetentionSnapshot): boolean {
    return snapshot.thinking
        || Boolean(snapshot.work?.current)
        || (snapshot.pendingRequestsCount ?? 0) > 0
}

export function getSessionRetentionActivityAt(snapshot: SessionRetentionSnapshot): number {
    return Math.max(
        normalizeTimestampMs(snapshot.updatedAt),
        normalizeTimestampMs(snapshot.work?.current?.startedAt)
    )
}

export function shouldHideSessionInList(
    snapshot: SessionRetentionSnapshot,
    now: number = Date.now()
): boolean {
    if (isSessionBusy(snapshot)) {
        return false
    }

    return now - getSessionRetentionActivityAt(snapshot) > STALE_SESSION_HIDE_MS
}

export function shouldAutoArchiveSession(
    snapshot: SessionRetentionSnapshot,
    now: number = Date.now()
): boolean {
    if (isSessionBusy(snapshot)) {
        return false
    }

    return now - getSessionRetentionActivityAt(snapshot) > AUTO_ARCHIVE_IDLE_SESSION_MS
}
