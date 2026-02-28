import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Navigate,
    Outlet,
    createRootRoute,
    createRoute,
    createRouter,
    useLocation,
    useMatchRoute,
    useNavigate,
    useParams,
    useSearch,
} from '@tanstack/react-router'
import type { SessionSummary } from '@/types/api'
import { App } from '@/App'
import { SessionChat } from '@/components/SessionChat'
import { SessionList } from '@/components/SessionList'
import { NewSession } from '@/components/NewSession'
import { LoadingState } from '@/components/LoadingState'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { isTelegramApp } from '@/hooks/useTelegram'
import { useMessages } from '@/hooks/queries/useMessages'
import { useMachines } from '@/hooks/queries/useMachines'
import { isTransientSessionLoadErrorMessage, useSession } from '@/hooks/queries/useSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/use-translation'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'
import { resolveSessionIdForSend } from '@/lib/session-resume'
import FilesPage from '@/routes/sessions/files'
import FilePage from '@/routes/sessions/file'
import TerminalPage from '@/routes/sessions/terminal'
import SettingsPage from '@/routes/settings'
import E2EScrollPrependPage from '@/routes/__e2e__/scroll-prepend'
import E2EUpdateBannerPage from '@/routes/__e2e__/update-banner'

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
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

function SettingsIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    )
}

function ChevronIcon(props: { className?: string; direction: 'left' | 'right' }) {
    const points = props.direction === 'left'
        ? '15 18 9 12 15 6'
        : '9 18 15 12 9 6'

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points={points} />
        </svg>
    )
}

const SIDEBAR_WIDTH_STORAGE_KEY = 'hapi:sessions-sidebar-width'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'hapi:sessions-sidebar-collapsed'
const SIDEBAR_DEFAULT_WIDTH = 420
const SIDEBAR_MIN_WIDTH = 300
const SIDEBAR_MAX_WIDTH = 760
const SIDEBAR_COLLAPSED_WIDTH = 56
const SIDEBAR_WIDTH_CSS_VAR = '--sessions-sidebar-width'

function resolveSidebarMaxWidth(viewportWidth: number): number {
    const preferredMax = Math.floor(viewportWidth * 0.65)
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, preferredMax))
}

function clampSidebarWidth(rawWidth: number, viewportWidth: number): number {
    const minWidth = SIDEBAR_MIN_WIDTH
    const maxWidth = resolveSidebarMaxWidth(viewportWidth)
    return Math.min(Math.max(rawWidth, minWidth), maxWidth)
}

function readSidebarWidth(): number {
    if (typeof window === 'undefined') {
        return SIDEBAR_DEFAULT_WIDTH
    }

    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (raw === null) {
        return clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH, window.innerWidth)
    }

    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
        return clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH, window.innerWidth)
    }

    return clampSidebarWidth(parsed, window.innerWidth)
}

function readSidebarCollapsed(): boolean {
    if (typeof window === 'undefined') {
        return false
    }
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
}

function resolveQuickCreateAgent(flavor: string | null | undefined): 'claude' | 'codex' | 'gemini' | 'opencode' | undefined {
    if (flavor === 'claude' || flavor === 'codex' || flavor === 'gemini' || flavor === 'opencode') {
        return flavor
    }
    return undefined
}

function resolveQuickCreateModel(session: SessionSummary | null, agent: 'claude' | 'codex' | 'gemini' | 'opencode' | undefined): string | undefined {
    if (!session || agent !== 'claude') {
        return undefined
    }
    if (session.modelMode === 'sonnet') {
        return 'sonnet'
    }
    if (session.modelMode === 'opus') {
        return 'opus'
    }
    return undefined
}

function SessionsPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const [sidebarWidth, setSidebarWidth] = useState<number>(() => readSidebarWidth())
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => readSidebarCollapsed())
    const [isSidebarResizing, setIsSidebarResizing] = useState(false)
    const sidebarResizeStartXRef = useRef(0)
    const sidebarResizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH)
    const {
        activeSessions,
        archivedSessions,
        archivedTotal,
        isLoading,
        error,
        refetch
    } = useSessions(api)

    const handleRefresh = useCallback(() => {
        void refetch()
    }, [refetch])

    const handleQuickCreateInDirectory = useCallback((payload: {
        directory: string
        seedSession: SessionSummary | null
    }) => {
        const seedAgent = resolveQuickCreateAgent(payload.seedSession?.metadata?.flavor)
        const seedModel = resolveQuickCreateModel(payload.seedSession, seedAgent)

        navigate({
            to: '/sessions/new',
            search: {
                directory: payload.directory,
                machineId: payload.seedSession?.metadata?.machineId,
                agent: seedAgent,
                model: seedModel,
            }
        })
    }, [navigate])

    const visibleSessions = [...activeSessions, ...archivedSessions]
    const totalSessions = activeSessions.length + archivedTotal
    const projectCount = new Set(visibleSessions.map(s => s.metadata?.worktree?.basePath ?? s.metadata?.path ?? 'Other')).size
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const selectedSessionId = sessionMatch && sessionMatch.sessionId !== 'new' ? sessionMatch.sessionId : null
    const isSessionsIndex = pathname === '/sessions' || pathname === '/sessions/'
    const sidebarStyle = {
        [SIDEBAR_WIDTH_CSS_VAR]: `${isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth}px`,
    } as CSSProperties

    useEffect(() => {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
    }, [sidebarWidth])

    useEffect(() => {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isSidebarCollapsed ? 'true' : 'false')
    }, [isSidebarCollapsed])

    useEffect(() => {
        const handleWindowResize = () => {
            setSidebarWidth(prev => clampSidebarWidth(prev, window.innerWidth))
        }

        window.addEventListener('resize', handleWindowResize)
        return () => {
            window.removeEventListener('resize', handleWindowResize)
        }
    }, [])

    useEffect(() => {
        if (!isSidebarResizing) {
            return
        }

        const handlePointerMove = (event: PointerEvent) => {
            const delta = event.clientX - sidebarResizeStartXRef.current
            const nextWidth = sidebarResizeStartWidthRef.current + delta
            setSidebarWidth(clampSidebarWidth(nextWidth, window.innerWidth))
        }

        const stopResizing = () => {
            setIsSidebarResizing(false)
        }

        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', stopResizing)
        window.addEventListener('pointercancel', stopResizing)

        return () => {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', stopResizing)
            window.removeEventListener('pointercancel', stopResizing)
        }
    }, [isSidebarResizing])

    const handleSidebarResizeStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) {
            return
        }

        event.preventDefault()
        sidebarResizeStartXRef.current = event.clientX
        sidebarResizeStartWidthRef.current = sidebarWidth
        setIsSidebarResizing(true)
    }, [sidebarWidth])

    const collapseSidebar = useCallback(() => {
        setIsSidebarResizing(false)
        setIsSidebarCollapsed(true)
    }, [])

    const expandSidebar = useCallback(() => {
        setIsSidebarCollapsed(false)
    }, [])

    return (
        <div className="flex h-full min-h-0">
            <div
                className={[
                    isSessionsIndex ? 'flex' : 'hidden lg:flex',
                    'relative w-full shrink-0 min-h-0 flex-col bg-[var(--app-bg)] lg:border-r lg:border-[var(--app-divider)]',
                    'lg:w-[var(--sessions-sidebar-width)]'
                ].join(' ')}
                style={sidebarStyle}
            >
                <div className={`${isSidebarCollapsed ? 'lg:hidden' : ''} flex min-h-0 flex-1 flex-col`}>
                    <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                        <div className="mx-auto w-full max-w-content flex items-center justify-between px-3 py-2">
                            <div className="text-xs text-[var(--app-hint)]">
                                {t('sessions.count', { n: totalSessions, m: projectCount })}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/settings' })}
                                    className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                    title={t('settings.title')}
                                >
                                    <SettingsIcon className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/sessions/new', search: {} })}
                                    className="session-list-new-button p-1.5 rounded-full text-[var(--app-link)] transition-colors"
                                    title={t('sessions.new')}
                                >
                                    <PlusIcon className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={collapseSidebar}
                                    className="hidden lg:flex p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                    title={t('sessions.sidebar.collapse')}
                                    aria-label={t('sessions.sidebar.collapse')}
                                >
                                    <ChevronIcon direction="left" className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto desktop-scrollbar-left">
                        {error ? (
                            <div className="mx-auto w-full max-w-content px-3 py-2">
                                <div className="text-sm text-red-600">{error}</div>
                            </div>
                        ) : null}
                        <SessionList
                            activeSessions={activeSessions}
                            archivedSessions={archivedSessions}
                            archivedTotal={archivedTotal}
                            onQuickCreateInDirectory={handleQuickCreateInDirectory}
                            selectedSessionId={selectedSessionId}
                            onSelect={(sessionId) => navigate({
                                to: '/sessions/$sessionId',
                                params: { sessionId },
                            })}
                            onNewSession={() => navigate({ to: '/sessions/new', search: {} })}
                            onRefresh={handleRefresh}
                            isLoading={isLoading}
                            renderHeader={false}
                            api={api}
                        />
                    </div>
                </div>

                {isSidebarCollapsed ? (
                    <div className="hidden h-full min-h-0 lg:flex lg:flex-col">
                        <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                            <div className="flex items-center justify-center px-2 py-2">
                                <button
                                    type="button"
                                    onClick={expandSidebar}
                                    className="p-1.5 rounded-full text-[var(--app-hint)] hover:text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)] transition-colors"
                                    title={t('sessions.sidebar.expand')}
                                    aria-label={t('sessions.sidebar.expand')}
                                >
                                    <ChevronIcon direction="right" className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {isSidebarCollapsed ? null : (
                    <button
                        type="button"
                        onPointerDown={handleSidebarResizeStart}
                        className="hidden lg:block absolute top-0 right-0 z-20 h-full w-2 translate-x-1/2 cursor-col-resize"
                        title={t('sessions.sidebar.resize')}
                        aria-label={t('sessions.sidebar.resize')}
                    />
                )}
            </div>

            <div className={`${isSessionsIndex ? 'hidden lg:flex' : 'flex'} min-w-0 min-h-0 flex-1 flex-col bg-[var(--app-bg)]`}>
                <div className="flex-1 min-h-0">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

function SessionsIndexPage() {
    return null
}

function SessionPage() {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const {
        session,
        error: sessionError,
        refetch: refetchSession,
    } = useSession(api, sessionId)
    const {
        messages,
        warning: messagesWarning,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        loadMore: loadMoreMessages,
        refetch: refetchMessages,
        pendingCount,
        messagesVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId)
    const {
        sendMessage,
        retryMessage,
        isSending,
    } = useSendMessage(api, sessionId, {
        resolveSessionId: async (currentSessionId) => {
            if (!api) {
                return currentSessionId
            }
            try {
                return await resolveSessionIdForSend({
                    api,
                    sessionId: currentSessionId,
                    session: session && session.id === currentSessionId ? session : null,
                    syncSessionCache: (nextSession) => {
                        queryClient.setQueryData(queryKeys.session(currentSessionId), {
                            session: nextSession
                        })
                    }
                })
            } catch (error) {
                const raw = error instanceof Error ? error.message : 'Resume failed'
                const parsed = (() => {
                    const match = raw.match(/:\s*(\{[\s\S]*\})\s*$/)
                    if (!match) {
                        return null
                    }

                    try {
                        const obj = JSON.parse(match[1]) as { error?: unknown; code?: unknown }
                        const errorText = typeof obj.error === 'string' ? obj.error : null
                        const codeText = typeof obj.code === 'string' ? obj.code : null
                        return { error: errorText, code: codeText }
                    } catch {
                        return null
                    }
                })()

                const body = parsed?.error ?? raw
                const title = body.includes('Session is still starting')
                    ? 'Session is starting'
                    : parsed?.code === 'resume_unavailable' || body.includes('Resume session ID unavailable')
                        ? 'Resume unavailable'
                        : 'Resume failed'

                addToast({
                    title,
                    body,
                    sessionId: currentSessionId,
                    url: ''
                })
                throw error
            }
        },
        onSessionResolved: (resolvedSessionId) => {
            void (async () => {
                if (api) {
                    if (session && resolvedSessionId !== session.id) {
                        seedMessageWindowFromSession(session.id, resolvedSessionId)
                        queryClient.setQueryData(queryKeys.session(resolvedSessionId), {
                            session: { ...session, id: resolvedSessionId, active: true }
                        })
                    }
                    try {
                        await Promise.all([
                            queryClient.prefetchQuery({
                                queryKey: queryKeys.session(resolvedSessionId),
                                queryFn: () => api.getSession(resolvedSessionId),
                            }),
                            fetchLatestMessages(api, resolvedSessionId),
                        ])
                    } catch {
                    }
                }
                navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId: resolvedSessionId },
                    replace: true
                })
            })()
        },
        onBlocked: (reason) => {
            if (reason === 'no-api') {
                addToast({
                    title: t('send.blocked.title'),
                    body: t('send.blocked.noConnection'),
                    sessionId: sessionId ?? '',
                    url: ''
                })
            }
            // 'no-session' and 'pending' don't need toast - either invalid state or expected behavior
        }
    })
    // Get agent type from session metadata for slash commands
    const agentType = session?.metadata?.flavor ?? 'claude'
    const remoteMetadataReady = Boolean(session?.metadata?.machineId || session?.active)
    const {
        getSuggestions: getSlashSuggestions,
    } = useSlashCommands(api, sessionId, agentType, remoteMetadataReady)
    const {
        getSuggestions: getSkillSuggestions,
    } = useSkills(api, sessionId, remoteMetadataReady)

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) {
            return await getSkillSuggestions(query)
        }
        return await getSlashSuggestions(query)
    }, [getSkillSuggestions, getSlashSuggestions])

    const refreshSelectedSession = useCallback(() => {
        void refetchSession()
        void refetchMessages()
    }, [refetchMessages, refetchSession])

    if (!session) {
        if (sessionError && !isTransientSessionLoadErrorMessage(sessionError)) {
            return (
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg space-y-3 rounded-md border border-[var(--app-badge-error-border)] bg-[var(--app-badge-error-bg)] p-4 text-sm text-[var(--app-badge-error-text)]">
                        <div>{sessionError}</div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    void refetchSession()
                                }}
                                className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                            >
                                {t('button.retry')}
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate({ to: '/sessions' })}
                                className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                            >
                                {t('button.back')}
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        const loadingLabel = sessionError && isTransientSessionLoadErrorMessage(sessionError)
            ? t('loading.session.reconnecting')
            : t('loading.session')
        return (
            <div className="flex-1 flex items-center justify-center p-4">
                <LoadingState label={loadingLabel} className="text-sm" />
            </div>
        )
    }

    return (
        <SessionChat
            api={api}
            session={session}
            messages={messages}
            messagesWarning={messagesWarning}
            hasMoreMessages={messagesHasMore}
            isLoadingMessages={messagesLoading}
            isLoadingMoreMessages={messagesLoadingMore}
            isSending={isSending}
            pendingCount={pendingCount}
            messagesVersion={messagesVersion}
            onBack={goBack}
            onRefresh={refreshSelectedSession}
            onLoadMore={loadMoreMessages}
            onSend={sendMessage}
            onFlushPending={flushPending}
            onAtBottomChange={setAtBottom}
            onRetryMessage={retryMessage}
            autocompleteSuggestions={getAutocompleteSuggestions}
        />
    )
}

