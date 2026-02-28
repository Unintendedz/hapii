import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ApiClient } from '@/api/client'
import type { Machine, SessionSummary } from '@/types/api'
import { usePlatform } from '@/hooks/usePlatform'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useActiveSuggestions, type Suggestion } from '@/hooks/useActiveSuggestions'
import { useDirectorySuggestions } from '@/hooks/useDirectorySuggestions'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import type { AgentType, SessionType } from './types'
import { MODEL_OPTIONS } from './types'
import { ActionButtons } from './ActionButtons'
import { AgentSelector } from './AgentSelector'
import { DirectorySection } from './DirectorySection'
import { MachineSelector } from './MachineSelector'
import { ModelSelector } from './ModelSelector'
import {
    loadPreferredAgent,
    loadPreferredYoloMode,
    savePreferredAgent,
    savePreferredYoloMode,
    loadProjectPreset,
    saveProjectPreset,
} from './preferences'
import { SessionTypeSelector } from './SessionTypeSelector'
import { YoloToggle } from './YoloToggle'

export type NewSessionInitialPreset = {
    directory?: string
    machineId?: string
    agent?: AgentType
    model?: string
    yoloMode?: boolean
    sessionType?: SessionType
}

function hasSamePathExistence(
    current: Record<string, boolean>,
    next: Record<string, boolean>
): boolean {
    if (current === next) {
        return true
    }

    const currentKeys = Object.keys(current)
    const nextKeys = Object.keys(next)

    if (currentKeys.length !== nextKeys.length) {
        return false
    }

    for (const key of currentKeys) {
        if (current[key] !== next[key]) {
            return false
        }
    }

    return true
}

const SPAWN_RECOVERY_WINDOW_MS = 90_000

function isUncertainSpawnTransportError(rawMessage: string): boolean {
    const message = rawMessage.toLowerCase()
    return message.includes('http 502')
        || message.includes('bad gateway')
        || message.includes('upstream returned an html error page')
        || message.includes('failed to fetch')
        || message.includes('network error')
}

function findRecoveredSpawnSessionId(options: {
    sessions: SessionSummary[]
    knownSessionIds: Set<string>
    directory: string
    machineId: string
    requestedAt: number
}): string | null {
    const now = Date.now()
    const candidates = options.sessions.filter((session) => {
        if (options.knownSessionIds.has(session.id)) {
            return false
        }
        const metadata = session.metadata
        if (!metadata) {
            return false
        }
        if (metadata.path !== options.directory) {
            return false
        }
        if (metadata.machineId !== options.machineId) {
            return false
        }
        return session.updatedAt >= options.requestedAt - 3_000
            && session.updatedAt <= now + 5_000
    })

    if (candidates.length === 0) {
        return null
    }

    candidates.sort((a, b) => b.updatedAt - a.updatedAt)
    return candidates[0]?.id ?? null
}

