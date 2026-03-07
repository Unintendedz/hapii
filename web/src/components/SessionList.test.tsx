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

        const loadMoreRows = screen.getAllByRole('button', { name: 'Load more sessions' })
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

        const loadMoreRows = screen.getAllByRole('button', { name: 'Load more sessions' })
        fireEvent.click(loadMoreRows[0])

        expect(screen.getByText('alpha-09')).toBeTruthy()
        expect(screen.getByText('alpha-10')).toBeTruthy()
        expect(screen.queryByText('beta-09')).toBeNull()
        expect(screen.queryByText('beta-10')).toBeNull()

        expect(screen.getAllByRole('button', { name: 'Load more sessions' })).toHaveLength(1)
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

    it('shows quick-create for both active and archived projects without hover-only classes', () => {
        const onQuickCreateInDirectory = vi.fn()

        render(
            <I18nProvider>
                <SessionList
                    activeSessions={[
                        makeActiveSession('active-1', '/projects/live', 1_700_001_500, 'active-1'),
                    ]}
                    archivedSessions={[
                        ...makeProjectSessions('alpha', '/projects/alpha', 2, 1_700_001_000),
                    ]}
                    archivedTotal={2}
                    onQuickCreateInDirectory={onQuickCreateInDirectory}
                    onSelect={vi.fn()}
                    onNewSession={vi.fn()}
                    onRefresh={vi.fn()}
                    isLoading={false}
                    api={null}
                />
            </I18nProvider>
        )

        fireEvent.click(screen.getByRole('button', { name: /^Archived/ }))

        const quickCreateButtons = screen.getAllByRole('button', { name: 'New in this project' })
        expect(quickCreateButtons).toHaveLength(2)
        expect(quickCreateButtons[0].className).not.toContain('md:opacity-0')
        expect(quickCreateButtons[0].className).not.toContain('md:group-hover:opacity-100')

        fireEvent.click(quickCreateButtons[1])
        expect(onQuickCreateInDirectory).toHaveBeenCalledTimes(1)
        expect(onQuickCreateInDirectory).toHaveBeenCalledWith({
            directory: '/projects/alpha',
            seedSession: expect.objectContaining({ id: 'alpha-01' })
        })
    })

    it('hides unarchived sessions older than 12 hours behind the same load-more row', () => {
        const now = Date.now()

        render(
            <I18nProvider>
                <SessionList
                    activeSessions={[
                        makeActiveSession('alpha-live', '/projects/alpha', now, 'alpha-live'),
                        makeArchivedSession(
                            'alpha-recent',
                            '/projects/alpha',
                            now - (2 * 60 * 60 * 1000),
                            'alpha-recent'
                        ),
                        makeArchivedSession(
                            'alpha-old-1',
                            '/projects/alpha',
                            now - (13 * 60 * 60 * 1000),
                            'alpha-old-1'
                        ),
                        makeArchivedSession(
                            'alpha-old-2',
                            '/projects/alpha',
                            now - (14 * 60 * 60 * 1000),
                            'alpha-old-2'
                        ),
                    ]}
                    archivedSessions={[]}
                    archivedTotal={0}
                    onSelect={vi.fn()}
                    onNewSession={vi.fn()}
                    onRefresh={vi.fn()}
                    isLoading={false}
                    api={null}
                />
            </I18nProvider>
        )

        expect(screen.getByText('alpha-live')).toBeTruthy()
        expect(screen.getByText('alpha-recent')).toBeTruthy()
        expect(screen.queryByText('alpha-old-1')).toBeNull()
        expect(screen.queryByText('alpha-old-2')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Load more sessions' }))

        expect(screen.getByText('alpha-old-1')).toBeTruthy()
        expect(screen.getByText('alpha-old-2')).toBeTruthy()
    })
})
