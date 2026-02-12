import type { AgentType, SessionType } from './types'

const AGENT_STORAGE_KEY = 'hapi:newSession:agent'
const YOLO_STORAGE_KEY = 'hapi:newSession:yolo'
const PROJECT_PRESET_STORAGE_KEY = 'hapi:newSession:projectPresets'
const MAX_PROJECT_PRESETS = 80

const VALID_AGENTS: AgentType[] = ['claude', 'codex', 'gemini', 'opencode']
const VALID_SESSION_TYPES: SessionType[] = ['simple', 'worktree']

type StoredProjectPreset = {
    machineId?: string
    agent: AgentType
    model: string
    yoloMode: boolean
    sessionType: SessionType
    updatedAt: number
}

type ProjectPresetStore = Record<string, StoredProjectPreset>

export type ProjectPreset = Omit<StoredProjectPreset, 'updatedAt'>

function normalizeProjectKey(directory: string): string {
    return directory.trim()
}

function loadProjectPresetStore(): ProjectPresetStore {
    try {
        const raw = localStorage.getItem(PROJECT_PRESET_STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' ? parsed as ProjectPresetStore : {}
    } catch {
        return {}
    }
}

function saveProjectPresetStore(store: ProjectPresetStore): void {
    try {
        localStorage.setItem(PROJECT_PRESET_STORAGE_KEY, JSON.stringify(store))
    } catch {
        // Ignore storage errors
    }
}

function isValidProjectPreset(value: unknown): value is ProjectPreset {
    if (!value || typeof value !== 'object') {
        return false
    }

    const obj = value as Record<string, unknown>
    return typeof obj.agent === 'string'
        && VALID_AGENTS.includes(obj.agent as AgentType)
        && typeof obj.model === 'string'
        && typeof obj.yoloMode === 'boolean'
        && typeof obj.sessionType === 'string'
        && VALID_SESSION_TYPES.includes(obj.sessionType as SessionType)
        && (obj.machineId === undefined || typeof obj.machineId === 'string')
}

export function loadPreferredAgent(): AgentType {
    try {
        const stored = localStorage.getItem(AGENT_STORAGE_KEY)
        if (stored && VALID_AGENTS.includes(stored as AgentType)) {
            return stored as AgentType
        }
    } catch {
        // Ignore storage errors
    }
    return 'claude'
}

export function savePreferredAgent(agent: AgentType): void {
    try {
        localStorage.setItem(AGENT_STORAGE_KEY, agent)
    } catch {
        // Ignore storage errors
    }
}

export function loadPreferredYoloMode(): boolean {
    try {
        return localStorage.getItem(YOLO_STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

export function savePreferredYoloMode(enabled: boolean): void {
    try {
        localStorage.setItem(YOLO_STORAGE_KEY, enabled ? 'true' : 'false')
    } catch {
        // Ignore storage errors
    }
}

export function loadProjectPreset(directory: string): ProjectPreset | null {
    const key = normalizeProjectKey(directory)
    if (!key) {
        return null
    }

    const store = loadProjectPresetStore()
    const raw = store[key]
    if (!raw || !isValidProjectPreset(raw)) {
        return null
    }

    return {
        machineId: raw.machineId,
        agent: raw.agent,
        model: raw.model,
        yoloMode: raw.yoloMode,
        sessionType: raw.sessionType
    }
}

export function saveProjectPreset(directory: string, preset: ProjectPreset): void {
    const key = normalizeProjectKey(directory)
    if (!key || !isValidProjectPreset(preset)) {
        return
    }

    const store = loadProjectPresetStore()
    const nextStore: ProjectPresetStore = {
        ...store,
        [key]: {
            ...preset,
            updatedAt: Date.now()
        }
    }

    const entries = Object.entries(nextStore)
    if (entries.length > MAX_PROJECT_PRESETS) {
        entries
            .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
            .slice(0, entries.length - MAX_PROJECT_PRESETS)
            .forEach(([staleKey]) => {
                delete nextStore[staleKey]
            })
    }

    saveProjectPresetStore(nextStore)
}