export function NewSession(props: {
    api: ApiClient
    machines: Machine[]
    isLoading?: boolean
    initialPreset?: NewSessionInitialPreset
    onSuccess: (sessionId: string) => void
    onCancel: () => void
}) {
    const { haptic } = usePlatform()
    const { spawnSession, isPending, error: spawnError } = useSpawnSession(props.api)
    const { activeSessions, archivedSessions } = useSessions(props.api)
    const sessions = useMemo(
        () => [...activeSessions, ...archivedSessions],
        [activeSessions, archivedSessions]
    )
    const isFormDisabled = Boolean(isPending || props.isLoading)
    const { getRecentPaths, addRecentPath, getLastUsedMachineId, setLastUsedMachineId } = useRecentPaths()

    const [machineId, setMachineId] = useState<string | null>(null)
    const [directory, setDirectory] = useState('')
    const [suppressSuggestions, setSuppressSuggestions] = useState(false)
    const [isDirectoryFocused, setIsDirectoryFocused] = useState(false)
    const [pathExistence, setPathExistence] = useState<Record<string, boolean>>({})
    const [agent, setAgent] = useState<AgentType>(loadPreferredAgent)
    const [model, setModel] = useState('auto')
    const [yoloMode, setYoloMode] = useState(loadPreferredYoloMode)
    const [sessionType, setSessionType] = useState<SessionType>('simple')
    const [worktreeName, setWorktreeName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [initialPresetApplied, setInitialPresetApplied] = useState(false)
    const worktreeInputRef = useRef<HTMLInputElement>(null)
    const skipNextAgentModelReset = useRef(false)
    const checkedPathsSignatureRef = useRef('')
    const appliedPresetSignatureRef = useRef<string | null>(null)

    const presetDirectory = props.initialPreset?.directory?.trim() ?? ''
    const projectPreset = useMemo(
        () => (presetDirectory ? loadProjectPreset(presetDirectory) : null),
        [presetDirectory]
    )

    const mergedPreset = useMemo<NewSessionInitialPreset>(() => {
        return {
            directory: presetDirectory || undefined,
            machineId: projectPreset?.machineId ?? props.initialPreset?.machineId,
            agent: projectPreset?.agent ?? props.initialPreset?.agent,
            model: projectPreset?.model ?? props.initialPreset?.model,
            yoloMode: projectPreset?.yoloMode ?? props.initialPreset?.yoloMode,
            sessionType: projectPreset?.sessionType ?? props.initialPreset?.sessionType,
        }
    }, [presetDirectory, projectPreset, props.initialPreset])

    const presetSignature = useMemo(() => {
        return JSON.stringify({
            directory: mergedPreset.directory ?? null,
            machineId: mergedPreset.machineId ?? null,
            agent: mergedPreset.agent ?? null,
            model: mergedPreset.model ?? null,
            yoloMode: typeof mergedPreset.yoloMode === 'boolean' ? mergedPreset.yoloMode : null,
            sessionType: mergedPreset.sessionType ?? null,
        })
    }, [mergedPreset])

    useEffect(() => {
        if (sessionType === 'worktree') {
            worktreeInputRef.current?.focus()
        }
    }, [sessionType])

    useEffect(() => {
        if (skipNextAgentModelReset.current) {
            skipNextAgentModelReset.current = false
            return
        }
        setModel('auto')
    }, [agent])

    useEffect(() => {
        savePreferredAgent(agent)
    }, [agent])

    useEffect(() => {
        savePreferredYoloMode(yoloMode)
    }, [yoloMode])

    useEffect(() => {
        if (appliedPresetSignatureRef.current !== presetSignature) {
            setInitialPresetApplied(false)
        }
    }, [presetSignature])

    useEffect(() => {
        if (initialPresetApplied) {
            return
        }

        const hasPreset = Boolean(
            mergedPreset.directory
            || mergedPreset.machineId
            || mergedPreset.agent
            || mergedPreset.model
            || mergedPreset.sessionType
            || typeof mergedPreset.yoloMode === 'boolean'
        )

        if (!hasPreset) {
            setDirectory('')
            appliedPresetSignatureRef.current = presetSignature
            setInitialPresetApplied(true)
            return
        }

        if (mergedPreset.directory) {
            setDirectory(mergedPreset.directory)
        } else {
            setDirectory('')
        }
        if (mergedPreset.sessionType) {
            setSessionType(mergedPreset.sessionType)
        }
        if (typeof mergedPreset.yoloMode === 'boolean') {
            setYoloMode(mergedPreset.yoloMode)
        }

        if (mergedPreset.agent) {
            skipNextAgentModelReset.current = true
            setAgent(mergedPreset.agent)
        }

        if (mergedPreset.model) {
            const targetAgent = mergedPreset.agent ?? agent
            const isValidModel = MODEL_OPTIONS[targetAgent].some((option) => option.value === mergedPreset.model)
            setModel(isValidModel ? mergedPreset.model : 'auto')
        }

        if (mergedPreset.machineId) {
            if (props.machines.length === 0) {
                return
            }
            if (props.machines.some((machine) => machine.id === mergedPreset.machineId)) {
                setMachineId(mergedPreset.machineId)
            }
        }

        appliedPresetSignatureRef.current = presetSignature
        setInitialPresetApplied(true)
    }, [agent, initialPresetApplied, mergedPreset, presetSignature, props.machines])

    useEffect(() => {
        if (!initialPresetApplied) return
        if (props.machines.length === 0) return
        if (machineId && props.machines.find((m) => m.id === machineId)) return

        const lastUsed = getLastUsedMachineId()
        const foundLast = lastUsed ? props.machines.find((m) => m.id === lastUsed) : null

        if (foundLast) {
            setMachineId(foundLast.id)
        } else if (props.machines[0]) {
            setMachineId(props.machines[0].id)
        }
    }, [getLastUsedMachineId, initialPresetApplied, machineId, props.machines])

    const recentPaths = useMemo(
        () => getRecentPaths(machineId),
        [getRecentPaths, machineId]
    )

    const allPaths = useDirectorySuggestions(machineId, sessions, recentPaths)

    const pathsToCheck = useMemo(
        () => Array.from(new Set(allPaths)).slice(0, 300),
        [allPaths]
    )

    const pathsCheckSignature = useMemo(() => {
        if (!machineId || pathsToCheck.length === 0) {
            return ''
        }
        return `${machineId}\n${pathsToCheck.join('\n')}`
    }, [machineId, pathsToCheck])

    useEffect(() => {
        let cancelled = false

        if (!machineId || pathsToCheck.length === 0) {
            checkedPathsSignatureRef.current = ''
            setPathExistence((current) => (Object.keys(current).length === 0 ? current : {}))
            return () => { cancelled = true }
        }

        if (!isDirectoryFocused) {
            return () => { cancelled = true }
        }

        if (checkedPathsSignatureRef.current === pathsCheckSignature) {
            return () => { cancelled = true }
        }

        checkedPathsSignatureRef.current = pathsCheckSignature

        void props.api.checkMachinePathsExists(machineId, pathsToCheck)
            .then((result) => {
                if (cancelled) return
                const next = result.exists ?? {}
                setPathExistence((current) => (hasSamePathExistence(current, next) ? current : next))
            })
            .catch(() => {
                if (cancelled) return
                setPathExistence((current) => (Object.keys(current).length === 0 ? current : {}))
            })

        return () => {
            cancelled = true
        }
    }, [isDirectoryFocused, machineId, pathsCheckSignature, pathsToCheck, props.api])

    const verifiedPaths = useMemo(
        () => allPaths.filter((path) => pathExistence[path]),
        [allPaths, pathExistence]
    )

    const getSuggestions = useCallback(async (query: string): Promise<Suggestion[]> => {
        const lowered = query.toLowerCase()
        return verifiedPaths
            .filter((path) => path.toLowerCase().includes(lowered))
            .slice(0, 8)
            .map((path) => ({
                key: path,
                text: path,
                label: path
            }))
    }, [verifiedPaths])

    const activeQuery = (!isDirectoryFocused || suppressSuggestions) ? null : directory

    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeQuery,
        getSuggestions,
        { allowEmptyQuery: true, autoSelectFirst: false }
    )

    const handleMachineChange = useCallback((newMachineId: string) => {
        setMachineId(newMachineId)
    }, [])

    const handlePathClick = useCallback((path: string) => {
        setDirectory(path)
    }, [])

    const handleSuggestionSelect = useCallback((index: number) => {
        const suggestion = suggestions[index]
        if (suggestion) {
            setDirectory(suggestion.text)
            clearSuggestions()
            setSuppressSuggestions(true)
        }
    }, [suggestions, clearSuggestions])

    const handleDirectoryChange = useCallback((value: string) => {
        setSuppressSuggestions(false)
        setDirectory(value)
    }, [])

    const handleDirectoryFocus = useCallback(() => {
        setSuppressSuggestions(false)
        setIsDirectoryFocused(true)
    }, [])

    const handleDirectoryBlur = useCallback(() => {
        setIsDirectoryFocused(false)
    }, [])

    const handleDirectoryKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (suggestions.length === 0) return

        if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveUp()
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveDown()
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
            if (selectedIndex >= 0) {
                event.preventDefault()
                handleSuggestionSelect(selectedIndex)
            }
        }

        if (event.key === 'Escape') {
            clearSuggestions()
        }
    }, [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions, handleSuggestionSelect])

    async function handleCreate() {
        if (!machineId || !directory.trim()) return

        const trimmedDirectory = directory.trim()
        const knownSessionIds = new Set(sessions.map((session) => session.id))
        const requestedAt = Date.now()

        setError(null)
        try {
            const resolvedModel = model !== 'auto' && agent !== 'opencode' ? model : undefined
            const result = await spawnSession({
                machineId,
                directory: trimmedDirectory,
                agent,
                model: resolvedModel,
                yolo: yoloMode,
                sessionType,
                worktreeName: sessionType === 'worktree' ? (worktreeName.trim() || undefined) : undefined
            })

            if (result.type === 'success') {
                haptic.notification('success')
                setLastUsedMachineId(machineId)
                addRecentPath(machineId, trimmedDirectory)
                saveProjectPreset(trimmedDirectory, {
                    machineId,
                    agent,
                    model,
                    yoloMode,
                    sessionType
                })
                props.onSuccess(result.sessionId)
                return
            }

            haptic.notification('error')
            setError(result.message)
        } catch (e) {
            const rawMessage = e instanceof Error ? e.message : 'Failed to create session'

            if (isUncertainSpawnTransportError(rawMessage)) {
                try {
                    const recovered = await props.api.getSessions({ archived: false, limit: 200 })
                    const recoveredSessionId = findRecoveredSpawnSessionId({
                        sessions: recovered.sessions,
                        knownSessionIds,
                        directory: trimmedDirectory,
                        machineId,
                        requestedAt
                    })

                    if (recoveredSessionId && Date.now() - requestedAt <= SPAWN_RECOVERY_WINDOW_MS) {
                        haptic.notification('success')
                        setLastUsedMachineId(machineId)
                        addRecentPath(machineId, trimmedDirectory)
                        saveProjectPreset(trimmedDirectory, {
                            machineId,
                            agent,
                            model,
                            yoloMode,
                            sessionType
                        })
                        props.onSuccess(recoveredSessionId)
                        return
                    }
                } catch {
                }
            }

            haptic.notification('error')
            setError(rawMessage)
        }
    }

    const canCreate = Boolean(machineId && directory.trim() && !isFormDisabled)

    return (
        <div className="flex flex-col divide-y divide-[var(--app-divider)]">
            <MachineSelector
                machines={props.machines}
                machineId={machineId}
                isLoading={props.isLoading}
                isDisabled={isFormDisabled}
                onChange={handleMachineChange}
            />
            <DirectorySection
                directory={directory}
                suggestions={suggestions}
                selectedIndex={selectedIndex}
                isDisabled={isFormDisabled}
                recentPaths={recentPaths}
                onDirectoryChange={handleDirectoryChange}
                onDirectoryFocus={handleDirectoryFocus}
                onDirectoryBlur={handleDirectoryBlur}
                onDirectoryKeyDown={handleDirectoryKeyDown}
                onSuggestionSelect={handleSuggestionSelect}
                onPathClick={handlePathClick}
            />
            <SessionTypeSelector
                sessionType={sessionType}
                worktreeName={worktreeName}
                worktreeInputRef={worktreeInputRef}
                isDisabled={isFormDisabled}
                onSessionTypeChange={setSessionType}
                onWorktreeNameChange={setWorktreeName}
            />
            <AgentSelector
                agent={agent}
                isDisabled={isFormDisabled}
                onAgentChange={setAgent}
            />
            <ModelSelector
                agent={agent}
                model={model}
                isDisabled={isFormDisabled}
                onModelChange={setModel}
            />
            <YoloToggle
                yoloMode={yoloMode}
                isDisabled={isFormDisabled}
                onToggle={setYoloMode}
            />

            {(error ?? spawnError) ? (
                <div className="px-3 py-2 text-sm text-red-600">
                    {error ?? spawnError}
                </div>
            ) : null}

            <ActionButtons
                isPending={isPending}
                canCreate={canCreate}
                isDisabled={isFormDisabled}
                onCancel={props.onCancel}
                onCreate={handleCreate}
            />
        </div>
    )
}
