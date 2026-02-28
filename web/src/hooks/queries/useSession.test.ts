import { describe, expect, it } from 'vitest'
import { isTransientSessionLoadErrorMessage } from './useSession'

describe('isTransientSessionLoadErrorMessage', () => {
    it('returns true for transient upstream and transport errors', () => {
        expect(isTransientSessionLoadErrorMessage('HTTP 502 Bad Gateway: Upstream returned an HTML error page')).toBe(true)
        expect(isTransientSessionLoadErrorMessage('Failed to fetch')).toBe(true)
        expect(isTransientSessionLoadErrorMessage('HTTP 503 Service Unavailable')).toBe(true)
    })

    it('returns false for non-transient session load errors', () => {
        expect(isTransientSessionLoadErrorMessage('HTTP 404 Not Found: Session unavailable')).toBe(false)
        expect(isTransientSessionLoadErrorMessage('Session expired. Please sign in again.')).toBe(false)
    })
})
