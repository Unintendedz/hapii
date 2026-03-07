import { describe, expect, it } from 'vitest'
import {
    collectLongMessageHeadings,
    normalizeLongMessageHeadingSegment,
    shouldShowLongMessageJumpControls,
} from './long-message-navigation'

describe('normalizeLongMessageHeadingSegment', () => {
    it('keeps unicode letters and removes punctuation', () => {
        expect(normalizeLongMessageHeadingSegment('  第一部分：Overview!  ')).toBe('第一部分-overview')
    })

    it('falls back when the heading is empty after normalization', () => {
        expect(normalizeLongMessageHeadingSegment('***')).toBe('section')
    })
})

describe('shouldShowLongMessageJumpControls', () => {
    it('only enables controls when the block clearly exceeds the viewport', () => {
        expect(shouldShowLongMessageJumpControls(780, 700)).toBe(false)
        expect(shouldShowLongMessageJumpControls(781, 700)).toBe(true)
    })

    it('fails fast on invalid sizes', () => {
        expect(shouldShowLongMessageJumpControls(Number.NaN, 700)).toBe(false)
        expect(shouldShowLongMessageJumpControls(1200, 0)).toBe(false)
    })
})

describe('collectLongMessageHeadings', () => {
    it('collects h2-h4 headings and assigns stable unique ids', () => {
        const container = document.createElement('div')
        container.innerHTML = `
            <h1>Ignored</h1>
            <h2>Overview</h2>
            <h3>Plan</h3>
            <h2>Overview</h2>
            <h4>细节</h4>
        `

        const headings = collectLongMessageHeadings(container, 'msg-1')

        expect(headings).toEqual([
            { id: 'msg-1-overview', label: 'Overview', level: 2 },
            { id: 'msg-1-plan', label: 'Plan', level: 3 },
            { id: 'msg-1-overview-2', label: 'Overview', level: 2 },
            { id: 'msg-1-细节', label: '细节', level: 4 },
        ])
    })

    it('respects existing ids while still deduplicating collisions', () => {
        const container = document.createElement('div')
        container.innerHTML = `
            <h2 id="custom-id">Alpha</h2>
            <h2 id="custom-id">Beta</h2>
        `

        const headings = collectLongMessageHeadings(container, 'msg-2')

        expect(headings).toEqual([
            { id: 'custom-id', label: 'Alpha', level: 2 },
            { id: 'custom-id-2', label: 'Beta', level: 2 },
        ])
    })
})