function SessionDetailRoute() {
    const pathname = useLocation({ select: location => location.pathname })
    const { sessionId } = useParams({ from: '/sessions/$sessionId' })
    const basePath = `/sessions/${sessionId}`
    const isChat = pathname === basePath || pathname === `${basePath}/`

    return isChat ? <SessionPage /> : <Outlet />
}

function NewSessionPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const { machines, isLoading: machinesLoading, error: machinesError } = useMachines(api, true)
    const search = useSearch({ from: '/sessions/new' })

    const handleCancel = useCallback(() => {
        navigate({ to: '/sessions' })
    }, [navigate])

    const handleSuccess = useCallback((sessionId: string) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        // Replace current page with /sessions to clear spawn flow from history
        navigate({ to: '/sessions', replace: true })
        // Then navigate to new session
        requestAnimationFrame(() => {
            navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
            })
        })
    }, [navigate, queryClient])

    return (
        <div className="flex h-full flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="flex items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] p-3">
                    {!isTelegramApp() && (
                        <button
                            type="button"
                            onClick={goBack}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        >
                            <BackIcon />
                        </button>
                    )}
                    <div className="flex-1 font-semibold">Create Session</div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                {machinesError ? (
                    <div className="p-3 text-sm text-red-600">
                        {machinesError}
                    </div>
                ) : null}

                <NewSession
                    api={api}
                    machines={machines}
                    isLoading={machinesLoading}
                    initialPreset={{
                        directory: search.directory,
                        machineId: search.machineId,
                        agent: search.agent,
                        model: search.model,
                        yoloMode: search.yolo,
                        sessionType: search.sessionType,
                    }}
                    onCancel={handleCancel}
                    onSuccess={handleSuccess}
                />
            </div>
        </div>
    )
}

