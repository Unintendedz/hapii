import { describe, expect, it } from 'bun:test'
import { getAgentCapabilities, getResumeTokenFromMetadata, normalizeAgentFlavor } from '@hapi/protocol'

describe('agentCapabilities', () => {
    it('normalizes unknown flavors to claude', () => {
        expect(normalizeAgentFlavor(null)).toBe('claude')
        expect(normalizeAgentFlavor(undefined)).toBe('claude')
        expect(normalizeAgentFlavor('wat' as never)).toBe('claude')
    })

    it('maps resume tokens by flavor', () => {
        expect(getResumeTokenFromMetadata({
            path: '/tmp',
            host: 'localhost',
            flavor: 'claude',
            claudeSessionId: 'claude-1'
        })).toBe('claude-1')

        expect(getResumeTokenFromMetadata({
            path: '/tmp',
            host: 'localhost',
            flavor: 'codex',
            codexSessionId: 'codex-1'
        })).toBe('codex-1')

        expect(getResumeTokenFromMetadata({
            path: '/tmp',
            host: 'localhost',
            flavor: 'gemini',
            geminiSessionId: 'gemini-1'
        })).toBe('gemini-1')

        expect(getResumeTokenFromMetadata({
            path: '/tmp',
            host: 'localhost',
            flavor: 'opencode',
            opencodeSessionId: 'open-1'
        })).toBe('open-1')
    })

    it('exposes explicit capabilities for claude', () => {
        const caps = getAgentCapabilities('claude')
        expect(caps.supportsModelMode).toBe(true)
        expect(caps.supportsReasoningEffort).toBe(false)
        expect(caps.supportsPlugins).toBe(true)
    })

    it('exposes explicit capabilities for codex family', () => {
        const caps = getAgentCapabilities('codex')
        expect(caps.supportsModelMode).toBe(false)
        expect(caps.supportsReasoningEffort).toBe(true)
        expect(caps.supportsPlugins).toBe(false)
        expect(caps.codexFamily).toBe(true)
    })
})
