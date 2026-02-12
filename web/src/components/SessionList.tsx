import { useEffect, useMemo, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useTranslation } from '@/lib/use-translation'

type SessionGroup = {
    directory: string
    displayName: string
    sessions: SessionSummary[]
    latestUpdatedAt: number
    hasActiveSession: boolean
}

type GroupSection = 'active' | 'archived'

function getGroupDisplayName(directory: string): string {
    if (directory === 'Other') return directory
    const parts = directory.split(/[\\/]+/).filter(Boolean)
    if (parts.length === 0) return directory
    if (parts.length === 1) return parts[0]
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

function groupSessionsByDirectory(sessions: SessionSummary[]): SessionGroup[] {
    const groups = new Map<string, SessionSummary[]>()

    sessions.forEach(session => {
        const path = session.metadata?.worktree?.basePath ?? session.metadata?.path ?? 'Other'
        if (!groups.has(path)) {
            groups.set(path, [])
        }
        groups.get(path)!.push(session)
    })

    return Array.from(groups.entries())
        .map(([directory, groupSessions]) => {
            const sortedSessions = [...groupSessions].sort((a, b) => {
                const rankA = a.active ? (a.pendingRequestsCount > 0 ? 0 : 1) : 2
                const rankB = b.active ? (b.pendingRequestsCount > 0 ? 0 : 1) : 2
                if (rankA !== rankB) return rankA - rankB
                return b.updatedAt - a.updatedAt
            })
            const latestUpdatedAt = groupSessions.reduce(
                (max, s) => (s.updatedAt > max ? s.updatedAt : max),
                -Infinity
            )
            const hasActiveSession = groupSessions.some(s => s.active)
            const displayName = getGroupDisplayName(directory)

            return { directory, displayName, sessions: sortedSessions, latestUpdatedAt, hasActiveSession }
        })
        .sort((a, b) => {
            if (a.hasActiveSession !== b.hasActiveSession) {
                return a.hasActiveSession ? -1 : 1
            }
            return b.latestUpdatedAt - a.latestUpdatedAt
        })
}

function PlusIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    )
}

function BulbIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.2 1 2h6c0-.8.4-1.4 1-2a7 7 0 0 0-4-12Z" />
        </svg>
    )
}

function ChevronIcon(props: { className?: string; collapsed?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${props.className ?? ''} transition-transform duration-200 ${props.collapsed ? '' : 'rotate-90'}`}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function FolderIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
        </svg>
    )
}

function getSessionTitle(session: SessionSummary): string {
    if (session.metadata?.name) {
        return session.metadata.name
    }
    if (session.metadata?.summary?.text) {
        return session.metadata.summary.text
    }
    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
    }
    return session.id.slice(0, 8)
}

function getTodoProgress(session: SessionSummary): { completed: number; total: number } | null {
    if (!session.todoProgress) return null
    if (session.todoProgress.completed === session.todoProgress.total) return null
    return session.todoProgress
}

function getAgentLabel(session: SessionSummary): string {
    const flavor = session.metadata?.flavor?.trim()
    if (flavor) return flavor
    return 'unknown'
}

function formatRelativeTime(value: number, t: (key: string, params?: Record<string, string | number>) => string): string | null {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    if (!Number.isFinite(ms)) return null
    const delta = Date.now() - ms
    if (delta < 60_000) return t('session.time.justNow')
    const minutes = Math.floor(delta / 60_000)
    if (minutes < 60) return t('session.time.minutesAgo', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('session.time.hoursAgo', { n: hours })
    const days = Math.floor(hours / 24)
    if (days < 7) return t('session.time.daysAgo', { n: days })
    return new Date(ms).toLocaleDateString()
}

function SessionItem(props: {
    session: SessionSummary
    onSelect: (sessionId: string) => void
    showPath?: boolean
    compact?: boolean
    api: ApiClient | null
    selected?: boolean
}) {
    const { t } = useTranslation()
    const { session: s, onSelect, showPath = true, compact = false, api, selected = false } = props
    const { haptic } = usePlatform()
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [renameOpen, setRenameOpen] = useState(false)
    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)

    const { archiveSession, renameSession, deleteSession, isPending } = useSessionActions(
        api,
        s.id,
        s.metadata?.flavor ?? null
    )

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            setMenuAnchorPoint(point)
            setMenuOpen(true)
        },
        onClick: () => {
            if (!menuOpen) {
                onSelect(s.id)
            }
        },
        threshold: 500
    })

    const sessionName = getSessionTitle(s)
    const statusDotClass = s.active
        ? (s.thinking ? 'bg-[#007AFF]' : 'bg-[var(--app-badge-success-text)]')
        : 'bg-[var(--app-hint)]'
    const progress = getTodoProgress(s)

    return (
        <>
            <button
                type="button"
                {...longPressHandlers}
                className={`session-list-item flex w-full flex-col ${compact ? 'gap-1 px-3 py-2' : 'gap-1.5 px-3 py-3'} text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none ${selected ? 'bg-[var(--app-secondary-bg)]' : ''}`}
                style={{ WebkitTouchCallout: 'none' }}
                aria-current={selected ? 'page' : undefined}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                            <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                        </span>
                        <div className={compact ? 'truncate text-sm font-medium' : 'truncate text-[15px] font-medium'}>
                            {sessionName}
                        </div>
                    </div>
                    <div className={`flex shrink-0 items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
                        {!compact && s.thinking ? (
                            <span className="animate-pulse text-[#007AFF]">
                                {t('session.item.thinking')}
                            </span>
                        ) : null}
                        {!compact && progress ? (
                            <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                <BulbIcon className="h-3 w-3" />
                                {progress.completed}/{progress.total}
                            </span>
                        ) : null}
                        {!compact && s.pendingRequestsCount > 0 ? (
                            <span className="text-[var(--app-badge-warning-text)]">
                                {t('session.item.pending')} {s.pendingRequestsCount}
                            </span>
                        ) : null}
                        <span className="text-[var(--app-hint)]">
                            {formatRelativeTime(s.updatedAt, t)}
                        </span>
                    </div>
                </div>
                {showPath ? (
                    <div className="truncate text-xs text-[var(--app-hint)]">
                        {s.metadata?.path ?? s.id}
                    </div>
                ) : null}
                {!compact ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-hint)]">
                        <span className="inline-flex items-center gap-2">
                            <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                                ❖
                            </span>
                            {getAgentLabel(s)}
                        </span>
                        <span>{t('session.item.modelMode')}: {s.modelMode || 'default'}</span>
                        {s.metadata?.worktree?.branch ? (
                            <span>{t('session.item.worktree')}: {s.metadata.worktree.branch}</span>
                        ) : null}
                    </div>
                ) : null}
            </button>

            <SessionActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                sessionActive={s.active}
                onRename={() => setRenameOpen(true)}
                onArchive={() => setArchiveOpen(true)}
                onDelete={() => setDeleteOpen(true)}
                anchorPoint={menuAnchorPoint}
            />

            <RenameSessionDialog
                isOpen={renameOpen}
                onClose={() => setRenameOpen(false)}
                currentName={sessionName}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                isOpen={archiveOpen}
                onClose={() => setArchiveOpen(false)}
                title={t('dialog.archive.title')}
                description={t('dialog.archive.description', { name: sessionName })}
                confirmLabel={t('dialog.archive.confirm')}
                confirmingLabel={t('dialog.archive.confirming')}
                onConfirm={archiveSession}
                isPending={isPending}
                destructive
            />

            <ConfirmDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('dialog.delete.title')}
                description={t('dialog.delete.description', { name: sessionName })}
                confirmLabel={t('dialog.delete.confirm')}
                confirmingLabel={t('dialog.delete.confirming')}
                onConfirm={deleteSession}
                isPending={isPending}
                destructive
            />
        </>
    )
}

