import { useMemo, useRef } from 'react'
import type { SessionSummary } from '@/types/api'

function areSameStringArrays(a: string[], b: string[]): boolean {
    if (a === b) {
        return true
    }

    if (a.length !== b.length) {
        return false
    }

    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) {
            return false
        }
    }

    return true
}

export function useDirectorySuggestions(
    machineId: string | null,
    sessions: SessionSummary[],
    recentPaths: string[]
): string[] {
    const cachedRef = useRef<string[]>([])

    return useMemo(() => {
        const machineSessions = machineId
            ? sessions.filter((session) => session.metadata?.machineId === machineId)
            : sessions

        const sessionPaths = machineSessions
            .map((session) => session.metadata?.path)
            .filter((path): path is string => Boolean(path))

        const worktreePaths = machineSessions
            .map((session) => session.metadata?.worktree?.basePath)
            .filter((path): path is string => Boolean(path))

        const dedupedRecent = [...new Set(recentPaths)]
        const recentSet = new Set(dedupedRecent)

        const otherPaths = [...new Set([...sessionPaths, ...worktreePaths])]
            .filter((path) => !recentSet.has(path))
            .sort((a, b) => a.localeCompare(b))

        const next = [...dedupedRecent, ...otherPaths]
        if (areSameStringArrays(cachedRef.current, next)) {
            return cachedRef.current
        }

        cachedRef.current = next
        return next
    }, [machineId, sessions, recentPaths])
}
