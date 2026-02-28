import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { NewSession, type NewSessionInitialPreset } from './index'

const mockGetRecentPaths = vi.fn(() => [])
const mockGetLastUsedMachineId = vi.fn(() => null)
const mockSpawnSession = vi.fn()
const mockHapticNotification = vi.fn()
const mockAddRecentPath = vi.fn()
const mockSetLastUsedMachineId = vi.fn()

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: mockHapticNotification,
        },
    }),
}))

vi.mock('@/hooks/mutations/useSpawnSession', () => ({
    useSpawnSession: () => ({
        spawnSession: mockSpawnSession,
        isPending: false,
        error: null,
    }),
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: () => ({
        activeSessions: [],
        archivedSessions: [],
        archivedTotal: 0,
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
        addRecentPath: mockAddRecentPath,
        getLastUsedMachineId: mockGetLastUsedMachineId,
        setLastUsedMachineId: mockSetLastUsedMachineId,
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
        cleanup()
        vi.clearAllMocks()
        localStorage.clear()
        mockSpawnSession.mockReset()
        mockHapticNotification.mockReset()
        mockAddRecentPath.mockReset()
        mockSetLastUsedMachineId.mockReset()
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

    it('recovers successful spawn after transient 502 and routes to recovered session', async () => {
        mockSpawnSession.mockRejectedValueOnce(new Error('HTTP 502 Bad Gateway: Upstream returned an HTML error page'))
        const onSuccess = vi.fn()

        const api = {
            checkMachinePathsExists: vi.fn(async () => ({ exists: {} })),
            getSessions: vi.fn(async () => ({
                sessions: [{
                    id: 'session-recovered',
                    active: true,
                    thinking: false,
                    activeAt: Date.now(),
                    updatedAt: Date.now(),
                    work: undefined,
                    metadata: {
                        path: '/projects/recovered',
                        machineId: 'machine-1'
                    },
                    todoProgress: null,
                    pendingRequestsCount: 0
                }]
            }))
        } as unknown as ApiClient

        const view = render(
            <I18nProvider>
                <NewSession
                    api={api}
                    machines={machines}
                    initialPreset={{
                        directory: '/projects/recovered',
                        machineId: 'machine-1',
                        agent: 'codex'
                    }}
                    onCancel={vi.fn()}
                    onSuccess={onSuccess}
                />
            </I18nProvider>
        )

        const createButton = await view.findByRole('button', { name: /Create|创建/ })
        fireEvent.click(createButton)

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledWith('session-recovered')
        })
    })
})
