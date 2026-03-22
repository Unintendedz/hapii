import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatusBar } from './StatusBar'
import { I18nContext } from '@/lib/i18n-context'

const messages: Record<string, string> = {
    'misc.offline': 'offline',
    'misc.online': 'online',
    'misc.permissionRequired': 'permission required',
    'misc.contextUsed': 'Used {tokens}',
    'misc.percentLeft': '{percent}% left',
    'misc.reasoning': 'Reasoning',
    'voice.connecting': 'connecting',
    'mode.reasoning.auto': 'Auto'
}

function t(key: string, params?: Record<string, string | number>): string {
    const template = messages[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, token) => {
        const value = params[token]
        return value === undefined ? match : String(value)
    })
}

describe('StatusBar', () => {
    it('shows used tokens when context window is unknown', () => {
        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <StatusBar
                    active
                    thinking={false}
                    agentState={null}
                    contextSize={37_000}
                />
            </I18nContext.Provider>
        )

        expect(screen.getByText(/Used/i)).toBeInTheDocument()
        expect(screen.queryByText(/% left/i)).not.toBeInTheDocument()
    })

    it('shows remaining percentage when context window is explicit', () => {
        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <StatusBar
                    active
                    thinking={false}
                    agentState={null}
                    contextSize={37_000}
                    contextWindowTokens={100_000}
                />
            </I18nContext.Provider>
        )

        expect(screen.getByText('63% left')).toBeInTheDocument()
    })
})