const rootRoute = createRootRoute({
    component: App,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <Navigate to="/sessions" replace />,
})

const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions',
    component: SessionsPage,
})

const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    component: SessionsIndexPage,
})

const sessionDetailRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '$sessionId',
    component: SessionDetailRoute,
})

const sessionFilesRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'files',
    validateSearch: (search: Record<string, unknown>): { tab?: 'changes' | 'directories' } => {
        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined

        return tab ? { tab } : {}
    },
    component: FilesPage,
})

const sessionTerminalRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'terminal',
    component: TerminalPage,
})

type SessionFileSearch = {
    path: string
    staged?: boolean
    tab?: 'changes' | 'directories'
}

const sessionFileRoute = createRoute({
    getParentRoute: () => sessionDetailRoute,
    path: 'file',
    validateSearch: (search: Record<string, unknown>): SessionFileSearch => {
        const path = typeof search.path === 'string' ? search.path : ''
        const staged = search.staged === true || search.staged === 'true'
            ? true
            : search.staged === false || search.staged === 'false'
                ? false
                : undefined

        const tabValue = typeof search.tab === 'string' ? search.tab : undefined
        const tab = tabValue === 'directories'
            ? 'directories'
            : tabValue === 'changes'
                ? 'changes'
                : undefined

        const result: SessionFileSearch = { path }
        if (staged !== undefined) {
            result.staged = staged
        }
        if (tab !== undefined) {
            result.tab = tab
        }
        return result
    },
    component: FilePage,
})

