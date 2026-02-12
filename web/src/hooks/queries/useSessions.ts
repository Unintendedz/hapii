import { useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

const ARCHIVED_PAGE_SIZE = 8
const EMPTY_SESSIONS: SessionSummary[] = []

export function useSessions(api: ApiClient | null): {
    activeSessions: SessionSummary[]
    archivedSessions: SessionSummary[]
    archivedTotal: number
    hasMoreArchived: boolean
    isLoadingMoreArchived: boolean
    loadMoreArchived: () => Promise<unknown>
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

    const archivedQuery = useInfiniteQuery({
        queryKey: queryKeys.archivedSessions(ARCHIVED_PAGE_SIZE),
        queryFn: async ({ pageParam }) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            if (!Number.isInteger(pageParam) || pageParam < 0) {
                throw new Error('Invalid archived sessions offset')
            }
            return await api.getSessions({
                archived: true,
                limit: ARCHIVED_PAGE_SIZE,
                offset: pageParam
            })
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            const page = lastPage.page
            if (!page || !page.hasMore || page.nextOffset === null) {
                return undefined
            }
            return page.nextOffset
        },
        enabled: Boolean(api),
    })

    const loadMoreArchived = useCallback(async () => {
        if (!archivedQuery.hasNextPage || archivedQuery.isFetchingNextPage) {
            return
        }
        return await archivedQuery.fetchNextPage()
    }, [archivedQuery])

    const refetch = useCallback(async () => {
        const [activeResult, archivedResult] = await Promise.all([
            activeQuery.refetch(),
            archivedQuery.refetch(),
        ])
        return { activeResult, archivedResult }
    }, [activeQuery, archivedQuery])

    const activeSessions = activeQuery.data?.sessions ?? EMPTY_SESSIONS
    const archivedPages = archivedQuery.data?.pages
    const archivedSessions = useMemo(() => {
        if (!archivedPages) {
            return EMPTY_SESSIONS
        }
        return archivedPages.flatMap((page) => page.sessions)
    }, [archivedPages])
    const archivedTotal = archivedPages?.[0]?.page?.total ?? archivedSessions.length

    const queryError = activeQuery.error ?? archivedQuery.error

    return {
        activeSessions,
        archivedSessions,
        archivedTotal,
        hasMoreArchived: archivedQuery.hasNextPage ?? false,
        isLoadingMoreArchived: archivedQuery.isFetchingNextPage,
        loadMoreArchived,
        isLoading: activeQuery.isLoading || archivedQuery.isLoading,
        error: queryError instanceof Error ? queryError.message : queryError ? 'Failed to load sessions' : null,
        refetch,
    }
}
