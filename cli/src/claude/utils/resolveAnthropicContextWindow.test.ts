import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    resetAnthropicContextWindowProbeCacheForTests,
    resolveAnthropicContextWindowTokens
} from './resolveAnthropicContextWindow'

describe('resolveAnthropicContextWindowTokens', () => {
    const originalApiKey = process.env.ANTHROPIC_API_KEY
    const originalBaseUrl = process.env.ANTHROPIC_BASE_URL
    const fetchMock = vi.fn()

    beforeEach(() => {
        resetAnthropicContextWindowProbeCacheForTests()
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
        delete process.env.ANTHROPIC_API_KEY
        delete process.env.ANTHROPIC_BASE_URL
    })

    afterEach(() => {
        if (originalApiKey === undefined) {
            delete process.env.ANTHROPIC_API_KEY
        } else {
            process.env.ANTHROPIC_API_KEY = originalApiKey
        }

        if (originalBaseUrl === undefined) {
            delete process.env.ANTHROPIC_BASE_URL
        } else {
            process.env.ANTHROPIC_BASE_URL = originalBaseUrl
        }

        vi.unstubAllGlobals()
    })

    it('returns null when ANTHROPIC_API_KEY is unavailable', async () => {
        await expect(resolveAnthropicContextWindowTokens('claude-sonnet-4-6')).resolves.toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('uses the 1m beta probe for models with a [1m] suffix', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key'
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ max_input_tokens: 1_000_000 }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        }))

        await expect(resolveAnthropicContextWindowTokens('claude-sonnet-4-6[1m]')).resolves.toBe(1_000_000)

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://api.anthropic.com/v1/models/claude-sonnet-4-6')
        expect((init as RequestInit).headers).toMatchObject({
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'context-1m-2025-08-07',
            'x-api-key': 'test-key'
        })
    })

    it('falls back to the standard model probe when the 1m probe returns no positive max_input_tokens', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key'
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ max_input_tokens: 0 }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ max_input_tokens: 200_000 }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }))

        await expect(resolveAnthropicContextWindowTokens('sonnet[1m]')).resolves.toBe(200_000)

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(fetchMock.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/models/sonnet')
    })

    it('skips probing for custom Anthropic base URLs to avoid guessing gateway compatibility', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key'
        process.env.ANTHROPIC_BASE_URL = 'https://gateway.example.com'

        await expect(resolveAnthropicContextWindowTokens('claude-sonnet-4-6')).resolves.toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
