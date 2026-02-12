import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionList } from './SessionList'

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: ({ onClick }: { onClick?: () => void }) => ({
        onClick,
    }),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        },
    }),
}))

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        abortSession: async () => {},
        archiveSession: async () => {},
        switchSession: async () => {},
        setPermissionMode: async () => {},
        setModelMode: async () => {},
        renameSession: async () => {},
        deleteSession: async () => {},
        isPending: false,
    }),
}))

function makeArchivedSession(
    id: string,
    path: string,
    updatedAt: number,
    name: string
): SessionSummary {
    return {
        id,
        active: false,
        thinking: false,
        pendingRequestsCount: 0,
        updatedAt,
        modelMode: 'default',
        metadata: {
            name,
            path,
            host: 'host',
            flavor: 'codex',
        },
    } as unknown as SessionSummary
}

function makeActiveSession(
    id: string,
    path: string,
    updatedAt: number,
    name: string
): SessionSummary {
    const base = makeArchivedSession(id, path, updatedAt, name)
    return {
        ...base,
        active: true,
    }
}

function makeProjectSessions(projectKey: string, path: string, count: number, startTs: number): SessionSummary[] {
    return Array.from({ length: count }, (_, index) => {
        const n = index + 1
        const padded = String(n).padStart(2, '0')
        return makeArchivedSession(
            `${projectKey}-${padded}`,
            path,
            startTs - index,
            `${projectKey}-${padded}`
        )
    })
}

describe('SessionList archived load more behavior', () => {
    beforeEach(() => {
        cleanup()
        vi.clearAllMocks()
        localStorage.clear()
    })

    it('renders one lightweight load-more row for each archived project with hidden sessions', () => {
        render(
            <I18nProvider>
                <SessionList
                    activeSessions={[]}
                    archivedSessions={[
                        ...makeProjectSessions('alpha', '/projects/alpha', 10, 1_700_001_000),
                        ...makeProjectSessions('beta', '/projects/beta', 10, 1_700_000_000),
                    ]}
                    archivedTotal={20}
                    onSelect={vi.fn()}
                    onNewSession={vi.fn()}
                    onRefresh={vi.fn()}
                    isLoading={false}
                    api={null}
                />
            </I18nProvider>
        )

        fireEvent.click(screen.getAllByRole('button', { name: /^Archived/ })[0])

        const loadMoreRows = screen.getAllByRole('button', { name: 'Load more archived sessions' })
        expect(loadMoreRows).toHaveLength(2)
        expect(loadMoreRows[0].className).not.toContain('rounded-md')
        expect(loadMoreRows[0].className).not.toContain('border')
    })

    it('loads only the clicked archived project instead of all projects', () => {
        render(
            <I18nProvider>
                <SessionList
                    activeSessions={[]}
                    archivedSessions={[
                        ...makeProjectSessions('alpha', '/projects/alpha', 10, 1_700_001_000),
                        ...makeProjectSessions('beta', '/projects/beta', 10, 1_700_000_000),
                    ]}
                    archivedTotal={20}
                    onSelect={vi.fn()}
                    onNewSession={vi.fn()}
                    onRefresh={vi.fn()}
                    isLoading={false}
                    api={null}
                />
            </I18nProvider>
        )

        fireEvent.click(screen.getAllByRole('button', { name: /^Archived/ })[0])

        expect(screen.queryByText('alpha-09')).toBeNull()
        expect(screen.queryByText('beta-09')).toBeNull()

        const loadMoreRows = screen.getAllByRole('button', { name: 'Load more archived sessions' })
        fireEvent.click(loadMoreRows[0])

        expect(screen.getByText('alpha-09')).toBeTruthy()
        expect(screen.getByText('alpha-10')).toBeTruthy()
        expect(screen.queryByText('beta-09')).toBeNull()
        expect(screen.queryByText('beta-10')).toBeNull()

        expect(screen.getAllByRole('button', { name: 'Load more archived sessions' })).toHaveLength(1)
    })

    it('does not pin archived section to viewport when expanded', () => {
        render(
            <I18nProvider>
                <SessionList
                    activeSessions={[
                        makeActiveSession('active-1', '/projects/live', 1_700_001_500, 'active-1'),
                    ]}
                    archivedSessions={[
                        ...makeProjectSessions('alpha', '/projects/alpha', 10, 1_700_001_000),
                    ]}
                    archivedTotal={10}
                    onSelect={vi.fn()}
                    onNewSession={vi.fn()}
                    onRefresh={vi.fn()}
                    isLoading={false}
                    api={null}
                />
            </I18nProvider>
        )

        const archivedToggle = screen.getByRole('button', { name: /^Archived/ })
        fireEvent.click(archivedToggle)

        const archivedSection = archivedToggle.closest('div')
        expect(archivedSection).toBeTruthy()
        expect(archivedSection?.className).not.toContain('sticky')
        expect(archivedSection?.className).not.toContain('bottom-0')
    })
})
