import type { Metadata } from './schemas'
import type { AgentFlavor } from './modes'

export const AGENT_FLAVORS = ['claude', 'codex', 'gemini', 'opencode'] as const

export type ResumeTokenField =
    | 'claudeSessionId'
    | 'codexSessionId'
    | 'geminiSessionId'
    | 'opencodeSessionId'

export type BuiltinSlashCommand = {
    name: string
    description: string
}

export type AgentCapabilities = {
    flavor: AgentFlavor
    codexFamily: boolean
    supportsModelMode: boolean
    supportsPlugins: boolean
    supportsProjectSlashCommands: boolean
    resumeTokenField: ResumeTokenField
    builtinSlashCommands: BuiltinSlashCommand[]
}

export function isAgentFlavor(value: unknown): value is AgentFlavor {
    return value === 'claude' || value === 'codex' || value === 'gemini' || value === 'opencode'
}

export function normalizeAgentFlavor(flavor?: string | null): AgentFlavor {
    if (flavor === 'codex' || flavor === 'gemini' || flavor === 'opencode' || flavor === 'claude') {
        return flavor
    }
    return 'claude'
}

export function isCodexFamilyFlavor(flavor?: string | null): boolean {
    const normalized = normalizeAgentFlavor(flavor)
    return normalized === 'codex' || normalized === 'gemini' || normalized === 'opencode'
}

export function isClaudeFlavor(flavor?: string | null): boolean {
    return normalizeAgentFlavor(flavor) === 'claude'
}

export function getAgentCapabilities(flavor?: string | null): AgentCapabilities {
    const normalized = normalizeAgentFlavor(flavor)
    return AGENT_CAPABILITIES[normalized]
}

export function getResumeTokenFieldForFlavor(flavor?: string | null): ResumeTokenField {
    return getAgentCapabilities(flavor).resumeTokenField
}

export function getResumeTokenFromMetadata(metadata?: Metadata | null): string | null {
    if (!metadata) {
        return null
    }

    const flavor = normalizeAgentFlavor(metadata.flavor ?? null)
    if (flavor === 'codex') {
        return metadata.codexSessionId?.trim() ? metadata.codexSessionId : null
    }
    if (flavor === 'gemini') {
        return metadata.geminiSessionId?.trim() ? metadata.geminiSessionId : null
    }
    if (flavor === 'opencode') {
        return metadata.opencodeSessionId?.trim() ? metadata.opencodeSessionId : null
    }
    return metadata.claudeSessionId?.trim() ? metadata.claudeSessionId : null
}

export const AGENT_CAPABILITIES: Record<AgentFlavor, AgentCapabilities> = {
    claude: {
        flavor: 'claude',
        codexFamily: false,
        supportsModelMode: true,
        supportsPlugins: true,
        supportsProjectSlashCommands: true,
        resumeTokenField: 'claudeSessionId',
        builtinSlashCommands: [
            { name: 'clear', description: 'Clear conversation history and free up context' },
            { name: 'compact', description: 'Clear conversation history but keep a summary in context' },
            { name: 'context', description: 'Visualize current context usage as a colored grid' },
            { name: 'cost', description: 'Show the total cost and duration of the current session' },
            { name: 'doctor', description: 'Diagnose and verify your Claude Code installation and settings' },
            { name: 'plan', description: 'View or open the current session plan' },
            { name: 'stats', description: 'Show your Claude Code usage statistics and activity' },
            { name: 'status', description: 'Show Claude Code status including version, model, account, and API connectivity' }
        ]
    },
    codex: {
        flavor: 'codex',
        codexFamily: true,
        supportsModelMode: false,
        supportsPlugins: false,
        supportsProjectSlashCommands: true,
        resumeTokenField: 'codexSessionId',
        builtinSlashCommands: [
            { name: 'review', description: 'Review current changes and find issues' },
            { name: 'new', description: 'Start a new chat during a conversation' },
            { name: 'compat', description: 'Summarize conversation to prevent hitting the context limit' },
            { name: 'undo', description: 'Ask Codex to undo a turn' },
            { name: 'diff', description: 'Show git diff including untracked files' },
            { name: 'status', description: 'Show current session configuration and token usage' }
        ]
    },
    gemini: {
        flavor: 'gemini',
        codexFamily: true,
        supportsModelMode: false,
        supportsPlugins: false,
        supportsProjectSlashCommands: false,
        resumeTokenField: 'geminiSessionId',
        builtinSlashCommands: [
            { name: 'about', description: 'Show version info' },
            { name: 'clear', description: 'Clear the screen and conversation history' },
            { name: 'compress', description: 'Compress the context by replacing it with a summary' },
            { name: 'stats', description: 'Check session stats' }
        ]
    },
    opencode: {
        flavor: 'opencode',
        codexFamily: true,
        supportsModelMode: false,
        supportsPlugins: false,
        supportsProjectSlashCommands: false,
        resumeTokenField: 'opencodeSessionId',
        builtinSlashCommands: []
    }
}
