import { beforeEach, describe, expect, it } from 'vitest'
import {
    loadPreferredAgent,
    loadPreferredYoloMode,
    savePreferredAgent,
    savePreferredYoloMode,
    loadProjectPreset,
    saveProjectPreset,
} from './preferences'

describe('NewSession preferences', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('loads defaults when storage is empty', () => {
        expect(loadPreferredAgent()).toBe('claude')
        expect(loadPreferredYoloMode()).toBe(false)
    })

    it('loads saved values from storage', () => {
        localStorage.setItem('hapi:newSession:agent', 'codex')
        localStorage.setItem('hapi:newSession:yolo', 'true')

        expect(loadPreferredAgent()).toBe('codex')
        expect(loadPreferredYoloMode()).toBe(true)
    })

    it('falls back to default agent on invalid stored value', () => {
        localStorage.setItem('hapi:newSession:agent', 'unknown-agent')

        expect(loadPreferredAgent()).toBe('claude')
    })

    it('persists new values to storage', () => {
        savePreferredAgent('gemini')
        savePreferredYoloMode(true)

        expect(localStorage.getItem('hapi:newSession:agent')).toBe('gemini')
        expect(localStorage.getItem('hapi:newSession:yolo')).toBe('true')
    })

    it('saves and loads project presets', () => {
        saveProjectPreset('/tmp/project-a', {
            machineId: 'machine-1',
            agent: 'claude',
            model: 'sonnet',
            yoloMode: true,
            sessionType: 'simple'
        })

        expect(loadProjectPreset('/tmp/project-a')).toEqual({
            machineId: 'machine-1',
            agent: 'claude',
            model: 'sonnet',
            yoloMode: true,
            sessionType: 'simple'
        })
    })

    it('returns null for missing project presets', () => {
        expect(loadProjectPreset('/tmp/does-not-exist')).toBeNull()
    })
})