export function SessionList(props: {
    activeSessions: SessionSummary[]
    archivedSessions: SessionSummary[]
    archivedTotal: number
    hasMoreArchived: boolean
    isLoadingMoreArchived: boolean
    onLoadMoreArchived: () => void
    onQuickCreateInDirectory?: (payload: {
        directory: string
        seedSession: SessionSummary | null
    }) => void
    onSelect: (sessionId: string) => void
    onNewSession: () => void
    onRefresh: () => void
    isLoading: boolean
    renderHeader?: boolean
    api: ApiClient | null
    selectedSessionId?: string | null
}) {
    const { t } = useTranslation()
    const { renderHeader = true, api, selectedSessionId } = props
    const activeGroups = useMemo(
        () => groupSessionsByDirectory(props.activeSessions),
        [props.activeSessions]
    )
    const archivedGroups = useMemo(
        () => groupSessionsByDirectory(props.archivedSessions),
        [props.archivedSessions]
    )
    const [collapseOverrides, setCollapseOverrides] = useState<Map<string, boolean>>(
        () => new Map()
    )
    const [isArchivedSectionCollapsed, setIsArchivedSectionCollapsed] = useState(true)

    const makeGroupKey = (section: GroupSection, directory: string): string => `${section}:${directory}`

    const isGroupCollapsed = (section: GroupSection, group: SessionGroup): boolean => {
        const key = makeGroupKey(section, group.directory)
        const override = collapseOverrides.get(key)
        if (override !== undefined) return override
        if (section === 'archived') return false
        return !group.hasActiveSession
    }

    const toggleGroup = (section: GroupSection, directory: string, isCollapsed: boolean) => {
        const key = makeGroupKey(section, directory)
        setCollapseOverrides(prev => {
            const next = new Map(prev)
            next.set(key, !isCollapsed)
            return next
        })
    }

    useEffect(() => {
        setCollapseOverrides(prev => {
            if (prev.size === 0) return prev
            const knownGroups = new Set([
                ...activeGroups.map(group => makeGroupKey('active', group.directory)),
                ...archivedGroups.map(group => makeGroupKey('archived', group.directory))
            ])
            let changed = false
            const next = new Map(prev)
            for (const key of next.keys()) {
                if (!knownGroups.has(key)) {
                    next.delete(key)
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [activeGroups, archivedGroups])

    useEffect(() => {
        if (!selectedSessionId) {
            return
        }

        const selectedInArchived = archivedGroups.some((group) =>
            group.sessions.some((session) => session.id === selectedSessionId)
        )

        if (selectedInArchived) {
            setIsArchivedSectionCollapsed(false)
        }
    }, [archivedGroups, selectedSessionId])

    const renderGroups = (section: GroupSection, groups: SessionGroup[], compactItems: boolean) => {
        return groups.map((group) => {
            const isCollapsed = isGroupCollapsed(section, group)
            const quickCreateSeed = group.sessions[0] ?? null
            return (
                <div key={makeGroupKey(section, group.directory)}>
                    <div
                        className={`group flex w-full items-center gap-2 px-3 ${section === 'archived' ? 'py-1.5' : 'py-2'} text-left bg-[var(--app-bg)] border-b border-[var(--app-divider)] transition-colors hover:bg-[var(--app-secondary-bg)] ${section === 'active' ? 'sticky top-0 z-10' : ''}`}
                    >
                        <button
                            type="button"
                            onClick={() => toggleGroup(section, group.directory, isCollapsed)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                            <ChevronIcon
                                className="h-4 w-4 text-[var(--app-hint)]"
                                collapsed={isCollapsed}
                            />
                            <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-hint)]" />
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="break-words text-sm font-semibold text-[var(--app-hint)]" title={group.directory}>
                                    {group.displayName}
                                </span>
                                <span className="shrink-0 text-xs text-[var(--app-hint)]">
                                    ({group.sessions.length})
                                </span>
                            </div>
                        </button>
                        {section === 'active' && props.onQuickCreateInDirectory ? (
                            <button
                                type="button"
                                onClick={() => {
                                    props.onQuickCreateInDirectory?.({
                                        directory: group.directory,
                                        seedSession: quickCreateSeed
                                    })
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-link)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                                title={t('sessions.quickCreate')}
                                aria-label={t('sessions.quickCreate')}
                            >
                                <PlusIcon className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                    {!isCollapsed ? (
                        <div className={`ml-5 flex flex-col divide-y divide-[var(--app-divider)] border-b border-[var(--app-divider)] pl-2 ${section === 'archived' ? 'border-l border-dashed border-[var(--app-divider)]' : 'border-l border-[var(--app-divider)]'}`}>
                            {group.sessions.map((session) => (
                                <SessionItem
                                    key={session.id}
                                    session={session}
                                    onSelect={props.onSelect}
                                    showPath={false}
                                    compact={compactItems}
                                    api={api}
                                    selected={session.id === selectedSessionId}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
            )
        })
    }

    const visibleSessionsCount = props.activeSessions.length + props.archivedSessions.length
    const visibleGroupCount = activeGroups.length + archivedGroups.length
    const hasArchivedSection = props.archivedTotal > 0 || props.archivedSessions.length > 0 || props.hasMoreArchived

    return (
        <div className="mx-auto flex w-full max-w-content flex-col">
            {renderHeader ? (
                <div className="flex items-center justify-between px-3 py-1">
                    <div className="text-xs text-[var(--app-hint)]">
                        {t('sessions.count', { n: visibleSessionsCount, m: visibleGroupCount })}
                    </div>
                    <button
                        type="button"
                        onClick={props.onNewSession}
                        className="session-list-new-button rounded-full p-1.5 text-[var(--app-link)] transition-colors"
                        title={t('sessions.new')}
                    >
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
            ) : null}

            <div className="flex flex-col">
                {activeGroups.length > 0 ? (
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--app-hint)]">
                        {t('sessions.active.section')}
                    </div>
                ) : null}
                {renderGroups('active', activeGroups, false)}

                {hasArchivedSection ? (
                    <div className="sticky bottom-0 mt-4 border-t border-[var(--app-divider)] bg-[var(--app-secondary-bg)]/95 backdrop-blur">
                        <button
                            type="button"
                            onClick={() => setIsArchivedSectionCollapsed(prev => !prev)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                        >
                            <ChevronIcon
                                className="h-4 w-4 text-[var(--app-hint)]"
                                collapsed={isArchivedSectionCollapsed}
                            />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-hint)]">
                                {t('sessions.archived.section')}
                            </span>
                            <span className="ml-auto text-[11px] text-[var(--app-hint)]">
                                {t('sessions.archived.loaded', {
                                    n: props.archivedSessions.length,
                                    m: props.archivedTotal
                                })}
                            </span>
                        </button>

                        {!isArchivedSectionCollapsed ? (
                            <div className="border-t border-[var(--app-divider)] bg-[var(--app-bg)]">
                                {renderGroups('archived', archivedGroups, true)}

                                {props.hasMoreArchived ? (
                                    <div className="px-3 py-3">
                                        <button
                                            type="button"
                                            onClick={props.onLoadMoreArchived}
                                            disabled={props.isLoadingMoreArchived}
                                            className="w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {props.isLoadingMoreArchived
                                                ? t('sessions.archived.loadingMore')
                                                : t('sessions.archived.loadMore')}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
