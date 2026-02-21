import { describe, expect, it } from 'vitest'
import { getMarkdownAnchorRel } from './markdown-text'

describe('getMarkdownAnchorRel', () => {
    it('always includes noopener and noreferrer', () => {
        expect(getMarkdownAnchorRel()).toBe('noopener noreferrer')
        expect(getMarkdownAnchorRel('nofollow')).toBe('nofollow noopener noreferrer')
    })

    it('deduplicates existing tokens', () => {
        expect(getMarkdownAnchorRel('noopener noreferrer')).toBe('noopener noreferrer')
    })
})
