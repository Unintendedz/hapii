import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { NewSession, type NewSessionInitialPreset } from './index'

const mockGetRecentPaths = vi.fn(() => [])
const mockGetLastUsedMachineId = vi.fn(() => null)

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: vi.fn(),
        },
    }),
}))

vi.mock('@/hooks/mutations/useSpawnSession', () => ({
    useSpawnSession: () => ({
        spawnSession: vi.fn(),
        isPending: false,
        error: null,
    }),
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: () => ({
        activeSessions: [],
        archivedSessions: [],
        archivedTotal: 0,
        hasMoreArchived: false,
        isLoadingMoreArchived: false,
        loadMoreArchived: async () => null,
        isLoading: false,
        error: null,
        refetch: async () => null,
    }),
}))

vi.mock('@/hooks/useDirectorySuggestions', () => ({
    useDirectorySuggestions: () => [],
}))

vi.mock('@/hooks/useActiveSuggestions', () => ({
    useActiveSuggestions: () => [[], -1, vi.fn(), vi.fn(), vi.fn()] as const,
}))

vi.mock('@/hooks/useRecentPaths', () => ({
    useRecentPaths: () => ({
        getRecentPaths: mockGetRecentPaths,
        addRecentPath: vi.fn(),
        getLastUsedMachineId: mockGetLastUsedMachineId,
        setLastUsedMachineId: vi.fn(),
    }),
}))

const machines: Machine[] = [
    {
        id: 'machine-1',
        active: true,
        metadata: {
            host: 'macbookpro.local',
            platform: 'darwin',
            happyCliVersion: '0.0.0',
        },
    },
]

function renderNewSession(initialPreset?: NewSessionInitialPreset) {
    const api = {
        checkMachinePathsExists: vi.fn(async () => ({ exists: {} })),
    } as unknown as ApiClient

    return render(
        <I18nProvider>
            <NewSession
                api={api}
                machines={machines}
                initialPreset={initialPreset}
                onCancel={vi.fn()}
                onSuccess={vi.fn()}
            />
        </I18nProvider>
    )
}

describe('NewSession preset sync', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
    })

    it('updates directory across project quick-create and global new entry', async () => {
        const { rerender } = renderNewSession({
            directory: '/projects/alpha',
            machineId: 'machine-1',
            agent: 'codex',
        })

        await waitFor(() => {
            expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('/projects/alpha')
        })

        rerender(
            <I18nProvider>
                <NewSession
                    api={{ checkMachinePathsExists: vi.fn(async () => ({ exists: {} })) } as unknown as ApiClient}
                    machines={machines}
                    initialPreset={{}}
                    onCancel={vi.fn()}
                    onSuccess={vi.fn()}
                />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('')
        })

        rerender(
            <I18nProvider>
                <NewSession
                    api={{ checkMachinePathsExists: vi.fn(async () => ({ exists: {} })) } as unknown as ApiClient}
                    machines={machines}
                    initialPreset={{
                        directory: '/projects/beta',
                        machineId: 'machine-1',
                        agent: 'codex',
                    }}
                    onCancel={vi.fn()}
                    onSuccess={vi.fn()}
                />
            </I18nProvider>
        )

        await waitFor(() => {
            expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('/projects/beta')
        })
    })
})
