import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEnvWithPrependedPath, resolveCodexExecutable } from './resolveCodexExecutable'

function writeExecutable(path: string): void {
    writeFileSync(path, '#!/bin/sh\necho codex\n', 'utf8')
    chmodSync(path, 0o755)
}

describe('resolveCodexExecutable', () => {
    it('resolves from HAPI_CODEX_BIN', () => {
        const binDir = mkdtempSync(join(tmpdir(), 'hapi-codex-bin-'))
        const codexPath = join(binDir, 'codex')
        writeExecutable(codexPath)

        const resolved = resolveCodexExecutable({
            env: { HAPI_CODEX_BIN: codexPath, PATH: '' },
            homeDir: '/tmp'
        })

        expect(resolved).toEqual({ command: codexPath, binDir })
    })

    it('resolves from PATH', () => {
        const binDir = mkdtempSync(join(tmpdir(), 'hapi-codex-path-'))
        const codexPath = join(binDir, 'codex')
        writeExecutable(codexPath)

        const resolved = resolveCodexExecutable({
            env: { PATH: binDir },
            homeDir: '/tmp'
        })

        expect(resolved).toEqual({ command: codexPath, binDir })
    })

    it('resolves from NVM_DIR versions (highest version wins)', () => {
        const homeDir = mkdtempSync(join(tmpdir(), 'hapi-home-'))
        const nvmDir = join(homeDir, '.nvm')

        const v18Bin = join(nvmDir, 'versions', 'node', 'v18.0.0', 'bin')
        mkdirSync(v18Bin, { recursive: true })
        writeExecutable(join(v18Bin, 'codex'))

        const v22Bin = join(nvmDir, 'versions', 'node', 'v22.15.0', 'bin')
        mkdirSync(v22Bin, { recursive: true })
        writeExecutable(join(v22Bin, 'codex'))

        const resolved = resolveCodexExecutable({
            env: { PATH: '/usr/bin:/bin', NVM_DIR: nvmDir },
            homeDir
        })

        expect(resolved).toEqual({ command: join(v22Bin, 'codex'), binDir: v22Bin })
    })
})

describe('buildEnvWithPrependedPath', () => {
    it('prepends binDir and preserves existing PATH', () => {
        const env = buildEnvWithPrependedPath({ PATH: '/usr/bin:/bin' }, '/tmp/bin')
        expect(env.PATH.startsWith('/tmp/bin')).toBe(true)
        expect(env.PATH.includes('/usr/bin')).toBe(true)
    })

    it('does not duplicate binDir', () => {
        const env = buildEnvWithPrependedPath({ PATH: '/tmp/bin:/usr/bin:/bin' }, '/tmp/bin')
        expect(env.PATH.split(':').filter((part) => part === '/tmp/bin')).toHaveLength(1)
    })
})

