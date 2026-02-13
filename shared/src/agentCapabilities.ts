import type { Metadata } from './schemas'
import type { AgentFlavor } from './modes'

export const AGENT_FLAVORS = ['claude', 'codex', 'gemini', 'opencode'] as const

export type ResumeTokenField =
    | 'claudeSessionId'
    | 'codexSessionId'
    | 'geminiSessionId'
    | 'opencodeSessionId'

export type AgentCapabilities = {
    flavor: AgentFlavor
    codexFamily: boolean
    supportsModelMode: boolean
    supportsPlugins: boolean
    supportsProjectSlashCommands: boolean
    resumeTokenField: ResumeTokenField
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
        resumeTokenField: 'claudeSessionId'
    },
    codex: {
        flavor: 'codex',
        codexFamily: true,
        supportsModelMode: false,
        supportsPlugins: false,
        supportsProjectSlashCommands: true,
        resumeTokenField: 'codexSessionId'
    },
    gemini: {
        flavor: 'gemini',
        codexFamily: true,
        supportsModelMode: false,
        supportsPlugins: false,
        supportsProjectSlashCommands: false,
        resumeTokenField: 'geminiSessionId'
    },
    opencode: {
        flavor: 'opencode',
        codexFamily: true,
        supportsModelMode: false,
        supportsPlugins: false,
        supportsProjectSlashCommands: false,
        resumeTokenField: 'opencodeSessionId'
    }
}