type NewSessionSearch = {
    directory?: string
    machineId?: string
    agent?: 'claude' | 'codex' | 'gemini' | 'opencode'
    model?: string
    yolo?: boolean
    sessionType?: 'simple' | 'worktree'
}

const newSessionRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'new',
    validateSearch: (search: Record<string, unknown>): NewSessionSearch => {
        const directory = typeof search.directory === 'string' && search.directory.trim().length > 0
            ? search.directory.trim()
            : undefined

        const machineId = typeof search.machineId === 'string' && search.machineId.trim().length > 0
            ? search.machineId.trim()
            : undefined

        const agentValue = typeof search.agent === 'string' ? search.agent : undefined
        const agent = agentValue === 'claude' || agentValue === 'codex' || agentValue === 'gemini' || agentValue === 'opencode'
            ? agentValue
            : undefined

        const model = typeof search.model === 'string' && search.model.trim().length > 0
            ? search.model.trim()
            : undefined

        const yolo = search.yolo === true || search.yolo === 'true'
            ? true
            : search.yolo === false || search.yolo === 'false'
                ? false
                : undefined

        const sessionTypeValue = typeof search.sessionType === 'string' ? search.sessionType : undefined
        const sessionType = sessionTypeValue === 'simple' || sessionTypeValue === 'worktree'
            ? sessionTypeValue
            : undefined

        const result: NewSessionSearch = {}
        if (directory !== undefined) {
            result.directory = directory
        }
        if (machineId !== undefined) {
            result.machineId = machineId
        }
        if (agent !== undefined) {
            result.agent = agent
        }
        if (model !== undefined) {
            result.model = model
        }
        if (yolo !== undefined) {
            result.yolo = yolo
        }
        if (sessionType !== undefined) {
            result.sessionType = sessionType
        }
        return result
    },
    component: NewSessionPage,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsPage,
})

const e2eScrollPrependRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/__e2e__/scroll-prepend',
    component: E2EScrollPrependPage,
})

const e2eUpdateBannerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/__e2e__/update-banner',
    component: E2EUpdateBannerPage,
})

export const routeTree = rootRoute.addChildren([
    indexRoute,
    sessionsRoute.addChildren([
        sessionsIndexRoute,
        newSessionRoute,
        sessionDetailRoute.addChildren([
            sessionTerminalRoute,
            sessionFilesRoute,
            sessionFileRoute,
        ]),
    ]),
    settingsRoute,
    ...(import.meta.env.DEV ? [e2eScrollPrependRoute, e2eUpdateBannerRoute] : []),
])

type RouterHistory = Parameters<typeof createRouter>[0]['history']

export function createAppRouter(history?: RouterHistory) {
    return createRouter({
        routeTree,
        history,
        scrollRestoration: true,
    })
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
    interface Register {
        router: AppRouter
    }
}
