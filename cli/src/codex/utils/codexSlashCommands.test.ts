import { describe, expect, it } from 'vitest'
import { parseCodexNewCommand } from './codexSlashCommands'

describe('parseCodexNewCommand', () => {
    it('matches /new exactly', () => {
        expect(parseCodexNewCommand('/new')).toEqual({ isNew: true, remainder: '' })
        expect(parseCodexNewCommand('  /new  ')).toEqual({ isNew: true, remainder: '' })
    })

    it('matches /new with remainder', () => {
        expect(parseCodexNewCommand('/new hello')).toEqual({ isNew: true, remainder: 'hello' })
        expect(parseCodexNewCommand('/new\nhello')).toEqual({ isNew: true, remainder: 'hello' })
        expect(parseCodexNewCommand('/new\nhello\nworld')).toEqual({ isNew: true, remainder: 'hello\nworld' })
    })

    it('does not match prefixes', () => {
        expect(parseCodexNewCommand('/newer')).toEqual({ isNew: false, remainder: '' })
        expect(parseCodexNewCommand('hello /new')).toEqual({ isNew: false, remainder: '' })
    })
})
