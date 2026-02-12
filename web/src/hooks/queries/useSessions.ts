import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

const EMPTY_SESSIONS: SessionSummary[] = []

export function useSessions(api: ApiClient | null): {
    activeSessions: SessionSummary[]
    archivedSessions: SessionSummary[]
    archivedTotal: number
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const activeQuery = useQuery({
        queryKey: queryKeys.activeSessions,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getSessions({ archived: false })
        },
        enabled: Boolean(api),
    })

    const archivedQuery = useQuery({
        queryKey: queryKeys.archivedSessions,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getSessions({ archived: true })
        },
        enabled: Boolean(api),
    })

    const refetch = useCallback(async () => {
        const [activeResult, archivedResult] = await Promise.all([
            activeQuery.refetch(),
            archivedQuery.refetch(),
        ])
        return { activeResult, archivedResult }
    }, [activeQuery, archivedQuery])

    const activeSessions = activeQuery.data?.sessions ?? EMPTY_SESSIONS
    const archivedSessions = archivedQuery.data?.sessions ?? EMPTY_SESSIONS
    const archivedTotal = archivedSessions.length

    const queryError = activeQuery.error ?? archivedQuery.error

    return {
        activeSessions,
        archivedSessions,
        archivedTotal,
        isLoading: activeQuery.isLoading || archivedQuery.isLoading,
        error: queryError instanceof Error ? queryError.message : queryError ? 'Failed to load sessions' : null,
        refetch,
    }
}
