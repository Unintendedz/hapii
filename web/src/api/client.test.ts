import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiError } from './client'

function mockFetchOnce(response: Response): void {
    vi.stubGlobal('fetch', vi.fn(async () => response))
}

function mockFetchSequence(responses: Array<Response>): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => {
        const next = responses.shift()
        if (!next) {
            throw new Error('Unexpected fetch call')
        }
        return next
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

function expectApiError(error: unknown): ApiError {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
}

describe('ApiClient HTTP error formatting', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('summarizes HTML error pages instead of leaking raw markup into UI', async () => {
        mockFetchOnce(new Response(
            '<!DOCTYPE html><html><head><title>502</title></head><body>Bad gateway</body></html>',
            {
                status: 502,
                statusText: 'Bad Gateway',
                headers: { 'content-type': 'text/html; charset=UTF-8' }
            }
        ))

        const client = new ApiClient('token')
        let caught: unknown
        try {
            await client.getSession('session-1')
        } catch (error) {
            caught = error
        }

        const apiError = expectApiError(caught)
        expect(apiError.message).toBe('HTTP 502 Bad Gateway: Upstream returned an HTML error page')
        expect(apiError.message).not.toContain('<!DOCTYPE html>')
    })

    it('uses JSON error payloads for concise messages and stable error codes', async () => {
        mockFetchOnce(new Response(
            JSON.stringify({ error: 'Session is inactive', code: 'session_inactive' }),
            {
                status: 409,
                statusText: 'Conflict',
                headers: { 'content-type': 'application/json' }
            }
        ))

        const client = new ApiClient('token')
        let caught: unknown
        try {
            await client.getSession('session-1')
        } catch (error) {
            caught = error
        }

        const apiError = expectApiError(caught)
        expect(apiError.code).toBe('session_inactive')
        expect(apiError.message).toBe('HTTP 409 Conflict: Session is inactive')
    })

    it('retries idempotent GET request once on transient 502 response', async () => {
        const fetchMock = mockFetchSequence([
            new Response('<!DOCTYPE html><html><body>Bad Gateway</body></html>', {
                status: 502,
                statusText: 'Bad Gateway',
                headers: { 'content-type': 'text/html; charset=UTF-8' }
            }),
            new Response(JSON.stringify({
                session: {
                    id: 'session-1'
                }
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            })
        ])

        const client = new ApiClient('token')
        const result = await client.getSession('session-1')

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(result.session.id).toBe('session-1')
    })

    it('does not retry non-idempotent POST request on 502 response', async () => {
        const fetchMock = mockFetchSequence([
            new Response('<!DOCTYPE html><html><body>Bad Gateway</body></html>', {
                status: 502,
                statusText: 'Bad Gateway',
                headers: { 'content-type': 'text/html; charset=UTF-8' }
            })
        ])

        const client = new ApiClient('token')
        await expect(client.sendMessage('session-1', 'hello')).rejects.toThrow(
            'HTTP 502 Bad Gateway: Upstream returned an HTML error page'
        )
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
