import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

const TRANSIENT_SESSION_LOAD_PATTERNS = [
    'failed to fetch',
    'network error',
    'bad gateway',
    'gateway timeout',
    'service unavailable',
    'upstream returned an html error page'
]

export function isTransientSessionLoadErrorMessage(rawMessage: string): boolean {
    const message = rawMessage.toLowerCase()
    if (/http\s5\d{2}/.test(message)) {
        return true
    }
    return TRANSIENT_SESSION_LOAD_PATTERNS.some((pattern) => message.includes(pattern))
}

export function useSession(api: ApiClient | null, sessionId: string | null): {
    session: Session | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'
    const query = useQuery({
        queryKey: queryKeys.session(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getSession(sessionId)
        },
        enabled: Boolean(api && sessionId),
        retry: (failureCount, error) => {
            if (!(error instanceof Error)) {
                return false
            }
            if (!isTransientSessionLoadErrorMessage(error.message)) {
                return false
            }
            return failureCount < 2
        },
        refetchInterval: (query) => {
            const currentError = query.state.error
            if (!(currentError instanceof Error)) {
                return false
            }
            if (!isTransientSessionLoadErrorMessage(currentError.message)) {
                return false
            }
            return 1_500
        }
    })

    return {
        session: query.data?.session ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load session' : null,
        refetch: query.refetch,
    }
}
